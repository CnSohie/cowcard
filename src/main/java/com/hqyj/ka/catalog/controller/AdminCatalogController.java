package com.hqyj.ka.catalog.controller;

import com.hqyj.ka.catalog.dto.CatalogDtos.SaveCategoryRequest;
import com.hqyj.ka.catalog.dto.CatalogDtos.SaveProductRequest;
import com.hqyj.ka.catalog.entity.Category;
import com.hqyj.ka.catalog.entity.Product;
import com.hqyj.ka.catalog.service.CatalogService;
import com.hqyj.ka.common.ApiResponse;
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

    @GetMapping("/categories")
    @PreAuthorize("hasAuthority('product:read')")
    public ApiResponse<List<Category>> categories() {
        return ApiResponse.ok(catalogService.allCategories());
    }

    @PostMapping("/categories")
    @PreAuthorize("hasAuthority('product:write')")
    public ApiResponse<Category> saveCategory(@Valid @RequestBody SaveCategoryRequest req) {
        return ApiResponse.ok(catalogService.saveCategory(req));
    }

    @GetMapping("/products")
    @PreAuthorize("hasAuthority('product:read')")
    public ApiResponse<List<Product>> products() {
        return ApiResponse.ok(catalogService.allProducts());
    }

    @PostMapping("/products")
    @PreAuthorize("hasAuthority('product:write')")
    public ApiResponse<Product> saveProduct(@Valid @RequestBody SaveProductRequest req) {
        return ApiResponse.ok(catalogService.saveProduct(req));
    }
}
