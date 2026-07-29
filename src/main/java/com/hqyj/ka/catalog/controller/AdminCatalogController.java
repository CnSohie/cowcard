package com.hqyj.ka.catalog.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.catalog.dto.CatalogDtos.SaveCategoryRequest;
import com.hqyj.ka.catalog.dto.CatalogDtos.SaveProductRequest;
import com.hqyj.ka.catalog.entity.Category;
import com.hqyj.ka.catalog.entity.Product;
import com.hqyj.ka.catalog.service.CatalogService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.security.RateLimitFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/catalog")
@RequiredArgsConstructor
public class AdminCatalogController {

    private final CatalogService catalogService;
    private final AuditService auditService;

    @GetMapping("/categories")
    @PreAuthorize("hasAuthority('product:read')")
    public ApiResponse<List<Category>> categories() {
        return ApiResponse.ok(catalogService.allCategories());
    }

    @PostMapping("/categories")
    @PreAuthorize("hasAuthority('product:write')")
    public ApiResponse<Category> saveCategory(@Valid @RequestBody SaveCategoryRequest req,
                                              HttpServletRequest http) {
        Category category = catalogService.saveCategory(req);
        auditService.record(String.valueOf(http.getAttribute("uname")),
                req.id() == null ? "CATEGORY_CREATE" : "CATEGORY_UPDATE",
                "category:" + category.getId(), RateLimitFilter.clientIp(http), category.getName());
        return ApiResponse.ok(category);
    }

    @GetMapping("/products")
    @PreAuthorize("hasAuthority('product:read')")
    public ApiResponse<List<Product>> products() {
        return ApiResponse.ok(catalogService.allProducts());
    }

    @PostMapping("/products")
    @PreAuthorize("hasAuthority('product:write')")
    public ApiResponse<Product> saveProduct(@Valid @RequestBody SaveProductRequest req,
                                            HttpServletRequest http) {
        Product product = catalogService.saveProduct(req);
        auditService.record(String.valueOf(http.getAttribute("uname")),
                req.id() == null ? "PRODUCT_CREATE" : "PRODUCT_UPDATE",
                "product:" + product.getId(), RateLimitFilter.clientIp(http),
                product.getName() + "|" + product.getDeliveryMode().name() + "|" + product.getPrice());
        return ApiResponse.ok(product);
    }
}
