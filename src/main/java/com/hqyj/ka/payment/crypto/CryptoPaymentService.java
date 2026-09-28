package com.hqyj.ka.payment.crypto;

import tools.jackson.databind.JsonNode;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent;
import com.hqyj.ka.payment.crypto.repo.CryptoPaymentIntentRepository;
import com.hqyj.ka.payment.service.SettlementService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 加密支付核心:唯一金额分配、意向单生命周期、钱包直付 txHash 校验、确认达标入账。
 * 两种模式共用唯一尾数金额 → 链上金额即订单指纹,杜绝同额订单串单。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CryptoPaymentService {

    private static final SecureRandom RANDOM = new SecureRandom();
    /** 尾数空间:1..9999 最小单位(≤0.009999 USDC),对买家成本可忽略 */
    private static final int TAIL_SPACE = 9999;
    private static final int MAX_ALLOC_RETRY = 6;

    private final CryptoPaymentIntentRepository intentRepository;
    private final AppProperties props;
    private final MerchantAddressProvider merchantAddressProvider;
    private final ChainRpcClient rpc;
    private final FxRateService fxRateService;
    private final SettlementService settlementService;

    /** 前台展示的链/代币选项。 */
    public List<Map<String, Object>> options() {
        return props.getCrypto().getChains().stream().filter(AppProperties.Chain::isEnabled)
                .<Map<String, Object>>map(c -> Map.of(
                        "chainCode", c.getCode(),
                        "chainId", c.getChainId(),
                        "confirmations", c.getConfirmations(),
                        "tokens", c.getTokens().stream().map(t -> Map.of(
                                "symbol", t.getSymbol(), "contract", t.getContract(),
                                "decimals", t.getDecimals())).toList()))
                .toList();
    }

    /**
     * 创建收款意向:CNY → USD(向上取整 2 位) + 唯一尾数;唯一约束冲突则换尾数重试。
     * 同订单、同模式、同链、同币在有效期内始终复用；切换链/币时保留各自意向，切回来金额不变。
     */
    @Transactional
    public CryptoPaymentIntent createIntent(Order order, BigDecimal sitePayAmount, String chainCode, String tokenSymbol,
                                            CryptoPaymentIntent.Mode mode) {
        AppProperties.Chain chain = findChain(chainCode);
        AppProperties.Token token = chain.getTokens().stream()
                .filter(t -> t.getSymbol().equalsIgnoreCase(tokenSymbol)).findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.CHANNEL_DISABLED));
        String merchant = merchantAddressProvider.current();
        if (merchant == null || merchant.isBlank()) {
            throw new BusinessException(ErrorCode.CHANNEL_DISABLED);
        }

        // 一旦链上交易已被发现或确认，禁止任何渠道/链币重新生成支付金额。
        var inFlight = intentRepository.findFirstByOrderNoAndStatusInOrderByIdDesc(order.getOrderNo(),
                List.of(CryptoPaymentIntent.Status.CONFIRMING, CryptoPaymentIntent.Status.CONFIRMED));
        if (inFlight.isPresent()) return inFlight.get();

        LocalDateTime now = LocalDateTime.now();
        CryptoPaymentIntent reusable = null;
        boolean changed = false;
        for (CryptoPaymentIntent old : intentRepository.findByOrderNoAndStatusOrderByIdDesc(
                order.getOrderNo(), CryptoPaymentIntent.Status.WAITING)) {
            boolean expired = old.getExpireAt() == null || !old.getExpireAt().isAfter(now);
            boolean sameSelection = old.getMode() == mode
                    && old.getChainCode().equalsIgnoreCase(chain.getCode())
                    && old.getTokenSymbol().equalsIgnoreCase(token.getSymbol());
            boolean sameInfrastructure = sameSelection
                    && old.getChainId() == chain.getChainId()
                    && old.getDecimals() == token.getDecimals()
                    && old.getTokenContract().equalsIgnoreCase(token.getContract())
                    && old.getMerchantAddress().equalsIgnoreCase(merchant);

            if (!expired && sameInfrastructure && reusable == null) {
                reusable = old;
                continue;
            }
            // 到期意向释放金额；同一链币因合约/地址配置变化时旧意向也立即失效。
            // 其他链或币的有效意向保留，买家切回时仍显示原来的唯一金额。
            if (expired || sameSelection) {
                old.setStatus(CryptoPaymentIntent.Status.EXPIRED);
                old.setUniqueKey(null);
                changed = true;
            }
        }
        if (changed) intentRepository.flush();
        if (reusable != null) return reusable;

        // 汇率:站点计价币种 → USD 稳定币金额(失败降级为上次成功汇率/配置初始值)
        BigDecimal baseUsd = fxRateService.siteToUsd(sitePayAmount);
        BigInteger baseMinor = baseUsd.movePointRight(token.getDecimals()).toBigIntegerExact();

        // 尾数以 1e-6 代币为步长(18 位小数代币如 BSC-USDT 则放大 10^12),
        // 保证金额最多 6 位小数 —— 交易所提现界面不会截断尾数导致金额失配
        BigInteger tailUnit = BigInteger.TEN.pow(Math.max(0, token.getDecimals() - 6));
        for (int attempt = 0; attempt < MAX_ALLOC_RETRY; attempt++) {
            BigInteger tail = BigInteger.valueOf(RANDOM.nextInt(TAIL_SPACE) + 1L).multiply(tailUnit);
            BigInteger amountMinor = baseMinor.add(tail);
            BigDecimal amountToken = new BigDecimal(amountMinor).movePointLeft(token.getDecimals());

            CryptoPaymentIntent intent = new CryptoPaymentIntent();
            intent.setOrderId(order.getId());
            intent.setOrderNo(order.getOrderNo());
            intent.setChainCode(chain.getCode());
            intent.setChainId(chain.getChainId());
            intent.setTokenSymbol(token.getSymbol());
            intent.setTokenContract(token.getContract().toLowerCase());
            intent.setDecimals(token.getDecimals());
            intent.setAmountToken(amountToken);
            intent.setAmountMinor(amountMinor.toString());
            intent.setUniqueKey(uniqueKey(chain.getCode(), token.getContract(), amountMinor.toString()));
            intent.setMode(mode);
            intent.setMerchantAddress(merchant.toLowerCase());
            intent.setRequiredConfirmations(chain.getConfirmations());
            intent.setExpireAt(LocalDateTime.now().plusMinutes(props.getCrypto().getIntentExpireMinutes()));
            try {
                return intentRepository.saveAndFlush(intent);
            } catch (DataIntegrityViolationException e) {
                log.debug("unique amount collision, retry {}", attempt);
            }
        }
        throw new BusinessException(ErrorCode.AMOUNT_ALLOCATE_FAILED);
    }

    /**
     * 链扫描命中转账:金额指纹匹配意向单 → 绑定 txHash(全局唯一)进入确认期。
     * 意向已过期的迟到支付也按金额指纹兜底匹配(复活确认;若订单也已超时,后台「人工补单」一键恢复)。
     */
    @Transactional
    public void onTransferDetected(String chainCode, String contract, String txHash, long blockNumber, BigInteger value) {
        if (intentRepository.findByTxHash(txHash).isPresent()) return; // 已处理
        var hit = intentRepository.findByUniqueKeyAndStatus(uniqueKey(chainCode, contract, value.toString()),
                        CryptoPaymentIntent.Status.WAITING)
                // 迟付兜底:仅回溯最近 24h 内过期的意向,窗口越小、金额指纹被复用后错配的可能越低
                .or(() -> intentRepository
                        .findFirstByChainCodeAndTokenContractAndAmountMinorAndStatusAndTxHashIsNullOrderByIdDesc(
                                chainCode, contract.toLowerCase(), value.toString(),
                                CryptoPaymentIntent.Status.EXPIRED)
                        .filter(i -> i.getExpireAt() != null
                                && i.getExpireAt().isAfter(LocalDateTime.now().minusHours(24))));
        if (hit.isEmpty()) {
            // 收到打给商户地址、但对不上任何意向的转账(金额不符 / 超 24h 迟付):留日志供人工对账
            log.warn("unmatched transfer to merchant: chain={} contract={} amountMinor={} tx={} —— 无匹配意向单,需人工对账",
                    chainCode, contract, value, txHash);
            return;
        }
        CryptoPaymentIntent intent = hit.get();
        boolean late = intent.getStatus() == CryptoPaymentIntent.Status.EXPIRED;
        intent.setTxHash(txHash);
        intent.setBlockNumber(blockNumber);
        intent.setStatus(CryptoPaymentIntent.Status.CONFIRMING);
        log.info("crypto payment detected{}: order={} tx={}",
                late ? " (late, intent revived)" : "", intent.getOrderNo(), txHash);
    }

    /**
     * TXID 自助补单 / 钱包直付回执:提交交易哈希,服务端链上回查收据 —— 前端数据仅作线索,链上事实为准。
     * 同订单同链的全部历史意向金额都参与匹配(买家按旧金额转账、或意向已过期,均可自助核销复活)。
     */
    @Transactional
    public CryptoPaymentIntent verifyWalletTx(String orderNo, String txHash) {
        // 幂等:该订单已有确认中/已确认的意向,直接返回
        var confirming = intentRepository.findFirstByOrderNoAndStatusInOrderByIdDesc(orderNo,
                List.of(CryptoPaymentIntent.Status.CONFIRMING, CryptoPaymentIntent.Status.CONFIRMED));
        if (confirming.isPresent()) return confirming.get();

        CryptoPaymentIntent latest = intentRepository.findFirstByOrderNoOrderByIdDesc(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
        String cleanTx = txHash.trim().toLowerCase();
        if (!cleanTx.matches("^0x[0-9a-f]{64}$")) {
            throw new BusinessException(ErrorCode.TX_VERIFY_FAILED, "交易哈希格式不正确:应为 0x 开头的 66 位字符");
        }
        if (intentRepository.findByTxHash(cleanTx).isPresent()) {
            throw new BusinessException(ErrorCode.TX_ALREADY_USED);
        }
        AppProperties.Chain chain = findChain(latest.getChainCode());
        JsonNode receipt = rpc.transactionReceipt(chain, cleanTx);
        if (receipt == null || receipt.isNull() || !"0x1".equals(receipt.path("status").asText())) {
            throw new BusinessException(ErrorCode.TX_VERIFY_FAILED,
                    "在 " + chain.getCode() + " 上未查到成功的交易:请确认页面所选网络与实际转账网络一致,且交易已上链");
        }
        long blockNumber = ChainRpcClient.hexToLong(receipt.path("blockNumber").asText("0x0"));

        List<CryptoPaymentIntent> candidates = intentRepository
                .findByOrderNoAndChainCodeAndTxHashIsNullOrderByIdDesc(orderNo, chain.getCode());
        CryptoPaymentIntent matched = null;
        outer:
        for (JsonNode logNode : receipt.path("logs")) {
            JsonNode topics = logNode.path("topics");
            if (!ChainRpcClient.TRANSFER_TOPIC.equals(topics.path(0).asText())) continue;
            String contract = logNode.path("address").asText().toLowerCase();
            String to = ChainRpcClient.topicToAddress(topics.path(2).asText());
            BigInteger value = ChainRpcClient.hexToBigInt(logNode.path("data").asText("0x0"));
            for (CryptoPaymentIntent c : candidates) {
                if (contract.equals(c.getTokenContract()) && to.equals(c.getMerchantAddress())
                        && value.toString().equals(c.getAmountMinor())) {
                    matched = c;
                    break outer;
                }
            }
        }
        if (matched == null) {
            throw new BusinessException(ErrorCode.TX_VERIFY_FAILED,
                    "该交易中没有「转入商户地址且金额与本订单一致」的转账:请核对网络、代币与金额(需分毫不差)。如金额被手续费内扣,请联系客服人工处理");
        }
        matched.setTxHash(cleanTx);
        matched.setBlockNumber(blockNumber);
        matched.setStatus(CryptoPaymentIntent.Status.CONFIRMING);
        log.info("crypto tx self-submitted: order={} tx={} intent#{}", orderNo, cleanTx, matched.getId());
        return matched;
    }

    /** 确认数达标 → 入账(REQUIRES_NEW:单笔失败不影响本轮其他意向)。 */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void settleIfConfirmed(Long intentId, long latestBlock) {
        CryptoPaymentIntent intent = intentRepository.findById(intentId).orElse(null);
        if (intent == null || intent.getStatus() != CryptoPaymentIntent.Status.CONFIRMING
                || intent.getBlockNumber() == null) {
            return;
        }
        int confirmations = (int) Math.max(0, latestBlock - intent.getBlockNumber() + 1);
        intent.setConfirmations(confirmations);
        if (confirmations >= intent.getRequiredConfirmations()) {
            intent.setStatus(CryptoPaymentIntent.Status.CONFIRMED);
            intent.setConfirmedAt(LocalDateTime.now());
            // 释放金额指纹:入账后防重由 txHash 唯一约束保证,金额位可复用。
            // 否则热门价位每成交一单就永久占用一个尾数,长期会耗尽 9999 的分配空间。
            intent.setUniqueKey(null);
            String channelCode = intent.getMode() == CryptoPaymentIntent.Mode.WALLET
                    ? "CRYPTO_WALLET" : "CRYPTO_TRANSFER";
            // 以订单应付 CNY 金额入账(代币金额与汇率证据留存于意向单)
            settlementService.settle(intent.getOrderNo(), channelCode, intent.getTxHash(), null, false);
            log.info("crypto payment confirmed: order={} tx={}", intent.getOrderNo(), intent.getTxHash());
        }
    }

    /** 过期意向释放唯一金额额度。 */
    @Transactional
    public void expireStaleIntents() {
        for (CryptoPaymentIntent intent : intentRepository.findTop200ByStatusAndExpireAtBefore(
                CryptoPaymentIntent.Status.WAITING, LocalDateTime.now())) {
            intent.setStatus(CryptoPaymentIntent.Status.EXPIRED);
            intent.setUniqueKey(null);
        }
    }

    public AppProperties.Chain findChain(String chainCode) {
        return props.getCrypto().getChains().stream()
                .filter(c -> c.isEnabled() && c.getCode().equalsIgnoreCase(chainCode))
                .findFirst().orElseThrow(() -> new BusinessException(ErrorCode.CHANNEL_DISABLED));
    }

    /** 意向单查询视图(兼容旧调用):优先展示确认中/已确认，否则展示最新一笔。 */
    @Transactional(readOnly = true)
    public Map<String, Object> intentView(String orderNo) {
        CryptoPaymentIntent i = intentRepository.findFirstByOrderNoAndStatusInOrderByIdDesc(orderNo,
                        List.of(CryptoPaymentIntent.Status.CONFIRMING, CryptoPaymentIntent.Status.CONFIRMED))
                .or(() -> intentRepository.findFirstByOrderNoOrderByIdDesc(orderNo))
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
        return intentView(i);
    }

    /**
     * 按当前支付模式/链/币精确轮询。切换到其他链币再切回来时，继续展示该组合原来的意向，
     * 不会因为另一组合 ID 更新而在下一轮轮询时跳走。确认中/已确认的链上交易始终拥有最高优先级。
     */
    @Transactional(readOnly = true)
    public Map<String, Object> intentView(String orderNo, CryptoPaymentIntent.Mode mode,
                                          String chainCode, String tokenSymbol) {
        CryptoPaymentIntent i = intentRepository.findFirstByOrderNoAndStatusInOrderByIdDesc(orderNo,
                        List.of(CryptoPaymentIntent.Status.CONFIRMING, CryptoPaymentIntent.Status.CONFIRMED))
                .or(() -> intentRepository
                        .findFirstByOrderNoAndModeAndChainCodeIgnoreCaseAndTokenSymbolIgnoreCaseOrderByIdDesc(
                                orderNo, mode, chainCode, tokenSymbol))
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
        return intentView(i);
    }

    /** 将已确定的意向转换为前台视图，支付创建响应使用该方法避免再次按“最新记录”选错链币。 */
    public Map<String, Object> intentView(CryptoPaymentIntent i) {
        Map<String, Object> m = new HashMap<>();
        m.put("status", i.getStatus().name());
        m.put("chainCode", i.getChainCode());
        m.put("chainId", i.getChainId());
        m.put("tokenSymbol", i.getTokenSymbol());
        m.put("tokenContract", i.getTokenContract());
        m.put("decimals", i.getDecimals());
        m.put("amount", i.getAmountToken().toPlainString());
        m.put("amountMinor", i.getAmountMinor());
        m.put("address", i.getMerchantAddress());
        m.put("confirmations", i.getConfirmations());
        m.put("requiredConfirmations", i.getRequiredConfirmations());
        m.put("expireAt", i.getExpireAt().toString());
        m.put("txHash", i.getTxHash());
        m.put("eip681", "ethereum:" + i.getTokenContract() + "@" + i.getChainId()
                + "/transfer?address=" + i.getMerchantAddress() + "&uint256=" + i.getAmountMinor());
        return m;
    }

    static String uniqueKey(String chainCode, String contract, String amountMinor) {
        return chainCode.toUpperCase() + ":" + contract.toLowerCase() + ":" + amountMinor;
    }
}
