package com.hqyj.ka.member.service;

import com.hqyj.ka.catalog.entity.Product;
import com.hqyj.ka.catalog.service.WholesalePricingService;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.member.entity.*;
import com.hqyj.ka.member.repo.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MemberWholesalePricingTest {
    final MemberLevelRepository levels = mock(MemberLevelRepository.class);
    final MemberLevelPriceRepository prices = mock(MemberLevelPriceRepository.class);
    final MemberRepository members = mock(MemberRepository.class);
    final WholesalePricingService wholesale = new WholesalePricingService(JsonMapper.builder().build(), levels);
    final MemberLevelService service = new MemberLevelService(levels, prices, members, wholesale);
    Product product;
    Member member;
    MemberLevel agent;

    @BeforeEach
    void setup() {
        product = new Product(); product.setId(7L); product.setPrice(new BigDecimal("10.00")); product.setMaxBuy(100);
        product.setWholesaleRules("[{\"minQuantity\":10,\"unitPrice\":8.00,\"levelId\":null},{\"minQuantity\":20,\"unitPrice\":7.00,\"levelId\":null},{\"minQuantity\":10,\"unitPrice\":6.00,\"levelId\":2}]");
        member = new Member(); member.setId(1L); member.setLevelId(2L);
        agent = new MemberLevel(); agent.setId(2L); agent.setName("代理"); agent.setManualOnly(true); agent.setSortWeight(1);
        agent.setDiscountRate(new BigDecimal("90.00"));
        when(members.findById(1L)).thenReturn(Optional.of(member));
        when(levels.findById(2L)).thenReturn(Optional.of(agent));
    }

    @Test void guestQuantityThresholdsAndPrivatePricesStayPrivate() {
        assertEquals(new BigDecimal("10.00"), service.priceFor(null, product, 9).unitPrice());
        var atTen = service.priceFor(null, product, 10);
        assertEquals(new BigDecimal("8.00"), atTen.unitPrice());
        assertEquals("WHOLESALE", atTen.source());
        assertEquals(2, atTen.wholesaleTiers().size());
        assertEquals(new BigDecimal("7.00"), service.priceFor(null, product, 20).unitPrice());
        verifyNoInteractions(members);
    }

    @Test void onlyExactEnabledLevelGetsExclusivePriceAndDiscountsDoNotStack() {
        assertEquals(new BigDecimal("9.00"), service.priceFor(1L, product, 9).unitPrice());
        assertEquals(new BigDecimal("6.00"), service.priceFor(1L, product, 10).unitPrice());
        agent.setEnabled(false);
        assertEquals(new BigDecimal("8.00"), service.priceFor(1L, product, 10).unitPrice());
        agent.setEnabled(true); agent.setId(3L); agent.setSortWeight(100);
        assertEquals(new BigDecimal("8.00"), service.priceFor(1L, product, 10).unitPrice());
    }

    @Test void lowerMemberProductPriceWinsOverWholesale() {
        var special = new MemberLevelPrice(); special.setPrice(new BigDecimal("5.00"));
        when(prices.findByLevelIdAndProductIdAndSkuCode(2L, 7L, "")).thenReturn(Optional.of(special));
        var result = service.priceFor(1L, product, 20);
        assertEquals(new BigDecimal("5.00"), result.unitPrice());
        assertEquals("PRODUCT_PRICE", result.source());
        assertEquals(new BigDecimal("5.00"), result.discountPerUnit());
    }

    @Test void invalidQuantityAndInvalidRulesAreRejected() {
        assertThrows(BusinessException.class, () -> service.priceFor(null, product, 0));
        assertThrows(BusinessException.class, () -> service.priceFor(null, product, 101));
        for (String json : List.of("null", "[null]", "[{\"minQuantity\":0,\"unitPrice\":1}]", "[{\"minQuantity\":101,\"unitPrice\":1}]", "[{\"minQuantity\":10,\"unitPrice\":11}]", "[{\"minQuantity\":10,\"unitPrice\":1.001}]", "[{\"minQuantity\":10,\"unitPrice\":1,\"levelId\":999}]", "[{\"minQuantity\":10,\"unitPrice\":1},{\"minQuantity\":10,\"unitPrice\":2}]")) {
            assertThrows(BusinessException.class, () -> wholesale.validate(json, product.getPrice(), 100), json);
        }
    }

    @Test void manualLevelsAreNeitherAutomaticallyGrantedNorAutomaticallyReplaced() {
        var normal = new MemberLevel(); normal.setId(3L); normal.setSortWeight(10); normal.setSpendThreshold(BigDecimal.ONE);
        agent.setSpendThreshold(BigDecimal.ONE); agent.setSortWeight(20);
        when(levels.findByEnabledTrueOrderBySortWeightDescIdDesc()).thenReturn(List.of(agent, normal));
        member.setLevelId(null);
        service.addSpend(1L, BigDecimal.TEN);
        assertEquals(3L, member.getLevelId());
        member.setLevelId(2L); agent.setSortWeight(1);
        service.addSpend(1L, BigDecimal.TEN);
        service.addRecharge(1L, BigDecimal.TEN);
        assertEquals(2L, member.getLevelId());
    }

    @Test void manualLevelCannotBecomeRegistrationDefaultButCanBeAssigned() {
        agent.setSlug("agent"); agent.setDefaultLevel(true);
        assertThrows(BusinessException.class, () -> service.saveLevel(agent));
        member.setLevelId(null);
        service.assignLevel(1L, 2L);
        assertEquals(2L, member.getLevelId());
    }
}
