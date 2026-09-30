-- 补齐旧 schema.sql 遗漏的工单消息表。
CREATE TABLE IF NOT EXISTS support_ticket_message (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT NOT NULL,
  sender_type VARCHAR(16) NOT NULL,
  sender_name VARCHAR(128),
  content TEXT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  KEY idx_ticket_msg_ticket (ticket_id, id)
) ENGINE=InnoDB;
