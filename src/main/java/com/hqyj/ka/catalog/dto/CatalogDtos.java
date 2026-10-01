package com.hqyj.ka.catalog.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public final class CatalogDtos {
    private CatalogDtos() {}

    public record CategoryView(Long id, String name, int sortOrder, boolean visible) {}

    public record ProductCard(Long id, Long categoryId, String name, String brief, String coverImage,
                              BigDecimal price, BigDecimal minOrderAmount, int stock, int minBuy, int maxBuy,
                              String deliveryMode, LocalDateTime presaleSaleEndAt,
                              LocalDateTime presaleStartAt, LocalDateTime presaleEndAt, Long soldQuantity) {}

    public record ProductDetail(Long id, Long categoryId, String name, String brief, String description,
                                String coverImage, BigDecimal price, BigDecimal minOrderAmount, int stock, int minBuy, int maxBuy,
                                String deliveryMode, String manualPrompt, String manualFormSchema,
                                LocalDateTime presaleSaleEndAt, LocalDateTime presaleStartAt, LocalDateTime presaleEndAt,
                                String presaleSettlementMode, Long soldQuantity) {}

    public record SaveCategoryRequest(Long id,
                                      @NotBlank @Size(max = 64) String name,
                                      int sortOrder, boolean visible) {}

    public record ReorderCategoriesRequest(@NotEmpty List<@NotNull Long> categoryIds) {}

    public record SaveProductRequest(Long id,
                                     @NotNull Long categoryId,
                                     @NotBlank @Size(max = 128) String name,
                                     @Size(max = 255) String brief,
                                     String description,
                                     String usageNote,
                                     @Pattern(regexp = "AUTO_CARD|MANUAL|PRESALE_VOUCHER") String deliveryMode,
                                     String manualPrompt,
                                     String manualFormSchema,
                                     LocalDateTime presaleSaleEndAt,
                                     LocalDateTime presaleStartAt,
                                     LocalDateTime presaleEndAt,
                                     @Pattern(regexp = "SINK|REFUND|BALANCE") String presaleSettlementMode,
                                     @Size(max = 255) String coverImage,
                                     @NotNull @DecimalMin(value = "0.01") @Digits(integer = 14, fraction = 2) BigDecimal price,
                                     @DecimalMin(value = "0.00") @Digits(integer = 14, fraction = 2) BigDecimal minOrderAmount,
                                     @Min(1) int minBuy,
                                     @Min(1) @Max(1000) int maxBuy,
                                     boolean visible,
                                     int sortOrder, String wholesaleRules) {}
}
