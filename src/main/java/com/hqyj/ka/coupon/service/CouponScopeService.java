package com.hqyj.ka.coupon.service;

import com.hqyj.ka.catalog.repo.ProductRepository;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CouponScopeService {
    private final ProductRepository products;
    public record ProductOption(Long id, String name) {}
    public List<ProductOption> options() {
        return products.findAll(org.springframework.data.domain.Sort.by("id")).stream()
                .map(p -> new ProductOption(p.getId(), p.getName())).toList();
    }

    /** 管理端列表展示用。商品已删除时没有对应名字。 */
    public Map<Long, String> namesOf(Collection<Long> ids) {
        List<Long> wanted = ids.stream().filter(id -> id != null && id > 0).distinct().toList();
        if (wanted.isEmpty()) return Map.of();
        Map<Long, String> names = new HashMap<>();
        products.findAllById(wanted).forEach(product -> names.put(product.getId(), product.getName()));
        return names;
    }

    public void validate(Long productId) {
        if (productId == null) return;
        if (productId <= 0 || !products.existsById(productId)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "指定商品不存在，请重新选择");
        }
    }
}
