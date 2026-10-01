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

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CatalogService {

    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final ManualDeliveryFormService manualDeliveryFormService;
    private final ProductSalesService productSalesService;
    private final WholesalePricingService wholesalePricingService;

    // ---------- 前台(带缓存,2C2G 下商城首页零 DB 压力) ----------

    @Cacheable(cacheNames = "categories", key = "'visible'")
    @Transactional(readOnly = true)
    public List<CategoryView> visibleCategories() {
        return categoryRepository.findByVisibleTrueOrderBySortOrderAscIdAsc().stream()
                .map(c -> new CategoryView(c.getId(), c.getName(), c.getSortOrder(), c.isVisible())).toList();
    }

    @Cacheable(cacheNames = "products", key = "'visible:' + @productSalesService.enabled()")
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
                p.getCoverImage(), p.getPrice(), minOrderAmount(p), p.getStockCached(), p.getMinBuy(), p.getMaxBuy(),
                p.getDeliveryMode().name(), p.getManualPrompt(), p.getManualFormSchema(),
                p.getPresaleSaleEndAt(), p.getPresaleStartAt(), p.getPresaleEndAt(), p.getPresaleSettlementMode(), soldQuantity(p));
    }

    // ---------- 管理端 ----------

    @Transactional(readOnly = true)
    public List<Category> allCategories() { return categoryRepository.findAllByOrderBySortOrderAscIdAsc(); }

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
    public void reorderCategories(List<Long> categoryIds) {
        List<Category> categories = categoryRepository.findAll();
        Set<Long> requested = new HashSet<>(categoryIds);
        if (requested.size() != categoryIds.size() || requested.size() != categories.size()
                || categories.stream().anyMatch(c -> !requested.contains(c.getId()))) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "分类排序数据已过期,请刷新后重试");
        }
        var byId = categories.stream().collect(java.util.stream.Collectors.toMap(Category::getId, c -> c));
        for (int i = 0; i < categoryIds.size(); i++) {
            byId.get(categoryIds.get(i)).setSortOrder(i);
        }
        categoryRepository.saveAll(categories);
    }

    @CacheEvict(cacheNames = {"categories", "products"}, allEntries = true)
    @Transactional
    public Category deleteCategory(Long id) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (productRepository.existsByCategoryId(id)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "该分类下还有商品,请先移动或删除这些商品");
        }
        categoryRepository.delete(category);
        return category;
    }

    @CacheEvict(cacheNames = {"categories", "products"}, allEntries = true)
    @Transactional
    public Product saveProduct(SaveProductRequest req) {
        Product p = req.id() == null ? new Product()
                : productRepository.findById(req.id()).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (req.minBuy() > req.maxBuy()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "最小购买数量不能大于最大购买数量");
        }
        BigDecimal minOrderAmount = req.minOrderAmount() == null ? BigDecimal.ZERO : req.minOrderAmount();
        if (minOrderAmount.compareTo(req.price().multiply(BigDecimal.valueOf(req.maxBuy()))) > 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "最低订购金额不能超过商品标价 × 单次最多数量");
        }
        p.setCategoryId(req.categoryId());
        p.setName(req.name());
        p.setBrief(req.brief());
        p.setDescription(req.description());
        p.setUsageNote(req.usageNote());
        p.setDeliveryMode(req.deliveryMode() == null || req.deliveryMode().isBlank()
                ? Product.DeliveryMode.AUTO_CARD
                : Product.DeliveryMode.valueOf(req.deliveryMode()));
        if (p.getDeliveryMode() == Product.DeliveryMode.MANUAL) {
            manualDeliveryFormService.validateSchema(req.manualFormSchema());
        }
        if (p.getDeliveryMode() == Product.DeliveryMode.PRESALE_VOUCHER) {
            if (req.presaleSaleEndAt() == null) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "预售商品必须设置停止销售时间");
            }
            if (req.presaleEndAt() == null) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "预售商品必须设置最晚交付保障时间");
            }
            if (!req.presaleEndAt().isAfter(req.presaleSaleEndAt())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "最晚交付保障时间必须晚于停止销售时间");
            }
            if (req.presaleStartAt() != null && req.presaleStartAt().isBefore(req.presaleSaleEndAt())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "预计开始交付时间不能早于停止销售时间");
            }
            if (req.presaleStartAt() != null && !req.presaleEndAt().isAfter(req.presaleStartAt())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "最晚交付保障时间必须晚于预计开始交付时间");
            }
        }
        p.setManualPrompt(req.manualPrompt());
        p.setManualFormSchema(req.manualFormSchema());
        p.setPresaleSaleEndAt(req.presaleSaleEndAt());
        p.setPresaleStartAt(req.presaleStartAt());
        p.setPresaleEndAt(req.presaleEndAt());
        p.setPresaleSettlementMode(req.presaleSettlementMode() == null || req.presaleSettlementMode().isBlank()
                ? "BALANCE" : req.presaleSettlementMode());
        p.setCoverImage(req.coverImage());
        p.setPrice(req.price());
        p.setMinOrderAmount(minOrderAmount);
        p.setMinBuy(req.minBuy());
        p.setMaxBuy(req.maxBuy());
        p.setVisible(req.visible());
        p.setSortOrder(req.sortOrder());
        p.setWholesaleRules(wholesalePricingService.validate(req.wholesaleRules(), req.price(), req.maxBuy()));
        return productRepository.save(p);
    }

    ProductCard toCard(Product p) {
        return new ProductCard(p.getId(), p.getCategoryId(), p.getName(), p.getBrief(), p.getCoverImage(),
                p.getPrice(), minOrderAmount(p), p.getStockCached(), p.getMinBuy(), p.getMaxBuy(), p.getDeliveryMode().name(),
                p.getPresaleSaleEndAt(), p.getPresaleStartAt(), p.getPresaleEndAt(), soldQuantity(p));
    }

    private Long soldQuantity(Product product) {
        return productSalesService.enabled() ? productSalesService.quantities().getOrDefault(product.getId(), 0L) : null;
    }

    private BigDecimal minOrderAmount(Product product) {
        return product.getMinOrderAmount() == null ? BigDecimal.ZERO : product.getMinOrderAmount();
    }
}
