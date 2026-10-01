package com.hqyj.ka.order.controller;

import com.hqyj.ka.card.service.CardService;
import com.hqyj.ka.catalog.repo.ProductRepository;
import com.hqyj.ka.common.GlobalExceptionHandler;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.order.service.OrderService;
import com.hqyj.ka.security.CaptchaFilter;
import com.hqyj.ka.security.CaptchaService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.List;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class TokenOrderQueryTest {
    @Mock OrderRepository repository;
    @Mock PasswordEncoder passwords;
    @Mock CardService cards;
    @Mock ProductRepository products;
    @Mock CaptchaService captcha;
    @org.mockito.Spy com.hqyj.ka.security.JwtService jwt = new com.hqyj.ka.security.JwtService(jwtProps());
    static com.hqyj.ka.config.AppProperties jwtProps() {
        var props = new com.hqyj.ka.config.AppProperties();
        props.getSecurity().setJwtSecret(java.util.Base64.getEncoder().encodeToString(new byte[32]));
        return props;
    }
    @InjectMocks OrderService orders;
    MockMvc mvc;
    static final String TOKEN = "a".repeat(43);

    @BeforeEach void setup() {
        lenient().when(captcha.requiredFor(anyString())).thenReturn(true);
        mvc = MockMvcBuilders.standaloneSetup(new OrderController(orders))
                .setControllerAdvice(new GlobalExceptionHandler())
                .addFilters(new CaptchaFilter(captcha)).build();
    }

    private Order order() {
        var o = new Order(); o.setId(1L); o.setOrderNo("TEST"); o.setProductId(7L);
        o.setCreatedAt(java.time.LocalDateTime.now());
        o.setContact("buyer@example.com"); o.setQueryTokenHash("hash"); o.setStatus(Order.Status.DELIVERED);
        return o;
    }

    @Test void validTokenCanReadCardsWithCaptchaEnabledAndNoCaptchaProof() throws Exception {
        when(repository.findByOrderNo("TEST")).thenReturn(Optional.of(order()));
        when(passwords.matches(TOKEN, "hash")).thenReturn(true);
        when(cards.decryptForOrder(1L)).thenReturn(List.of("complete-secret"));
        mvc.perform(post("/api/orders/query-by-token").contentType(MediaType.APPLICATION_JSON)
                .content("{\"orderNo\":\"TEST\",\"queryToken\":\"" + TOKEN + "\"}"))
                .andExpect(jsonPath("$.code").value(0)).andExpect(jsonPath("$.data.cards[0]").value("complete-secret"));
        verify(captcha, never()).verify(any(), any(), any());
    }

    @Test void missingEmptyOrMalformedTokenCannotUseContactAsFallback() throws Exception {
        for (String value : List.of("null", "\"\"", "\"fake\"")) {
            mvc.perform(post("/api/orders/query-by-token").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"orderNo\":\"TEST\",\"contact\":\"buyer@example.com\",\"queryToken\":" + value + "}"))
                    .andExpect(jsonPath("$.code").value(400));
        }
        verifyNoInteractions(repository, cards);
    }

    @Test void wrongTokenCannotReadOrderEvenWithCorrectContact() throws Exception {
        when(repository.findByOrderNo("TEST")).thenReturn(Optional.of(order()));
        mvc.perform(post("/api/orders/query-by-token").contentType(MediaType.APPLICATION_JSON)
                .content("{\"orderNo\":\"TEST\",\"contact\":\"buyer@example.com\",\"queryToken\":\"" + TOKEN + "\"}"))
                .andExpect(jsonPath("$.code").value(3001));
        verifyNoInteractions(cards);
    }

    @Test void originalCredentialExpiresAfterSevenDays() throws Exception {
        var old = order(); old.setCreatedAt(java.time.LocalDateTime.now().minusDays(8));
        when(repository.findByOrderNo("TEST")).thenReturn(Optional.of(old));
        when(passwords.matches(TOKEN, "hash")).thenReturn(true);
        mvc.perform(post("/api/orders/query-by-token").contentType(MediaType.APPLICATION_JSON)
                .content("{\"orderNo\":\"TEST\",\"queryToken\":\"" + TOKEN + "\"}"))
                .andExpect(jsonPath("$.code").value(3005));
        verifyNoInteractions(cards);
    }

    @Test void signedHistoryWorksForOldOrdersWithoutExtendingExpiry() throws Exception {
        var old = order(); old.setCreatedAt(java.time.LocalDateTime.now().minusDays(30));
        when(repository.findByOrderNo("TEST")).thenReturn(Optional.of(old));
        var expiry = java.time.Instant.now().plusSeconds(3600).truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
        var token = jwt.createOrderHistoryToken("TEST", expiry);
        mvc.perform(post("/api/orders/query-by-token").contentType(MediaType.APPLICATION_JSON)
                .content("{\"orderNo\":\"TEST\",\"historyToken\":\"" + token + "\"}"))
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.historyToken").value(token));
        org.junit.jupiter.api.Assertions.assertEquals(expiry, jwt.orderHistoryExpiry(token, "TEST"));
        verify(captcha, never()).verify(any(), any(), any());
    }

    @Test void expiredForgedAndOtherOrderHistoryCredentialsAreRejected() throws Exception {
        when(repository.findByOrderNo("TEST")).thenReturn(Optional.of(order()));
        for (var token : List.of("forged", jwt.createOrderHistoryToken("TEST", java.time.Instant.now().minusSeconds(60)),
                jwt.createOrderHistoryToken("OTHER", java.time.Instant.now().plusSeconds(3600)),
                jwt.createMemberAccessToken(1L, "member", "v1"))) {
            mvc.perform(post("/api/orders/query-by-token").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"orderNo\":\"TEST\",\"historyToken\":\"" + token + "\"}"))
                    .andExpect(jsonPath("$.code").value(3005));
        }
        verifyNoInteractions(cards);
    }

    @Test void manualQueryIssuesSevenDayHistoryCredential() {
        when(repository.findByOrderNo("TEST")).thenReturn(Optional.of(order()));
        var before = java.time.Instant.now().plus(java.time.Duration.ofDays(7));
        var result = orders.query("TEST", "buyer@example.com", null, null);
        org.junit.jupiter.api.Assertions.assertFalse(result.historyExpiresAt().isBefore(before));
        org.junit.jupiter.api.Assertions.assertNotNull(jwt.orderHistoryExpiry(result.historyToken(), "TEST"));
        org.junit.jupiter.api.Assertions.assertNotEquals(com.hqyj.ka.security.JwtService.TYPE_ACCESS,
                jwt.parse(result.historyToken()).get("typ", String.class));
    }

    @Test void ordinaryQueryStillRequiresCaptcha() throws Exception {
        mvc.perform(post("/api/orders/query").contentType(MediaType.APPLICATION_JSON)
                .content("{\"orderNo\":\"TEST\",\"contact\":\"buyer@example.com\"}"))
                .andExpect(jsonPath("$.code").value(com.hqyj.ka.common.ErrorCode.CAPTCHA_INVALID.getCode()));
        verifyNoInteractions(repository, cards);
    }

    @Test void presaleTokenEndpointAlsoRejectsMissingOrWrongOrderCredential() throws Exception {
        mvc.perform(post("/api/orders/presale-token-by-token").contentType(MediaType.APPLICATION_JSON)
                .content("{\"orderNo\":\"TEST\"}"))
                .andExpect(jsonPath("$.code").value(400));
        when(repository.lockByOrderNo("TEST")).thenReturn(Optional.of(order()));
        mvc.perform(post("/api/orders/presale-token-by-token").contentType(MediaType.APPLICATION_JSON)
                .content("{\"orderNo\":\"TEST\",\"queryToken\":\"" + TOKEN + "\"}"))
                .andExpect(jsonPath("$.code").value(3001));
    }
}
