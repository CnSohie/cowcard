package com.hqyj.ka.telegram;

import com.hqyj.ka.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/telegram")
@RequiredArgsConstructor
@ConditionalOnProperty(name = "ka.telegram.enabled", havingValue = "true")
public class TelegramController {
    private final TelegramProperties properties;
    private final TelegramService service;
    private final JsonMapper mapper;

    @PostMapping("/webhook")
    public ResponseEntity<Void> webhook(
            @RequestHeader(value = "X-Telegram-Bot-Api-Secret-Token", required = false) String secret,
            @RequestBody String body) {
        if (!properties.accepts(secret)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (body.length() > 32_768) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE);
        TelegramUpdate update;
        try { update = mapper.readValue(body, TelegramUpdate.class); }
        catch (RuntimeException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST); }
        if (update == null || update.updateId() == null || update.updateId() < 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        service.accept(update);
        return ResponseEntity.ok().build();
    }

    public record TicketRequest(@NotNull @Pattern(regexp = "[A-Za-z0-9_-]{43}") String ticket) {}

    @PostMapping("/ticket")
    public ResponseEntity<ApiResponse<TelegramService.WebOrder>> exchange(@Valid @RequestBody TicketRequest req) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer")
                .body(ApiResponse.ok(service.exchange(req.ticket())));
    }
}
