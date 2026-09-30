package com.hqyj.ka.catalog.service;

import com.hqyj.ka.common.BusinessException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class ManualDeliveryFormServiceTest {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final ManualDeliveryFormService service = new ManualDeliveryFormService(mapper);
    private final String schema = """
            [{"key":"email","label":"接收邮箱","type":"EMAIL","required":true,"placeholder":"name@example.com"},
             {"key":"server","label":"区服","type":"SELECT","required":true,"placeholder":"","options":["国服","国际服"]}]
            """;

    @Test
    void validatesAndNormalizesConfiguredFields() throws Exception {
        String normalized = service.validateSubmission(schema, "{\"email\":\" user@example.com \",\"server\":\"国服\"}");
        JsonNode result = mapper.readTree(normalized);
        assertEquals("user@example.com", result.path("接收邮箱").asText());
        assertEquals("国服", result.path("区服").asText());
    }

    @Test
    void rejectsMissingInvalidAndUnknownFields() {
        assertThrows(BusinessException.class, () -> service.validateSubmission(schema, "{\"email\":\"bad\",\"server\":\"国服\"}"));
        assertThrows(BusinessException.class, () -> service.validateSubmission(schema, "{\"email\":\"a@b.com\"}"));
        assertThrows(BusinessException.class, () -> service.validateSubmission(schema, "{\"email\":\"a@b.com\",\"server\":\"国服\",\"admin\":\"1\"}"));
    }
}
