package com.hqyj.ka.sysconfig.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.util.HashSet;
import java.util.Set;

/** 首页轮播 JSON 校验:限制数量/长度/版式,拒绝 javascript: 等危险链接。 */
@Component
@RequiredArgsConstructor
public class HeroSlideConfigValidator {
    public static final String CONFIG_KEY = "site.hero_slides";
    private static final Set<String> LAYOUTS = Set.of("illustration", "payments", "steps", "image-right", "image-cover");
    private static final Set<String> TONES = Set.of("accent", "primary", "soft");

    private final JsonMapper jsonMapper;

    public void validate(String json) {
        if (json == null || json.isBlank()) return; // 留空=使用前端内置默认轮播
        final JsonNode root;
        try {
            root = jsonMapper.readTree(json);
        } catch (Exception e) {
            bad("首页轮播配置不是合法 JSON");
            return;
        }
        if (!root.isArray() || root.isEmpty() || root.size() > 6) bad("首页轮播需配置 1~6 屏");
        Set<String> ids = new HashSet<>();
        for (JsonNode slide : root) {
            if (!slide.isObject()) bad("首页轮播数据格式不正确");
            String layout = text(slide, "layout");
            String tone = text(slide, "tone");
            String id = text(slide, "id");
            boolean enabled = !slide.path("enabled").isBoolean() || slide.path("enabled").asBoolean();
            if (id.isBlank() || !ids.add(id)) bad("轮播 ID 不能为空或重复");
            if (!LAYOUTS.contains(layout)) bad("首页轮播版式不正确");
            if (!TONES.contains(tone)) bad("首页轮播配色不正确");
            if (enabled && text(slide, "titleZh").isBlank() && text(slide, "titleEn").isBlank()) bad("已启用的每屏至少需要一个标题");
            limit(slide, "id", 80);
            limit(slide, "eyebrowZh", 40);
            limit(slide, "eyebrowEn", 80);
            limit(slide, "titleZh", 60);
            limit(slide, "titleEn", 100);
            limit(slide, "highlightZh", 30);
            limit(slide, "highlightEn", 60);
            limit(slide, "descriptionZh", 220);
            limit(slide, "descriptionEn", 320);
            limit(slide, "ctaLabelZh", 20);
            limit(slide, "ctaLabelEn", 40);
            chips(slide, "chipsZh");
            chips(slide, "chipsEn");
            safeUrl(text(slide, "ctaUrl"), false);
            safeUrl(text(slide, "imageUrl"), true);
            if (enabled && ("image-right".equals(layout) || "image-cover".equals(layout)) && text(slide, "imageUrl").isBlank()) {
                bad("图片版式必须上传图片");
            }
        }
    }

    private void chips(JsonNode slide, String key) {
        JsonNode node = slide.path(key);
        if (node.isMissingNode() || node.isNull()) return;
        if (!node.isArray() || node.size() > 4) bad("每屏最多配置 4 个标签");
        for (JsonNode chip : node) if (!chip.isTextual() || chip.asText().length() > 40) bad("轮播标签过长");
    }

    private void limit(JsonNode slide, String key, int max) {
        if (text(slide, key).length() > max) bad("轮播字段 " + key + " 过长");
    }

    private String text(JsonNode node, String key) {
        JsonNode value = node.path(key);
        return value.isTextual() ? value.asText().strip() : "";
    }

    private void safeUrl(String value, boolean image) {
        if (value.isBlank()) return;
        if (!image && value.matches("^#[A-Za-z][A-Za-z0-9_-]{0,63}$")) return;
        if (value.startsWith("/")) {
            if (value.startsWith("//")) bad("轮播链接不能使用协议相对地址");
            if (image && !value.startsWith("/files/")) bad("轮播图片必须来自本站 /files/ 或 HTTPS");
            return;
        }
        try {
            URI uri = URI.create(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) bad("轮播外部链接必须使用 HTTPS");
        } catch (IllegalArgumentException e) {
            bad("轮播链接格式不正确");
        }
    }

    private void bad(String message) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, message);
    }
}
