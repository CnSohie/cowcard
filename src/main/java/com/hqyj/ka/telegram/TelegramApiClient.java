package com.hqyj.ka.telegram;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import java.util.Set;

@Component
@ConditionalOnProperty(name = "ka.telegram.enabled", havingValue = "true")
public class TelegramApiClient {
    public record Result(boolean ok, boolean retryable, int retryAfterSeconds) {}
    private final RestClient client;
    private final TelegramProperties properties;
    private final JsonMapper mapper;

    public TelegramApiClient(TelegramProperties properties, JsonMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(5));
        this.client = RestClient.builder().requestFactory(factory).build();
    }

    public Result send(String method, Map<?, ?> payload) {
        if (!Set.of("sendMessage", "answerCallbackQuery").contains(method)) return new Result(false, false, 0);
        try {
            return client.post().uri("https://api.telegram.org/bot" + properties.getBotToken() + "/" + method)
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON).body(payload)
                    .exchange((request, response) -> {
                        JsonNode body = mapper.readTree(response.getBody());
                        int code = response.getStatusCode().value();
                        if (code == 200 && body != null && body.path("ok").asBoolean()) return new Result(true, false, 0);
                        int apiCode = body == null ? code : body.path("error_code").asInt(code);
                        int retry = body == null ? 0 : body.path("parameters").path("retry_after").asInt(0);
                        return new Result(false, apiCode == 429 || apiCode >= 500,
                                Math.max(0, Math.min(retry, 86_400)));
                    });
        } catch (Exception ignored) {
            // HTTP exception text can contain the Bot Token in its URL. Never log it or return it.
            return new Result(false, true, 0);
        }
    }
}
