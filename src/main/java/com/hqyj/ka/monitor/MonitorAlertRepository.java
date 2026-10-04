package com.hqyj.ka.monitor;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface MonitorAlertRepository extends JpaRepository<MonitorAlert, Long> {

    List<MonitorAlert> findByStatusOrderByLastSeenAtDesc(MonitorAlert.Status status);

    Optional<MonitorAlert> findFirstByAlertKeyAndStatus(String alertKey, MonitorAlert.Status status);

    long countByStatus(MonitorAlert.Status status);

    long countByStatusAndAckedAtIsNull(MonitorAlert.Status status);

    List<MonitorAlert> findTop20ByStatusOrderByRecoveredAtDesc(MonitorAlert.Status status);

    @Modifying
    @Query("delete from MonitorAlert a where a.status = com.hqyj.ka.monitor.MonitorAlert.Status.RECOVERED and a.recoveredAt < :before")
    int deleteRecoveredBefore(@Param("before") LocalDateTime before);
}
