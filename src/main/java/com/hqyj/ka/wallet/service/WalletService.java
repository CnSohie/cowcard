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
        ensureAccount(memberId);
        accountRepository.credit(memberId, amount);
        writeTxn(memberId, type, amount, refType, refId, remark);
    }

    /** 出账(消费):余额不足抛 BALANCE_NOT_ENOUGH(原子守卫,防双花)。 */
    @Transactional
    public void debit(Long memberId, BigDecimal amount, WalletTxn.Type type,
                      String refType, Long refId, String remark) {
        if (memberId == null || amount == null || amount.scale() > 2 || amount.signum() <= 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "出账金额无效");
        }
        ensureAccount(memberId);
        if (accountRepository.debit(memberId, amount) == 0) {
            throw new BusinessException(ErrorCode.BALANCE_NOT_ENOUGH);
        }
        writeTxn(memberId, type, amount.negate(), refType, refId, remark);
    }

    @Transactional(readOnly = true)
    public BigDecimal balance(Long memberId) {
        if (memberId == null) return BigDecimal.ZERO;
        return accountRepository.findByMemberId(memberId).map(WalletAccount::getBalance).orElse(BigDecimal.ZERO);
    }

    /** 管理员风控冻结:只做可用->冻结的原子搬移,不凭空增减总资产。 */
    @Transactional
    public void adminFreeze(Long memberId, BigDecimal amount, String actor, String note) {
        if (amount == null || amount.scale() > 2 || amount.signum() <= 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "冻结金额无效");
        }
        ensureAccount(memberId);
        if (accountRepository.freeze(memberId, amount) == 0) {
            throw new BusinessException(ErrorCode.BALANCE_NOT_ENOUGH);
        }
        writeTxn(memberId, WalletTxn.Type.ADMIN_FREEZE, amount.negate(),
                "MANUAL", null, "管理员冻结 " + actor + remarkSuffix(note));
    }

    /** 管理员解冻:冻结->可用,同样写流水方便对账。 */
    @Transactional
    public void adminUnfreeze(Long memberId, BigDecimal amount, String actor, String note) {
        if (amount == null || amount.scale() > 2 || amount.signum() <= 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "解冻金额无效");
        }
        ensureAccount(memberId);
        accountRepository.lockByMemberId(memberId).orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "钱包不存在"));
        if (!withdrawRepository.lockByMemberIdAndStatus(memberId, WithdrawRequest.Status.PENDING).isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "该会员有待审核提现，请先在提现审核中处理；退回提现金额请使用驳回，不能手动解冻");
        }
        if (accountRepository.unfreeze(memberId, amount) == 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "冻结余额不足");
        }
        writeTxn(memberId, WalletTxn.Type.ADMIN_UNFREEZE, amount,
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
        ensureAccount(memberId);
        accountRepository.lockByMemberId(memberId).orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "钱包不存在"));
        if (!withdrawRepository.lockByMemberIdAndStatus(memberId, WithdrawRequest.Status.PENDING).isEmpty()) {
            throw new BusinessException(ErrorCode.WITHDRAW_PENDING_EXISTS);
        }
        WithdrawMethodService.Normalized recipient = withdrawMethodService.validate(channel, account, accountName, bankName);
        WithdrawMethodService.FeeQuote fee = withdrawMethodService.feeQuote(recipient.code(), amount);
        if (accountRepository.freeze(memberId, amount) == 0) {
            throw new BusinessException(ErrorCode.BALANCE_NOT_ENOUGH);
        }
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
        writeTxn(memberId, WalletTxn.Type.WITHDRAW_FREEZE, amount.negate(),
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
        accountRepository.lockByMemberId(existing.getMemberId())
                .orElseThrow(() -> new BusinessException(ErrorCode.WITHDRAW_STATE, "钱包不存在"));
        WithdrawRequest.Status target = approve ? WithdrawRequest.Status.APPROVED : WithdrawRequest.Status.REJECTED;
        if (withdrawRepository.casStatus(id, WithdrawRequest.Status.PENDING, target) == 0) {
            throw new BusinessException(ErrorCode.WITHDRAW_STATE);
        }
        WithdrawRequest request = withdrawRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.WITHDRAW_STATE));
        if (approve) {
            if (request.getChannel().startsWith("USDT_") && request.getPayoutAmount() == null) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "旧申请缺少 USDT 打款汇率快照,请驳回并请会员重新申请");
            }
            if (accountRepository.consumeFrozen(request.getMemberId(), request.getAmount()) == 0) {
                // 冻结额被异常动过:回滚整个审核事务(状态连同回退),人工排查
                throw new BusinessException(ErrorCode.WITHDRAW_STATE, "冻结余额异常,请核对流水后重试");
            }
        } else {
            if (accountRepository.unfreeze(request.getMemberId(), request.getAmount()) == 0) {
                throw new BusinessException(ErrorCode.WITHDRAW_STATE, "冻结余额异常,请核对流水后重试");
            }
            writeTxn(request.getMemberId(), WalletTxn.Type.WITHDRAW_REJECT, request.getAmount(),
                    "WITHDRAW", request.getId(), "提现驳回退回");
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

    /** 流水落账:清缓存后重读余额作为 balanceAfter 快照(与原子 UPDATE 同事务)。 */
    private void writeTxn(Long memberId, WalletTxn.Type type, BigDecimal signedAmount,
                          String refType, Long refId, String remark) {
        BigDecimal after = accountRepository.findByMemberId(memberId)
                .map(WalletAccount::getBalance).orElse(BigDecimal.ZERO);
        WalletTxn txn = new WalletTxn();
        txn.setMemberId(memberId);
        txn.setType(type);
        txn.setAmount(signedAmount);
        txn.setBalanceAfter(after);
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
