package com.hqyj.ka.card.service;

import com.hqyj.ka.card.entity.CardSecret;
import com.hqyj.ka.card.repo.CardSecretRepository;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.common.util.AesGcmUtil;
import com.hqyj.ka.config.AppProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CardService {

    private final CardSecretRepository cardRepository;
    private final AppProperties props;

    /** 批量导入:去重(库内指纹 + 本批次内),加密落库。返回 [导入数, 重复数]。 */
    @Transactional
    public int[] importCards(Long productId, List<String> lines) {
        List<String> cleaned = lines.stream().map(String::trim).filter(s -> !s.isEmpty()).distinct().toList();
        if (cleaned.size() > 10000) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "单次最多导入 10000 条卡密");
        }
        if (cleaned.stream().anyMatch(s -> s.length() > 4000)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "单条卡密内容不能超过 4000 字符");
        }
        List<String> fingerprints = cleaned.stream().map(CardService::sha256).toList();
        Set<String> existing = cardRepository.findByProductIdAndFingerprintIn(productId, fingerprints).stream()
                .map(CardSecret::getFingerprint).collect(Collectors.toSet());

        byte[] key = props.getSecurity().aesKeyBytes();
        int imported = 0;
        for (String line : cleaned) {
            String fp = sha256(line);
            if (existing.contains(fp)) continue;
            imported += cardRepository.insertIgnoreAvailable(productId, AesGcmUtil.encrypt(line, key), fp);
        }
        return new int[]{imported, cleaned.size() - imported};
    }

    /** 发卡分配(在订单事务内调用):SKIP LOCKED 抢占 → 标记 SOLD。 */
    @Transactional
    public List<CardSecret> allocate(Long productId, int qty, Long orderId) {
        List<CardSecret> cards = cardRepository.lockAvailable(productId, qty);
        if (cards.size() < qty) {
            throw new BusinessException(ErrorCode.STOCK_NOT_ENOUGH);
        }
        markAllocated(cards, orderId);
        return cards;
    }

    /**
     * 预售履约尝试分配:库存不足是“等待补货”的正常状态,不抛异常。
     * 仍在同一事务内使用 SKIP LOCKED 锁定并分配,避免并发超发。
     */
    @Transactional
    public List<CardSecret> tryAllocate(Long productId, int qty, Long orderId) {
        List<CardSecret> cards = cardRepository.lockAvailable(productId, qty);
        if (cards.size() < qty) return List.of();
        markAllocated(cards, orderId);
        return cards;
    }

    private void markAllocated(List<CardSecret> cards, Long orderId) {
        for (CardSecret c : cards) {
            c.setStatus(CardSecret.Status.SOLD);
            c.setOrderId(orderId);
            c.setSoldAt(LocalDateTime.now());
        }
    }

    /** 解密订单卡密(买家提卡 / 管理端查看,均有权限与凭证校验前置)。 */
    @Transactional(readOnly = true)
    public List<String> decryptForOrder(Long orderId) {
        byte[] key = props.getSecurity().aesKeyBytes();
        return cardRepository.findByOrderId(orderId).stream()
                .map(c -> AesGcmUtil.decrypt(c.getContentEnc(), key)).toList();
    }

    /** 管理端按卡密 ID 受控解密;调用方必须先完成权限、2FA 与审计。 */
    @Transactional(readOnly = true)
    public String decryptOne(CardSecret card) {
        return AesGcmUtil.decrypt(card.getContentEnc(), props.getSecurity().aesKeyBytes());
    }

    /** 编辑未售卡密:保持 AES-GCM 加密落库,并更新去重指纹。 */
    @Transactional
    public void updateContent(CardSecret card, String content) {
        String cleaned = content == null ? "" : content.trim();
        if (cleaned.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "卡密内容不能为空");
        }
        String fp = sha256(cleaned);
        boolean duplicate = cardRepository.findByProductIdAndFingerprintIn(card.getProductId(), List.of(fp)).stream()
                .anyMatch(c -> !c.getId().equals(card.getId()));
        if (duplicate) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "该商品下已存在相同卡密");
        }
        card.setContentEnc(AesGcmUtil.encrypt(cleaned, props.getSecurity().aesKeyBytes()));
        card.setFingerprint(fp);
    }

    public long availableCount(Long productId) {
        return cardRepository.countByProductIdAndStatus(productId, CardSecret.Status.AVAILABLE);
    }

    static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
