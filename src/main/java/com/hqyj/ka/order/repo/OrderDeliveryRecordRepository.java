package com.hqyj.ka.order.repo;

import com.hqyj.ka.order.entity.OrderDeliveryRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OrderDeliveryRecordRepository extends JpaRepository<OrderDeliveryRecord, Long> {
    List<OrderDeliveryRecord> findByOrderIdOrderByIdDesc(Long orderId);
}
