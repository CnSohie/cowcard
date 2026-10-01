package com.hqyj.ka.catalog.service;

import com.hqyj.ka.catalog.entity.Product;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.member.repo.MemberLevelRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.util.*;

@Service
@RequiredArgsConstructor
public class WholesalePricingService {
    private final JsonMapper mapper;
    private final MemberLevelRepository levels;

    /** levelId 为空表示所有买家,否则只匹配该等级,不按等级权重继承。 */
    public record Tier(int minQuantity, BigDecimal unitPrice, Long levelId) {}
    public record PublicTier(int minQuantity, BigDecimal unitPrice) {}

    public record LevelOption(Long id, String name) {}

    public List<LevelOption> levelOptions() {
        return levels.findAllByOrderBySortWeightAscIdAsc().stream()
                .map(l -> new LevelOption(l.getId(), l.getName())).toList();
    }

    public List<Tier> parse(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            Tier[] values = mapper.readValue(json, Tier[].class);
            if (values == null) throw new IllegalArgumentException();
            return Arrays.asList(values);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "批发价配置格式无效");
        }
    }

    public String validate(String json, BigDecimal original, int maxBuy) {
        List<Tier> tiers = parse(json);
        if (tiers.size() > 50) throw new BusinessException(ErrorCode.BAD_REQUEST, "批发价最多设置 50 个档位");
        Set<String> seen = new HashSet<>();
        for (Tier tier : tiers) {
            if (tier == null || tier.minQuantity() < 1 || tier.minQuantity() > maxBuy
                    || tier.unitPrice() == null || tier.unitPrice().signum() <= 0 || tier.unitPrice().scale() > 2
                    || tier.unitPrice().compareTo(original) > 0) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "批发数量须在 1 到单次最多数量之间,单价须大于 0 且不超过标价(最多两位小数)");
            }
            if (!seen.add(tier.levelId() + ":" + tier.minQuantity())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "同一适用范围的批发数量档位不能重复");
            }
            if (tier.levelId() != null && !levels.existsById(tier.levelId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "批发价指定的会员等级不存在");
            }
        }
        return mapper.writeValueAsString(tiers);
    }

    public List<PublicTier> available(Product product, Long levelId) {
        // 不向买家返回其他等级的价格或等级 ID。
        return parse(product.getWholesaleRules()).stream()
                .filter(t -> t.levelId() == null || Objects.equals(t.levelId(), levelId))
                .map(t -> new PublicTier(t.minQuantity(), t.unitPrice()))
                .sorted(Comparator.comparingInt(PublicTier::minQuantity).thenComparing(PublicTier::unitPrice))
                .toList();
    }
}
