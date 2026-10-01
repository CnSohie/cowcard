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
