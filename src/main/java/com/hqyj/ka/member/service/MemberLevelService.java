package com.hqyj.ka.member.service;

import com.hqyj.ka.catalog.entity.Product;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.member.entity.Member;
import com.hqyj.ka.member.entity.MemberLevel;
import com.hqyj.ka.member.entity.MemberLevelPrice;
import com.hqyj.ka.member.repo.MemberLevelPriceRepository;
import com.hqyj.ka.member.repo.MemberLevelRepository;
import com.hqyj.ka.member.repo.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class MemberLevelService {
    private final MemberLevelRepository levelRepository;
    private final MemberLevelPriceRepository priceRepository;
    private final MemberRepository memberRepository;

    public record PriceResult(BigDecimal unitPrice, BigDecimal discountPerUnit,
                              String levelName, Long levelId, String source) {}

    @Transactional
    public MemberLevel ensureDefaultLevel() {
        return levelRepository.findByDefaultLevelTrue().orElseGet(() -> {
            MemberLevel level = new MemberLevel();
            level.setName("默认会员");
            level.setSlug("default");
            level.setIcon("member");
            level.setDiscountRate(new BigDecimal("100.00"));
            level.setDefaultLevel(true);
            level.setEnabled(true);
            level.setSortWeight(0);
            return levelRepository.save(level);
        });
    }

    @Transactional
    public List<MemberLevel> levels() {
        ensureDefaultLevel();
        return levelRepository.findAllByOrderBySortWeightAscIdAsc();
    }

    @Transactional
    public MemberLevel saveLevel(MemberLevel req) {
        MemberLevel level = req.getId() == null ? new MemberLevel()
                : levelRepository.findById(req.getId()).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (req.getSlug() == null || req.getSlug().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "等级标识不能为空");
        }
        levelRepository.findBySlug(req.getSlug().trim().toLowerCase())
                .filter(x -> !x.getId().equals(level.getId()))
                .ifPresent(x -> { throw new BusinessException(ErrorCode.BAD_REQUEST, "等级标识已存在"); });
        level.setName(req.getName());
        level.setSlug(req.getSlug().trim().toLowerCase());
        level.setIcon(req.getIcon());
        level.setDiscountRate(normalizeRate(req.getDiscountRate()));
        level.setRechargeThreshold(nonNegative(req.getRechargeThreshold()));
        level.setSpendThreshold(nonNegative(req.getSpendThreshold()));
        level.setSortWeight(req.getSortWeight());
        level.setEnabled(req.isEnabled());
        level.setDefaultLevel(req.isDefaultLevel());
        if (level.isDefaultLevel()) {
            levelRepository.findByDefaultLevelTrue().filter(x -> !x.getId().equals(level.getId()))
                    .ifPresent(x -> x.setDefaultLevel(false));
        }
        MemberLevel saved = levelRepository.save(level);
        if (saved.isDefaultLevel()) backfillDefault();
        return saved;
    }

    @Transactional
    public void deleteLevel(Long id) {
        MemberLevel level = levelRepository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (level.isDefaultLevel()) throw new BusinessException(ErrorCode.BAD_REQUEST, "默认等级不可删除");
        levelRepository.delete(level);
    }

    @Transactional
    public void backfillDefault() {
        Long id = ensureDefaultLevel().getId();
        memberRepository.findAll().stream().filter(m -> m.getLevelId() == null).forEach(m -> m.setLevelId(id));
    }

    @Transactional
    public void assignLevel(Long memberId, Long levelId) {
        Member member = memberRepository.findById(memberId).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        MemberLevel level = levelRepository.findById(levelId).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        member.setLevelId(level.getId());
    }

    @Transactional
    public void addRecharge(Long memberId, BigDecimal amount) {
        if (memberId == null || amount == null || amount.signum() <= 0) return;
        Member member = memberRepository.findById(memberId).orElse(null);
        if (member == null) return;
        member.setTotalRecharge(member.getTotalRecharge().add(amount));
        autoUpgrade(member);
    }

    @Transactional
    public void addSpend(Long memberId, BigDecimal amount) {
        if (memberId == null || amount == null || amount.signum() <= 0) return;
        Member member = memberRepository.findById(memberId).orElse(null);
        if (member == null) return;
        member.setTotalSpend(member.getTotalSpend().add(amount));
        autoUpgrade(member);
    }

    @Transactional(readOnly = true)
    public PriceResult priceFor(Long memberId, Product product) {
        BigDecimal original = product.getPrice();
        if (memberId == null) return new PriceResult(original, BigDecimal.ZERO, null, null, "ORIGINAL");
        Member member = memberRepository.findById(memberId).orElse(null);
        MemberLevel level = currentLevel(member).orElse(null);
        if (level == null || !level.isEnabled()) {
            return new PriceResult(original, BigDecimal.ZERO, null, null, "ORIGINAL");
        }
        BigDecimal candidate = priceRepository.findByLevelIdAndProductIdAndSkuCode(level.getId(), product.getId(), "")
                .map(MemberLevelPrice::getPrice)
                .orElse(original.multiply(level.getDiscountRate()).divide(new BigDecimal("100"), 2, RoundingMode.DOWN));
        if (candidate.compareTo(original) >= 0) {
            return new PriceResult(original, BigDecimal.ZERO, level.getName(), level.getId(), "ORIGINAL");
        }
        return new PriceResult(candidate, original.subtract(candidate), level.getName(), level.getId(),
                priceRepository.findByLevelIdAndProductIdAndSkuCode(level.getId(), product.getId(), "").isPresent()
                        ? "PRODUCT_PRICE" : "LEVEL_DISCOUNT");
    }

    @Transactional(readOnly = true)
    public List<MemberLevelPrice> prices(Long levelId) {
        return priceRepository.findByLevelIdOrderByProductIdAsc(levelId);
    }

    @Transactional
    public MemberLevelPrice savePrice(Long levelId, Long productId, BigDecimal price) {
        if (price == null || price.scale() > 2 || price.signum() <= 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "会员价无效");
        }
        levelRepository.findById(levelId).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        MemberLevelPrice p = priceRepository.findByLevelIdAndProductIdAndSkuCode(levelId, productId, "")
                .orElseGet(MemberLevelPrice::new);
        p.setLevelId(levelId);
        p.setProductId(productId);
        p.setSkuCode("");
        p.setPrice(price);
        return priceRepository.save(p);
    }

    @Transactional
    public void deletePrice(Long levelId, Long productId) {
        priceRepository.deleteByLevelIdAndProductIdAndSkuCode(levelId, productId, "");
    }

    private Optional<MemberLevel> currentLevel(Member member) {
        if (member == null) return Optional.empty();
        if (member.getLevelId() != null) {
            Optional<MemberLevel> hit = levelRepository.findById(member.getLevelId());
            if (hit.isPresent()) return hit;
        }
        return levelRepository.findByDefaultLevelTrue();
    }

    private void autoUpgrade(Member member) {
        int currentWeight = currentLevel(member).map(MemberLevel::getSortWeight).orElse(Integer.MIN_VALUE);
        for (MemberLevel level : levelRepository.findByEnabledTrueOrderBySortWeightDescIdDesc()) {
            if (level.getSortWeight() <= currentWeight) continue;
            boolean rechargeOk = level.getRechargeThreshold().signum() > 0
                    && member.getTotalRecharge().compareTo(level.getRechargeThreshold()) >= 0;
            boolean spendOk = level.getSpendThreshold().signum() > 0
                    && member.getTotalSpend().compareTo(level.getSpendThreshold()) >= 0;
            boolean defaultOk = level.isDefaultLevel();
            if (rechargeOk || spendOk || defaultOk) {
                member.setLevelId(level.getId());
                return;
            }
        }
    }

    private BigDecimal normalizeRate(BigDecimal rate) {
        if (rate == null) return new BigDecimal("100.00");
        if (rate.signum() < 0 || rate.compareTo(new BigDecimal("100")) > 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "折扣率必须在 0-100 之间");
        }
        return rate.setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal nonNegative(BigDecimal v) {
        if (v == null) return BigDecimal.ZERO;
        if (v.signum() < 0 || v.scale() > 2) throw new BusinessException(ErrorCode.BAD_REQUEST, "金额门槛无效");
        return v;
    }
}
