-- 扫链游标补上最近成功/连续失败,确认中的意向记下命中时间。告警只在状态变化时落库。
ALTER TABLE chain_cursor
  ADD COLUMN last_success_at DATETIME(6) NULL,
  ADD COLUMN last_failure_at DATETIME(6) NULL,
  ADD COLUMN consecutive_failures INT NOT NULL DEFAULT 0,
  ADD COLUMN last_error VARCHAR(180) NULL,
  ADD COLUMN last_block_lag BIGINT NULL;

ALTER TABLE crypto_payment_intent
  ADD COLUMN detected_at DATETIME(6) NULL;

CREATE TABLE monitor_alert (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  alert_key VARCHAR(64) NOT NULL,
  title VARCHAR(80) NOT NULL,
  summary VARCHAR(300) NOT NULL,
  status VARCHAR(16) NOT NULL,
  first_seen_at DATETIME(6) NOT NULL,
  last_seen_at DATETIME(6) NOT NULL,
  recovered_at DATETIME(6) NULL,
  acked_at DATETIME(6) NULL,
  acked_by VARCHAR(64) NULL,
  notified_at DATETIME(6) NULL,
  recovery_notified_at DATETIME(6) NULL,
  KEY idx_monitor_alert_status (status, last_seen_at),
  KEY idx_monitor_alert_key (alert_key, status)
) ENGINE=InnoDB;
