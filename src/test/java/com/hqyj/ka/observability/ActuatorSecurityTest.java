package com.hqyj.ka.observability;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ActuatorSecurityTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private OpsSignals signals;

    @Test
    void healthIsPublicAndHidesComponents() throws Exception {
        mvc.perform(get("/actuator/health").with(from("203.0.113.8")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").exists())
                .andExpect(jsonPath("$.components").doesNotExist())
                .andExpect(jsonPath("$.details").doesNotExist());
    }

    @Test
    void prometheusIsLoopbackOnlyAndDoesNotTrustForwardedHeader() throws Exception {
        mvc.perform(get("/actuator/prometheus").with(from("127.0.0.1")))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("ka_notify_failures")))
                .andExpect(content().string(containsString("ka_db_pool_pending")))
                .andExpect(content().string(containsString("ka_orders_paid_undelivered")));

        mvc.perform(get("/actuator/prometheus").with(from("203.0.113.8"))
                        .header("X-Forwarded-For", "127.0.0.1"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().string(not(containsString("ka_notify_failures"))));
    }

    @Test
    void recentNotifyFailureDegradesHealthWithoutFailingTheProbe() throws Exception {
        signals.notifyFailed("email");
        mvc.perform(get("/actuator/health").with(from("203.0.113.8")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DEGRADED"))
                .andExpect(jsonPath("$.components").doesNotExist());
    }

    private static RequestPostProcessor from(String ip) {
        return request -> {
            request.setRemoteAddr(ip);
            return request;
        };
    }
}
