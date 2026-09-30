package com.hqyj.ka.catalog.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

/** 人工交付表单定义与买家提交内容的同源校验，防止绕过前端漏填或伪造字段。 */
@Service
@RequiredArgsConstructor
public class ManualDeliveryFormService {
    private static final String LEGACY_SCHEMA = "[{\"key\":\"delivery_details\",\"label\":\"交付所需信息\",\"type\":\"TEXTAREA\",\"required\":true,\"placeholder\":\"\"}]";
    private static final Set<String> TYPES = Set.of("TEXT", "EMAIL", "NUMBER", "SELECT", "TEXTAREA");
    private static final Pattern KEY = Pattern.compile("^[a-z][a-z0-9_]{0,31}$");
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]{1,64}@[^@\\s]{1,190}$");
    private final JsonMapper jsonMapper;

    public void validateSchema(String schema) {
        JsonNode root = parseArray(schema, "人工交付字段配置格式错误");
        if (root.isEmpty() || root.size() > 12) bad("人工交付至少配置 1 个字段,最多 12 个");
        Set<String> keys = new HashSet<>();
        Set<String> labels = new HashSet<>();
        for (JsonNode field : root) {
            String key = text(field, "key", 32);
            String label = text(field, "label", 40);
            String type = text(field, "type", 16);
            if (!KEY.matcher(key).matches() || !keys.add(key)) bad("人工交付字段标识重复或格式错误");
            if (label.isBlank() || !labels.add(label) || !TYPES.contains(type)) bad("人工交付字段名称重复或类型无效");
            if (field.has("placeholder") && field.path("placeholder").asText().length() > 120) bad("人工交付字段提示过长");
            if ("SELECT".equals(type)) {
                JsonNode options = field.path("options");
                if (!options.isArray() || options.isEmpty() || options.size() > 20) bad("下拉选择必须配置 1–20 个选项");
                for (JsonNode option : options) if (!option.isTextual() || option.asText().isBlank() || option.asText().length() > 50) bad("下拉选项格式错误");
            }
        }
    }

    public String validateSubmission(String schema, String submission) {
        String effectiveSchema = schema == null || schema.isBlank() ? LEGACY_SCHEMA : schema;
        validateSchema(effectiveSchema);
        JsonNode fields = parseArray(effectiveSchema, "人工交付字段配置格式错误");
        final JsonNode values;
        try { values = jsonMapper.readTree(submission == null ? "{}" : submission); }
        catch (Exception e) { throw new BusinessException(ErrorCode.BAD_REQUEST, "人工交付资料格式错误"); }
        if (!values.isObject()) bad("人工交付资料格式错误");
        ObjectNode normalized = jsonMapper.createObjectNode();
        Set<String> allowed = new HashSet<>();
        for (JsonNode field : fields) {
            String key = field.path("key").asText();
            String label = field.path("label").asText();
            String type = field.path("type").asText();
            boolean required = field.path("required").asBoolean(false);
            allowed.add(key);
            String value = values.path(key).isTextual() ? values.path(key).asText().trim() : "";
            int max = "TEXTAREA".equals(type) ? 1000 : 200;
            if (required && value.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "请填写" + label);
            if (value.length() > max) throw new BusinessException(ErrorCode.BAD_REQUEST, label + "内容过长");
            if (!value.isBlank() && "EMAIL".equals(type) && !EMAIL.matcher(value).matches()) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, label + "必须是有效邮箱");
            }
            if (!value.isBlank() && "NUMBER".equals(type) && !value.matches("^[0-9A-Za-z_-]{1,100}$")) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, label + "只能包含数字、字母、下划线或横线");
            }
            if (!value.isBlank() && "SELECT".equals(type)) {
                boolean found = false;
                for (JsonNode option : field.path("options")) if (value.equals(option.asText())) { found = true; break; }
                if (!found) throw new BusinessException(ErrorCode.BAD_REQUEST, label + "选项无效");
            }
            if (!value.isBlank()) normalized.put(label, value);
        }
        for (String key : values.propertyNames()) {
            if (!allowed.contains(key)) bad("人工交付资料包含未知字段");
        }
        return jsonMapper.writeValueAsString(normalized);
    }

    private JsonNode parseArray(String json, String message) {
        try {
            JsonNode root = jsonMapper.readTree(json == null ? "" : json);
            if (!root.isArray()) throw new IllegalArgumentException();
            return root;
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, message);
        }
    }

    private String text(JsonNode node, String key, int max) {
        JsonNode value = node.path(key);
        if (!value.isTextual() || value.asText().length() > max) bad("人工交付字段配置无效");
        return value.asText().trim();
    }

    private void bad(String message) { throw new BusinessException(ErrorCode.BAD_REQUEST, message); }
}
