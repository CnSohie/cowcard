package com.hqyj.ka.payment.crypto;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.order.service.OrderService;
import com.hqyj.ka.payment.crypto.controller.CryptoController;
import com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CryptoOrderAccessTest {
    @Mock OrderRepository orderRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock CryptoPaymentService crypto;
    @InjectMocks OrderService orders;
    private CryptoController controller;
    private Order order;
    private MockHttpServletRequest request;

    @BeforeEach
    void setUp() {
        controller = new CryptoController(crypto, orders);
        request = new MockHttpServletRequest();
        order = new Order();
        order.setMemberId(7L);
        order.setContact("buyer@example.com");
        order.setQueryTokenHash("token-hash");
        when(orderRepository.findByOrderNo("ORDER")).thenReturn(Optional.of(order));
    }

    private void read(String contact, String password, String token) {
        controller.intent("ORDER", null, null, null, contact, password, token, request);
    }

    private void submit(String contact, String password, String token) {
        controller.submitTx("ORDER", new CryptoController.SubmitTxRequest("0xhash", contact, password, token), request);
    }

    @Test
    void orderNumberAloneCannotReadOrTriggerChainVerification() {
        assertThrows(BusinessException.class, () -> read(null, null, null));
        assertThrows(BusinessException.class, () -> submit(null, null, null));
        verifyNoInteractions(crypto);
    }

    @Test
    void invalidTokenCannotFallBackToKnownContact() {
        assertThrows(BusinessException.class, () -> read(order.getContact(), null, "wrong"));
        assertThrows(BusinessException.class, () -> submit(order.getContact(), null, "wrong"));
        verifyNoInteractions(crypto);
    }

    @Test
    void otherMemberCannotUseOrderEvenWithGuestCredentials() {
        request.setAttribute("mid", 8L);
        assertThrows(BusinessException.class, () -> read(order.getContact(), null, "valid"));
        assertThrows(BusinessException.class, () -> submit(order.getContact(), null, "valid"));
        verifyNoInteractions(crypto);
    }

    @Test
    void guestTokenSupportsRestorePollingAndHashSubmission() {
        when(passwordEncoder.matches("valid", "token-hash")).thenReturn(true);
        read(null, null, "valid");
        controller.intent("ORDER", CryptoPaymentIntent.Mode.TRANSFER, "BSC", "USDT", null, null, "valid", request);
        submit(null, null, "valid");
        verify(crypto).intentView("ORDER");
        verify(crypto).intentView("ORDER", CryptoPaymentIntent.Mode.TRANSFER, "BSC", "USDT");
        verify(crypto).verifyWalletTx("ORDER", "0xhash");
    }

    @Test
    void owningMemberNeedsNoLocalGuestToken() {
        request.setAttribute("mid", 7L);
        read(null, null, null);
        submit(null, null, null);
        verify(crypto).intentView("ORDER");
        verify(crypto).verifyWalletTx("ORDER", "0xhash");
    }

    @Test
    void contactAndPasswordRecoveryStillWorks() {
        order.setQueryPasswordHash("password-hash");
        assertThrows(BusinessException.class, () -> read(order.getContact(), null, null));
        when(passwordEncoder.matches("secret", "password-hash")).thenReturn(true);
        read(order.getContact(), "secret", null);
        submit(order.getContact(), "secret", null);
        verify(crypto).verifyWalletTx("ORDER", "0xhash");
    }

    @Test
    void contactOnlyRecoveryRetainsExistingPolicyWhenNoPasswordWasSet() {
        read(order.getContact(), null, null);
        submit(order.getContact(), null, null);
        verify(crypto).verifyWalletTx("ORDER", "0xhash");
    }
}
