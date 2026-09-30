package com.hqyj.ka.wallet.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.sysconfig.service.ConfigService;
import com.hqyj.ka.wallet.entity.WalletAccount;
import com.hqyj.ka.wallet.entity.WalletTxn;
import com.hqyj.ka.wallet.entity.WithdrawRequest;
import com.hqyj.ka.wallet.repo.WalletAccountRepository;
import com.hqyj.ka.wallet.repo.WalletTxnRepository;
import com.hqyj.ka.wallet.repo.WithdrawRequestRepository;
import lombok.RequiredArgsConstructor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.LockModeType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 钱包核心:所有余额变动 = 原子 UPDATE(守卫)+ 流水落账,同一事务内要么全成要么全回滚。
 * 提现审核采用「先 CAS 抢状态、再动钱」次序,双管理员并发审核只有一人生效。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WalletService {

    private final WalletAccountRepository accountRepository;
    private final WalletTxnRepository txnRepository;
    private final WithdrawRequestRepository withdrawRepository;
    private final ConfigService configService;
    private final WithdrawMethodService withdrawMethodService;
    private final WithdrawPayoutService withdrawPayoutService;
    @PersistenceContext
    private EntityManager entityManager;

    /**
     * 确保钱包存在。正常路径:注册事务内已建(无并发);此处兜底存量会员。
     * 不做 catch-重试(同事务内唯一键冲突已把 TX 标记 rollback-only,重试无意义)。
     */
    @Transactional
    public WalletAccount ensureAccount(Long memberId) {
        return accountRepository.findByMemberId(memberId).orElseGet(() -> {
            WalletAccount account = new WalletAccount();
            account.setMemberId(memberId);
            return accountRepository.save(account);
        });
    }

    /** 入账(充值 / 佣金 / 管理员加款)。 */
    @Transactional
    public void credit(Long memberId, BigDecimal amount, WalletTxn.Type type,
                       String refType, Long refId, String remark) {
        if (memberId == null || amount == null || amount.signum() <= 0) return;
        if (amount.scale() > 2) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "入账金额精度无效");
        }
        WalletAccount account = lockedAccount(memberId);
        BigDecimal withdrawable = BigDecimal.ZERO;
        if (type == WalletTxn.Type.COMMISSION) withdrawable = amount;
        if (type == WalletTxn.Type.ADMIN_REFUND || type == WalletTxn.Type.WALLET_ORDER_REFUND) {
            // 只恢复同一会员、同一订单中尚未退还的可提现资金;外部支付退款进入购物钱包。
            BigDecimal outstanding = BigDecimal.ZERO;
            if (refId != null && refType != null) {
                for (WalletTxn t : txnRepository.findByMemberIdAndRefTypeAndRefIdOrderByIdAsc(memberId, refType, refId)) {
                    if (t.getWithdrawableAmount() != null && (t.getType() == WalletTxn.Type.PURCHASE
                            || t.getType() == WalletTxn.Type.ADMIN_REFUND || t.getType() == WalletTxn.Type.WALLET_ORDER_REFUND)) {
                        outstanding = outstanding.subtract(t.getWithdrawableAmount());
                    }
                }
            }
            withdrawable = outstanding.max(BigDecimal.ZERO).min(amount);
        }
        account.setBalance(account.getBalance().add(amount));
        account.setWithdrawableBalance(account.getWithdrawableBalance().add(withdrawable));
        persistTxn(account, type, amount.subtract(withdrawable), withdrawable, refType, refId, remark);
    }

    /** 购物优先使用购物钱包;撤销充值只能扣回购物钱包。 */
    @Transactional
    public void debit(Long memberId, BigDecimal amount, WalletTxn.Type type,
                      String refType, Long refId, String remark) {
        validateAmount(memberId, amount);
        WalletAccount account = lockedAccount(memberId);
        BigDecimal shopping = account.getShoppingBalance().min(amount);
        BigDecimal withdrawable = amount.subtract(shopping);
        if (account.getBalance().compareTo(amount) < 0
                || (type == WalletTxn.Type.RECHARGE_REVERSAL && withdrawable.signum() > 0)) {
            throw new BusinessException(ErrorCode.BALANCE_NOT_ENOUGH);
        }
        account.setBalance(account.getBalance().subtract(amount));
        account.setWithdrawableBalance(account.getWithdrawableBalance().subtract(withdrawable));
        persistTxn(account, type, shopping.negate(), withdrawable.negate(), refType, refId, remark);
    }

    @Transactional(readOnly = true)
    public BigDecimal balance(Long memberId) {
        if (memberId == null) return BigDecimal.ZERO;
        return accountRepository.findByMemberId(memberId).map(WalletAccount::getBalance).orElse(BigDecimal.ZERO);
    }

    /** 风控冻结独立于提现占用;按购物钱包优先冻结,分别记账。 */
    @Transactional
    public void adminFreeze(Long memberId, BigDecimal amount, String actor, String note) {
        validateAmount(memberId, amount);
        WalletAccount a = lockedAccount(memberId);
        if (a.getBalance().compareTo(amount) < 0) throw new BusinessException(ErrorCode.BALANCE_NOT_ENOUGH);
        BigDecimal shopping = a.getShoppingBalance().min(amount);
        BigDecimal withdrawable = amount.subtract(shopping);
        a.setBalance(a.getBalance().subtract(amount));
        a.setWithdrawableBalance(a.getWithdrawableBalance().subtract(withdrawable));
        a.setFrozen(a.getFrozen().add(amount));
        a.setWithdrawableFrozen(a.getWithdrawableFrozen().add(withdrawable));
        persistTxn(a, WalletTxn.Type.ADMIN_FREEZE, shopping.negate(), withdrawable.negate(),
                "MANUAL", null, "管理员冻结 " + actor + remarkSuffix(note));
    }

    /** 只释放风控冻结,退回原钱包;无法释放任何提现占用。 */
    @Transactional
    public void adminUnfreeze(Long memberId, BigDecimal amount, String actor, String note) {
        validateAmount(memberId, amount);
        WalletAccount a = lockedAccount(memberId);
        if (a.getFrozen().compareTo(amount) < 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "风控冻结余额不足;提现占用请到提现审核处理");
        }
        BigDecimal shopping = a.getShoppingFrozen().min(amount);
        BigDecimal withdrawable = amount.subtract(shopping);
        a.setFrozen(a.getFrozen().subtract(amount));
        a.setWithdrawableFrozen(a.getWithdrawableFrozen().subtract(withdrawable));
        a.setBalance(a.getBalance().add(amount));
        a.setWithdrawableBalance(a.getWithdrawableBalance().add(withdrawable));
        persistTxn(a, WalletTxn.Type.ADMIN_UNFREEZE, shopping, withdrawable,
                "MANUAL", null, "管理员解冻 " + actor + remarkSuffix(note));
    }

    /** 提现申请:门槛校验 → 单笔待审限制 → 冻结余额 → 建申请单 + 冻结流水。 */
    @Transactional
    public WithdrawRequest requestWithdraw(Long memberId, BigDecimal amount, String channel, String account,
                                           String accountName, String bankName) {
        if (amount == null || amount.scale() > 2 || amount.signum() <= 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "提现金额无效");
        }
        if (amount.compareTo(minWithdraw()) < 0) {
            throw new BusinessException(ErrorCode.WITHDRAW_MIN);
        }
        WalletAccount wallet = lockedAccount(memberId);
        if (!withdrawRepository.lockByMemberIdAndStatus(memberId, WithdrawRequest.Status.PENDING).isEmpty()) {
            throw new BusinessException(ErrorCode.WITHDRAW_PENDING_EXISTS);
        }
        WithdrawMethodService.Normalized recipient = withdrawMethodService.validate(channel, account, accountName, bankName);
        WithdrawMethodService.FeeQuote fee = withdrawMethodService.feeQuote(recipient.code(), amount);
        if (wallet.getWithdrawableBalance().compareTo(amount) < 0) {
            throw new BusinessException(ErrorCode.BALANCE_NOT_ENOUGH, "可提现余额不足;购物余额不可提现");
        }
        wallet.setBalance(wallet.getBalance().subtract(amount));
        wallet.setWithdrawableBalance(wallet.getWithdrawableBalance().subtract(amount));
        wallet.setWithdrawalFrozen(wallet.getWithdrawalFrozen().add(amount));
        WithdrawRequest request = new WithdrawRequest();
        request.setMemberId(memberId);
        request.setAmount(amount);
        request.setFeeAmount(fee.feeAmount());
        request.setNetAmount(fee.netAmount());
        request.setChannel(recipient.code());
        request.setAccount(recipient.account());
        request.setAccountName(recipient.accountName());
        request.setBankName(recipient.bankName());
        withdrawPayoutService.snapshot(request);
        request = withdrawRepository.save(request);
        persistTxn(wallet, WalletTxn.Type.WITHDRAW_FREEZE, BigDecimal.ZERO, amount.negate(),
                "WITHDRAW", request.getId(), "提现申请冻结");
        return request;
    }

    /**
     * 提现审核。次序安全关键:先 casStatus 抢占(0 行 = 已被他人处理),再动钱。
     * 通过:核销冻结,线下打款,WithdrawRequest 本身即打款凭证(不再记流水);
     * 驳回:解冻退回 + WITHDRAW_REJECT 流水。
     */
    @Transactional
    public WithdrawRequest reviewWithdraw(Long id, boolean approve, String reviewer, String note) {
        String reviewNote = normalizeReviewNote(approve, note);
        WithdrawRequest existing = withdrawRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.WITHDRAW_STATE));
        // 与申请、手动解冻保持一致的锁顺序:先钱包,再提现状态 CAS。
        lockedAccount(existing.getMemberId());
        WithdrawRequest.Status target = approve ? WithdrawRequest.Status.APPROVED : WithdrawRequest.Status.REJECTED;
        if (withdrawRepository.casStatus(id, WithdrawRequest.Status.PENDING, target) == 0) {
            throw new BusinessException(ErrorCode.WITHDRAW_STATE);
        }
        WithdrawRequest request = withdrawRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.WITHDRAW_STATE));
        // CAS 会清理持久化上下文,重新取得受同一事务行锁保护的钱包。
        WalletAccount wallet = lockedAccount(request.getMemberId());
        if (wallet.getWithdrawalFrozen().compareTo(request.getAmount()) < 0) {
            throw new BusinessException(ErrorCode.WITHDRAW_STATE, "提现冻结异常,请核对流水后重试");
        }
        if (approve && request.getChannel().startsWith("USDT_") && request.getPayoutAmount() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "旧申请缺少 USDT 打款汇率快照,请驳回并请会员重新申请");
        }
        wallet.setWithdrawalFrozen(wallet.getWithdrawalFrozen().subtract(request.getAmount()));
        if (approve) {
            accountRepository.saveAndFlush(wallet);
        } else {
            BigDecimal withdrawable = request.isWithdrawableSource() ? request.getAmount() : BigDecimal.ZERO;
            wallet.setBalance(wallet.getBalance().add(request.getAmount()));
            wallet.setWithdrawableBalance(wallet.getWithdrawableBalance().add(withdrawable));
            persistTxn(wallet, WalletTxn.Type.WITHDRAW_REJECT, request.getAmount().subtract(withdrawable), withdrawable,
                    "WITHDRAW", request.getId(), request.isWithdrawableSource() ? "提现驳回退回可提现余额" : "历史提现驳回退回购物余额");
        }
        request.setReviewedBy(reviewer);
        request.setReviewNote(reviewNote);
        request.setReviewedAt(LocalDateTime.now());
        return request;
    }

    /** 最低提现金额(sysconfig wallet.min_withdraw,默认 10)。 */
    public BigDecimal minWithdraw() {
        try {
            return new BigDecimal(configService.all().getOrDefault("wallet.min_withdraw", "10").trim());
        } catch (NumberFormatException e) {
            return BigDecimal.TEN;
        }
    }

    private WalletAccount lockedAccount(Long memberId) {
        ensureAccount(memberId);
        WalletAccount account = accountRepository.lockByMemberId(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "钱包不存在"));
        // 父事务可能已读取钱包;行锁后刷新一级缓存,避免用等待锁前的余额覆盖并发提交。
        entityManager.refresh(account, LockModeType.PESSIMISTIC_WRITE);
        return account;
    }

    private void validateAmount(Long memberId, BigDecimal amount) {
        if (memberId == null || amount == null || amount.scale() > 2 || amount.signum() <= 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "金额无效");
        }
    }

    private void persistTxn(WalletAccount a, WalletTxn.Type type, BigDecimal shopping, BigDecimal withdrawable,
                            String refType, Long refId, String remark) {
        accountRepository.saveAndFlush(a);
        WalletTxn txn = new WalletTxn();
        txn.setMemberId(a.getMemberId());
        txn.setType(type);
        txn.setAmount(shopping.add(withdrawable));
        txn.setBalanceAfter(a.getBalance());
        txn.setShoppingAmount(shopping);
        txn.setWithdrawableAmount(withdrawable);
        txn.setShoppingBalanceAfter(a.getShoppingBalance());
        txn.setWithdrawableBalanceAfter(a.getWithdrawableBalance());
        txn.setRefType(refType);
        txn.setRefId(refId);
        txn.setRemark(remark);
        txnRepository.save(txn);
    }

    private String remarkSuffix(String note) {
        return note == null || note.isBlank() ? "" : ": " + note.trim();
    }

    private String normalizeReviewNote(boolean approve, String note) {
        if (note != null && !note.isBlank()) return note.trim();
        if (!approve) throw new BusinessException(ErrorCode.BAD_REQUEST, "请填写具体的驳回原因,会员将看到此说明");
        return null;
    }
}
