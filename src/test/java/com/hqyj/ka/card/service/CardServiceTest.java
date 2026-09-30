package com.hqyj.ka.card.service;

import com.hqyj.ka.card.entity.CardSecret;
import com.hqyj.ka.card.repo.CardSecretRepository;
import com.hqyj.ka.config.AppProperties;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CardServiceTest {

    @Test
    void tryAllocateReturnsEmptyWithoutMutatingPartialStock() {
        CardSecretRepository repository = mock(CardSecretRepository.class);
        CardService service = new CardService(repository, new AppProperties());
        CardSecret onlyCard = new CardSecret();
        when(repository.lockAvailable(7L, 2)).thenReturn(List.of(onlyCard));

        List<CardSecret> result = service.tryAllocate(7L, 2, 99L);

        assertTrue(result.isEmpty());
        assertEquals(CardSecret.Status.AVAILABLE, onlyCard.getStatus());
        assertNull(onlyCard.getOrderId());
        assertNull(onlyCard.getSoldAt());
    }

    @Test
    void tryAllocateMarksCompleteBatchSold() {
        CardSecretRepository repository = mock(CardSecretRepository.class);
        CardService service = new CardService(repository, new AppProperties());
        CardSecret first = new CardSecret();
        CardSecret second = new CardSecret();
        when(repository.lockAvailable(7L, 2)).thenReturn(List.of(first, second));

        List<CardSecret> result = service.tryAllocate(7L, 2, 99L);

        assertEquals(2, result.size());
        for (CardSecret card : result) {
            assertEquals(CardSecret.Status.SOLD, card.getStatus());
            assertEquals(99L, card.getOrderId());
        }
    }
}
