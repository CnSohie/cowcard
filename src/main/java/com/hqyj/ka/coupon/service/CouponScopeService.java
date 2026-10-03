package com.hqyj.ka.coupon.service;

import com.hqyj.ka.catalog.repo.ProductRepository;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CouponScopeService {
    private final ProductRepository products;
    public record ProductOption(Long id, String name) {}
    public List<ProductOption> options() {
        return products.findAll(org.springframework.data.domain.Sort.by("id")).stream()
                .map(p -> new ProductOption(p.getId(), p.getName())).toList();
    }
    public void validate(Long productId) {
        if (productId != null && !products.existsById(productId)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "指定商品不存在，请重新选择");
        }
    }
}
