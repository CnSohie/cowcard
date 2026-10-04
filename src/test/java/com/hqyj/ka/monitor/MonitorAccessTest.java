package com.hqyj.ka.monitor;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class MonitorAccessTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void anonymousCannotReadMonitor() throws Exception {
        mvc.perform(get("/api/admin/monitor/overview")).andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(authorities = {"KIND_ADMIN", "dashboard:read"})
    void dashboardPermissionCannotReadMonitor() throws Exception {
        mvc.perform(get("/api/admin/monitor/overview")).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/monitor/alerts")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(authorities = {"KIND_ADMIN", "monitor:read"})
    void monitorPermissionReadsChainsWithoutProbingThem() throws Exception {
        mvc.perform(get("/api/admin/monitor/overview"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.chains.length()").value(3))
                .andExpect(jsonPath("$.data.chains[0].chain").value("BASE"))
                .andExpect(jsonPath("$.data.chains[0].level").value("UNCONFIGURED"))
                .andExpect(jsonPath("$.data.chains[1].level").value("UNCONFIGURED"))
                .andExpect(jsonPath("$.data.chains[2].level").value("UNCONFIGURED"));
    }
}
