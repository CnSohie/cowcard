package com.hqyj.ka.payment.repo;

import com.hqyj.ka.payment.entity.PaymentChannel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PaymentChannelRepository extends JpaRepository<PaymentChannel, Long> {
    Optional<PaymentChannel> findByCode(String code);
    Optional<PaymentChannel> findByCodeAndEnabledTrue(String code);
    List<PaymentChannel> findByEnabledTrueOrderBySortOrderAsc();
}
