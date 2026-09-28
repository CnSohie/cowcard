package com.hqyj.ka.wallet.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.common.util.AesGcmUtil;
import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.wallet.entity.GiftCard;
import com.hqyj.ka.wallet.entity.WalletTxn;
import com.hqyj.ka.wallet.repo.GiftCardRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class GiftCardService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final char[] CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    private final GiftCardRepository giftCardRepository;
    private final WalletService walletService;
    private final AppProperties props;

    @Transactional
    public List<GiftCard> generate(String name, BigDecimal amount, int quantity, LocalDateTime expireAt) {
        if (name == null || name.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "批次名称不能为空");
        if (amount == null || amount.scale() > 2 || amount.signum() <= 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "礼品卡面额无效");
        }
        if (quantity < 1 || quantity > 10_000) throw new BusinessException(ErrorCode.BAD_REQUEST, "数量必须在 1-10000 之间");
        String batch = "GC" + DateTimeFormatter.ofPattern("yyyyMMddHHmmss").format(LocalDateTime.now());
        List<GiftCard> cards = new ArrayList<>(quantity);
        for (int i = 1; i <= quantity; i++) {
            GiftCard card = new GiftCard();
            card.setBatchNo(batch);
            card.setName(name.trim());
            card.setAmount(amount);
            card.setExpireAt(expireAt);
            String rawCode = batch + String.format("%04d", i) + random(6);
            card.setCode(sha256(rawCode));
            card.setCodeEnc(AesGcmUtil.encrypt(rawCode, props.getSecurity().aesKeyBytes()));
            cards.add(card);
        }
        return giftCardRepository.saveAll(cards);
    }

    @Transactional
    public GiftCard redeem(Long memberId, String rawCode) {
        if (rawCode == null || rawCode.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "请输入礼品卡码");
        LocalDateTime now = LocalDateTime.now();
        String code = rawCode.trim().toUpperCase();
        GiftCard card = giftCardRepository.findByCode(sha256(code))
                // 兼容升级前已经生成的明文礼品卡,成功兑换时一并迁移。
                .or(() -> giftCardRepository.findByCode(code))
                .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "礼品卡不存在"));
        if (card.getStatus() != GiftCard.Status.ACTIVE) throw new BusinessException(ErrorCode.BAD_REQUEST, "礼品卡不可兑换");
        if (card.getExpireAt() != null && card.getExpireAt().isBefore(now)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "礼品卡已过期");
        }
        String storedCode = card.getCode();
        if (giftCardRepository.redeemActive(storedCode, GiftCard.Status.ACTIVE, GiftCard.Status.REDEEMED, memberId, now) == 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "礼品卡不可兑换");
        }
        card.setStatus(GiftCard.Status.REDEEMED);
        card.setRedeemedBy(memberId);
        card.setRedeemedAt(now);
        if (card.getCodeEnc() == null || card.getCodeEnc().isBlank()) {
            card.setCodeEnc(AesGcmUtil.encrypt(code, props.getSecurity().aesKeyBytes()));
            card.setCode(sha256(code));
        }
        card.setRedeemedCode(code);
        walletService.credit(memberId, card.getAmount(), WalletTxn.Type.GIFT_CARD,
                "GIFT_CARD", card.getId(), "礼品卡兑换 #" + card.getId());
        return card;
    }

    /** 管理端已通过 2FA 后才调用;旧明文卡码在展示时自动完成加密迁移。 */
    @Transactional
    public String revealCode(GiftCard card) {
        if (card.getCodeEnc() != null && !card.getCodeEnc().isBlank()) {
            return AesGcmUtil.decrypt(card.getCodeEnc(), props.getSecurity().aesKeyBytes());
        }
        String legacy = card.getCode();
        if (legacy == null || legacy.isBlank() || isSha256(legacy)) return "[已保护]";
        card.setCodeEnc(AesGcmUtil.encrypt(legacy, props.getSecurity().aesKeyBytes()));
        card.setCode(sha256(legacy));
        giftCardRepository.save(card);
        return legacy;
    }

    @Transactional
    public GiftCard toggle(Long id, boolean enabled) {
        GiftCard card = giftCardRepository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (card.getStatus() == GiftCard.Status.REDEEMED) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "已兑换礼品卡不可修改状态");
        }
        card.setStatus(enabled ? GiftCard.Status.ACTIVE : GiftCard.Status.DISABLED);
        return card;
    }

    @Transactional
    public void delete(Long id) {
        GiftCard card = giftCardRepository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (card.getStatus() == GiftCard.Status.REDEEMED) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "已兑换礼品卡不可删除");
        }
        giftCardRepository.delete(card);
    }

    private String random(int n) {
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) sb.append(CHARS[RANDOM.nextInt(CHARS.length)]);
        return sb.toString();
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static boolean isSha256(String value) {
        return value.length() == 64 && value.matches("[0-9a-fA-F]{64}");
    }
}
