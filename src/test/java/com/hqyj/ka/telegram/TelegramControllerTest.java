package com.hqyj.ka.telegram;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class TelegramControllerTest {
    private TelegramProperties properties() {
        var props = new TelegramProperties();
        props.setEnabled(true); props.setBotToken("123456:abcdefghijklmnopqrstuvwxyz0123456789");
        props.setWebhookSecret("01234567890123456789012345678901"); props.setSiteUrl("https://store.example");
        props.validate(); return props;
    }

    @Test void rejectsMissingOrForgedSecretBeforeParsingPayload() {
        var service = mock(TelegramService.class);
        var controller = new TelegramController(properties(), service, JsonMapper.builder().build());
        assertThatThrownBy(() -> controller.webhook(null, "not json")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> controller.webhook("forged", "{}")).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(service);
    }

    @Test void acceptsUnknownTelegramFieldsAndRejectsOversizedPayload() {
        var props = properties(); var service = mock(TelegramService.class);
        var controller = new TelegramController(props, service, JsonMapper.builder().build());
        assertThat(controller.webhook(props.getWebhookSecret(), """
                {"update_id":1,"new_api_field":true,"message":{"message_id":4,"from":{"id":2,"is_bot":false,"first_name":"test"},"chat":{"id":2,"type":"private"},"text":"/start"}}
                """).getStatusCode().value()).isEqualTo(200);
        verify(service).accept(argThat(u -> u.privateUserId() == 2L && u.updateId() == 1L));
        assertThatThrownBy(() -> controller.webhook(props.getWebhookSecret(), "x".repeat(32769)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test void validatesCredentialsAndOriginOnlyWhenEnabled() {
        var props = new TelegramProperties(); props.validate();
        assertThat(props.accepts("")).isFalse();
        props.setEnabled(true);
        assertThatThrownBy(props::validate).isInstanceOf(IllegalStateException.class);
        props = properties(); props.setSiteUrl("https://user:password@store.example");
        assertThatThrownBy(props::validate).isInstanceOf(IllegalStateException.class);
    }

    @Test void callbackIdentityMustMatchPrivateChatOwner() {
        var message = new TelegramUpdate.Message(null, new TelegramUpdate.Chat(10L, "private"), null);
        var update = new TelegramUpdate(1L, null,
                new TelegramUpdate.Callback("x", new TelegramUpdate.User(20L, false), message, "order:123"));
        assertThat(update.privateUserId()).isNull();
    }
}
