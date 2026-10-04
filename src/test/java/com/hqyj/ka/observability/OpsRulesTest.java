package com.hqyj.ka.observability;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OpsRulesTest {

    @Test
    void stallWindowIsAtLeastTwoMinutesAndFourIntervals() {
        assertEquals(120_000L, OpsRules.stallAfterMs(15_000));
        assertEquals(240_000L, OpsRules.stallAfterMs(60_000));
        assertEquals(120_000L, OpsRules.stallAfterMs(0));
    }

    @Test
    void chainIsDownOnceTheStallWindowElapses() {
        assertEquals("UP", OpsRules.chainLevel(119, 120_000));
        assertEquals("DOWN", OpsRules.chainLevel(120, 120_000));
    }

    @Test
    void autoPresaleAndRechargeStickinessDoesNotTreatManualAsFailure() {
        assertFalse(OpsRules.fulfillmentStuck(1, 59L));
        assertTrue(OpsRules.fulfillmentStuck(1, 60L));
        assertTrue(OpsRules.fulfillmentStuck(1, null));
        assertFalse(OpsRules.fulfillmentStuck(0, null));
        assertEquals("UP", OpsRules.paidLevel(false, 1, 20L, 0, null, 0, null));
        assertEquals("DOWN", OpsRules.paidLevel(false, 1, 60L, 0, null, 0, null));
        assertEquals("DOWN", OpsRules.paidLevel(false, 0, null, 2, 90L, 0, null));
        assertEquals("DOWN", OpsRules.paidLevel(false, 0, null, 0, null, 1, 120L));
        assertEquals("DOWN", OpsRules.paidLevel(true, 0, null, 0, null, 0, null));
        assertEquals("UP", OpsRules.paidLevel(false, 0, null, 0, null, 0, null));
    }

    @Test
    void poolWaitsAreDownAndAFullPoolWithoutWaitersIsDegraded() {
        assertEquals("UP", OpsRules.poolLevel(true, 3, 0, 8));
        assertEquals("DEGRADED", OpsRules.poolLevel(true, 8, 0, 8));
        assertEquals("DOWN", OpsRules.poolLevel(true, 8, 1, 8));
        assertEquals("DEGRADED", OpsRules.poolLevel(false, 0, 0, 0));
    }

    @Test
    void notifyBlipDegradesAndWorstStatusPrefersDown() {
        assertEquals("UP", OpsRules.notifyLevel(0));
        assertEquals("DEGRADED", OpsRules.notifyLevel(1));
        assertEquals("DOWN", OpsRules.worst(List.of("UP", "DEGRADED", "DOWN")));
        assertEquals("DEGRADED", OpsRules.worst(List.of("UP", "DEGRADED")));
        assertEquals("UP", OpsRules.worst(List.of()));
    }

    @Test
    void sanitizeStripsUrlsTokensAndTruncates() {
        String url = OpsRules.sanitize(new IllegalStateException(
                "GET https://api.telegram.org/bot123456:AAEsecret/sendMessage failed"));
        assertEquals("IllegalStateException: GET [url] failed", url);
        assertFalse(url.contains("AAEsecret"));

        String secret = OpsRules.sanitize(new IllegalArgumentException("token=super-secret"));
        assertEquals("IllegalArgumentException: token=[redacted]", secret);

        assertEquals("NullPointerException", OpsRules.sanitize(new NullPointerException()));
        assertNull(OpsRules.sanitize(null));

        String longMessage = OpsRules.sanitize(new IllegalStateException("x".repeat(500)));
        assertEquals(OpsRules.ERROR_MAX, longMessage.length());
        assertTrue(longMessage.startsWith("IllegalStateException: "));
    }

    @Test
    void metricTagsRejectAnythingThatCouldBreakPrometheus() {
        assertEquals("BASE", OpsRules.metricTag(" BASE "));
        assertEquals("unknown", OpsRules.metricTag("base chain"));
        assertEquals("unknown", OpsRules.metricTag("bot123:secret"));
        assertEquals("unknown", OpsRules.metricTag(null));
    }
}
