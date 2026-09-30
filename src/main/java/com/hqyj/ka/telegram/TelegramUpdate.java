package com.hqyj.ka.telegram;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record TelegramUpdate(@JsonProperty("update_id") Long updateId, Message message,
                             @JsonProperty("callback_query") Callback callback) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record User(Long id, @JsonProperty("is_bot") boolean bot) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Chat(Long id, String type) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Message(User from, Chat chat, String text) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Callback(String id, User from, Message message, String data) {}

    /** Only verified, private, user-owned conversations can create/query orders. */
    public Long privateUserId() {
        Message m = callback == null ? message : callback.message();
        User user = callback == null ? (message == null ? null : message.from()) : callback.from();
        if (m == null || m.chat() == null || user == null || user.bot() || user.id() == null
                || user.id() <= 0 || !"private".equals(m.chat().type()) || !user.id().equals(m.chat().id())) return null;
        return user.id();
    }
}
