package com.hqyj.ka.security;

import com.hqyj.ka.member.repo.MemberRepository;
import com.hqyj.ka.user.repo.UserRepository;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class JwtAuthenticationFilterTest {
    @AfterEach
    void clearSecurityContext() { SecurityContextHolder.clearContext(); }

    @Test
    void expiredTokenCannotCreateGuestOrderOrReachCaptcha() throws Exception {
        var jwt = mock(JwtService.class);
        var filter = new JwtAuthenticationFilter(jwt, mock(MemberRepository.class), mock(UserRepository.class));
        var request = new MockHttpServletRequest("POST", "/api/orders");
        request.addHeader("Authorization", "Bearer expired");
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);
        when(jwt.parse("expired")).thenReturn(null);

        filter.doFilter(request, response, chain);

        assertEquals(401, response.getStatus());
        assertTrue(response.getContentAsString().contains("\"code\":401"));
        verifyNoInteractions(chain);
        assertNull(request.getAttribute("mid"));
    }

    @Test
    void staleBearerDoesNotBlockExplicitLogin() throws Exception {
        var jwt = mock(JwtService.class);
        var filter = new JwtAuthenticationFilter(jwt, mock(MemberRepository.class), mock(UserRepository.class));
        var request = new MockHttpServletRequest("POST", "/api/member/auth/login");
        request.addHeader("Authorization", "Bearer expired");
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);
        filter.doFilter(request, response, chain);
        verify(chain).doFilter(request, response);
        verifyNoInteractions(jwt);
    }

    @Test
    void guestWithoutAuthorizationCanStillOrder() throws Exception {
        var filter = new JwtAuthenticationFilter(mock(JwtService.class), mock(MemberRepository.class), mock(UserRepository.class));
        var request = new MockHttpServletRequest("POST", "/api/orders");
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);
        filter.doFilter(request, response, chain);
        verify(chain).doFilter(request, response);
    }
}
