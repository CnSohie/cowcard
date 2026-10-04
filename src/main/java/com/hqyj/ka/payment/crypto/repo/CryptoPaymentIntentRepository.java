package com.hqyj.ka.payment.crypto.repo;

import com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CryptoPaymentIntentRepository extends JpaRepository<CryptoPaymentIntent, Long> {

    Optional<CryptoPaymentIntent> findByUniqueKeyAndStatus(String uniqueKey, CryptoPaymentIntent.Status status);

    Optional<CryptoPaymentIntent> findFirstByOrderNoOrderByIdDesc(String orderNo);

    Optional<CryptoPaymentIntent> findFirstByOrderNoAndModeAndChainCodeIgnoreCaseAndTokenSymbolIgnoreCaseOrderByIdDesc(
            String orderNo, CryptoPaymentIntent.Mode mode, String chainCode, String tokenSymbol);

    List<CryptoPaymentIntent> findByOrderNoAndStatusOrderByIdDesc(String orderNo, CryptoPaymentIntent.Status status);

    Optional<CryptoPaymentIntent> findByTxHash(String txHash);

    List<CryptoPaymentIntent> findByOrderNoInAndTxHashIsNotNull(Collection<String> orderNos);

    List<CryptoPaymentIntent> findByChainCodeAndStatus(String chainCode, CryptoPaymentIntent.Status status);

    long countByStatus(CryptoPaymentIntent.Status status);

    @Query("select count(i) from CryptoPaymentIntent i where i.status = com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent.Status.CONFIRMING "
            + "and i.detectedAt is not null and i.detectedAt < :before")
    long countConfirmingDetectedBefore(@Param("before") LocalDateTime before);

    @Query("select min(i.detectedAt) from CryptoPaymentIntent i where i.status = com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent.Status.CONFIRMING "
            + "and i.detectedAt is not null")
    LocalDateTime oldestConfirmingDetectedAt();

    List<CryptoPaymentIntent> findTop200ByChainCodeAndStatusAndExpireAtAfterAndTxHashIsNullOrderByIdDesc(
            String chainCode, CryptoPaymentIntent.Status status, LocalDateTime time);

    List<CryptoPaymentIntent> findTop200ByStatusAndExpireAtBefore(CryptoPaymentIntent.Status status, LocalDateTime time);

    /** 迟到支付兜底:意向已过期(uniqueKey 已释放)但链上金额指纹仍可按字段匹配最近一笔未支付意向。 */
    Optional<CryptoPaymentIntent> findFirstByChainCodeAndTokenContractAndAmountMinorAndStatusAndTxHashIsNullOrderByIdDesc(
            String chainCode, String tokenContract, String amountMinor, CryptoPaymentIntent.Status status);

    /** TXID 自助补单:同订单同链上所有未绑定交易的意向(含重新发起前的旧金额)。 */
    List<CryptoPaymentIntent> findByOrderNoAndChainCodeAndTxHashIsNullOrderByIdDesc(String orderNo, String chainCode);

    /** 意向视图优先取「确认中/已确认」那笔(自助补单可能复活的是旧意向,而非最新一笔)。 */
    Optional<CryptoPaymentIntent> findFirstByOrderNoAndStatusInOrderByIdDesc(
            String orderNo, Collection<CryptoPaymentIntent.Status> statuses);
}
