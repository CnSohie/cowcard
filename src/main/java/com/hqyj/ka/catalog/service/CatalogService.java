package com.hqyj.ka.catalog.service;

import com.hqyj.ka.catalog.dto.CatalogDtos.*;
import com.hqyj.ka.catalog.entity.Category;
import com.hqyj.ka.catalog.entity.Product;
import com.hqyj.ka.catalog.repo.CategoryRepository;
import com.hqyj.ka.catalog.repo.ProductRepository;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CatalogService {

    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;

    // ---------- 前台(带缓存,2C2G 下商城首页零 DB 压力) ----------

    @Cacheable(cacheNames = "categories", key = "'visible'")
    @Transactional(readOnly = true)
    public List<CategoryView> visibleCategories() {
        return categoryRepository.findByVisibleTrueOrderBySortOrderAsc().stream()
                .map(c -> new CategoryView(c.getId(), c.getName(), c.getSortOrder(), c.isVisible())).toList();
    }

    @Cacheable(cacheNames = "products", key = "'visible'")
    @Transactional(readOnly = true)
    public List<ProductCard> visibleProducts() {
        return productRepository.findByVisibleTrueOrderBySortOrderAscIdDesc().stream().map(this::toCard).toList();
    }

    /** 详情不缓存:库存展示需要新鲜度 */
    @Transactional(readOnly = true)
    public ProductDetail productDetail(Long id) {
        Product p = productRepository.findByIdAndVisibleTrue(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_OFF_SHELF));
        return new ProductDetail(p.getId(), p.getCategoryId(), p.getName(), p.getBrief(), p.getDescription(),
                p.getCoverImage(), p.getPrice(), p.getStockCached(), p.getMinBuy(), p.getMaxBuy(),
                p.getDeliveryMode().name(), p.getManualPrompt(),
                p.getPresaleStartAt(), p.getPresaleEndAt(), p.getPresaleSettlementMode());
    }

    // ---------- 管理端 ----------

    @Transactional(readOnly = true)
    public List<Category> allCategories() { return categoryRepository.findAll(); }

    @Transactional(readOnly = true)
    public List<Product> allProducts() { return productRepository.findAll(); }

    @CacheEvict(cacheNames = {"categories", "products"}, allEntries = true)
    @Transactional
    public Category saveCategory(SaveCategoryRequest req) {
        Category c = req.id() == null ? new Category()
                : categoryRepository.findById(req.id()).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        c.setName(req.name());
        c.setSortOrder(req.sortOrder());
        c.setVisible(req.visible());
        return categoryRepository.save(c);
    }

    @CacheEvict(cacheNames = {"categories", "products"}, allEntries = true)
    @Transactional
    public Product saveProduct(SaveProductRequest req) {
        Product p = req.id() == null ? new Product()
                : productRepository.findById(req.id()).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (req.minBuy() > req.maxBuy()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "最小购买数量不能大于最大购买数量");
        }
        p.setCategoryId(req.categoryId());
        p.setName(req.name());
        p.setBrief(req.brief());
        p.setDescription(req.description());
        p.setUsageNote(req.usageNote());
        p.setDeliveryMode(req.deliveryMode() == null || req.deliveryMode().isBlank()
                ? Product.DeliveryMode.AUTO_CARD
                : Product.DeliveryMode.valueOf(req.deliveryMode()));
        if (p.getDeliveryMode() == Product.DeliveryMode.PRESALE_VOUCHER) {
            if (req.presaleEndAt() == null) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "预售商品必须设置最晚提货截止时间");
            }
            if (req.presaleStartAt() != null && !req.presaleEndAt().isAfter(req.presaleStartAt())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "最晚提货截止时间必须晚于开放提货时间");
            }
        }
        p.setManualPrompt(req.manualPrompt());
        p.setPresaleStartAt(req.presaleStartAt());
        p.setPresaleEndAt(req.presaleEndAt());
        p.setPresaleSettlementMode(req.presaleSettlementMode() == null || req.presaleSettlementMode().isBlank()
                ? "BALANCE" : req.presaleSettlementMode());
        p.setCoverImage(req.coverImage());
        p.setPrice(req.price());
        p.setMinBuy(req.minBuy());
        p.setMaxBuy(req.maxBuy());
        p.setVisible(req.visible());
        p.setSortOrder(req.sortOrder());
        return productRepository.save(p);
    }

    ProductCard toCard(Product p) {
        return new ProductCard(p.getId(), p.getCategoryId(), p.getName(), p.getBrief(), p.getCoverImage(),
                p.getPrice(), p.getStockCached(), p.getMinBuy(), p.getMaxBuy(), p.getDeliveryMode().name(),
                p.getPresaleStartAt(), p.getPresaleEndAt());
    }
}
