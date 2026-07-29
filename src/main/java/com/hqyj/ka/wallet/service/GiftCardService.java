package com.hqyj.ka.wallet.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.wallet.entity.GiftCard;
import com.hqyj.ka.wallet.entity.WalletTxn;
import com.hqyj.ka.wallet.repo.GiftCardRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class GiftCardService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final char[] CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    private final GiftCardRepository giftCardRepository;
    private final WalletService walletService;

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
            card.setCode(batch + String.format("%04d", i) + random(6));
            cards.add(card);
        }
        return giftCardRepository.saveAll(cards);
    }

    @Transactional
    public GiftCard redeem(Long memberId, String rawCode) {
        if (rawCode == null || rawCode.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "请输入礼品卡码");
        LocalDateTime now = LocalDateTime.now();
        String code = rawCode.trim().toUpperCase();
        GiftCard card = giftCardRepository.findByCode(code)
                .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "礼品卡不存在"));
        if (card.getStatus() != GiftCard.Status.ACTIVE) throw new BusinessException(ErrorCode.BAD_REQUEST, "礼品卡不可兑换");
        if (card.getExpireAt() != null && card.getExpireAt().isBefore(now)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "礼品卡已过期");
        }
        if (giftCardRepository.redeemActive(code, GiftCard.Status.ACTIVE, GiftCard.Status.REDEEMED, memberId, now) == 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "礼品卡不可兑换");
        }
        card.setStatus(GiftCard.Status.REDEEMED);
        card.setRedeemedBy(memberId);
        card.setRedeemedAt(now);
        walletService.credit(memberId, card.getAmount(), WalletTxn.Type.GIFT_CARD,
                "GIFT_CARD", card.getId(), "礼品卡兑换 " + card.getCode());
        return card;
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
}
