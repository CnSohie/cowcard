package com.hqyj.ka.sysconfig.service;

import com.hqyj.ka.common.BusinessException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class HeroSlideConfigValidatorTest {
    private final HeroSlideConfigValidator validator = new HeroSlideConfigValidator(JsonMapper.builder().build());

    @Test
    void acceptsValidImageSlide() {
        assertDoesNotThrow(() -> validator.validate("""
                [{"id":"one","enabled":true,"layout":"image-right","tone":"accent",
                  "titleZh":"新品上线","highlightZh":"限时优惠","descriptionZh":"首页活动介绍",
                  "chipsZh":["自动发货"],"ctaLabelZh":"立即购买","ctaUrl":"#products","imageUrl":"/files/banner.webp"}]
                """));
    }

    @Test
    void rejectsDangerousLink() {
        assertThrows(BusinessException.class, () -> validator.validate("""
                [{"id":"one","enabled":true,"layout":"illustration","tone":"soft",
                  "titleZh":"标题","ctaUrl":"javascript:alert(1)"}]
                """));
    }
}
