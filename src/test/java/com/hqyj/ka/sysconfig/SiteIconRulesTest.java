package com.hqyj.ka.sysconfig;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.sysconfig.service.SiteIconRules;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SiteIconRulesTest {

    @Test
    void blankMeansBuiltInIcon() {
        assertEquals("", SiteIconRules.normalize(null));
        assertEquals("", SiteIconRules.normalize("  "));
    }

    @Test
    void acceptsUploadedPath() {
        assertEquals("/files/202610/a1b2c3.png", SiteIconRules.normalize(" /files/202610/a1b2c3.png "));
        assertEquals("/files/202610/mark.webp", SiteIconRules.normalize("/files/202610/mark.webp"));
    }

    @Test
    void rejectsOutsideUpload() {
        assertThrows(BusinessException.class, () -> SiteIconRules.normalize("https://evil.example/icon.png"));
        assertThrows(BusinessException.class, () -> SiteIconRules.normalize("/favicon.svg"));
        assertThrows(BusinessException.class, () -> SiteIconRules.normalize("/files/../application.yml"));
        assertThrows(BusinessException.class, () -> SiteIconRules.normalize("javascript:alert(1)"));
    }
}
