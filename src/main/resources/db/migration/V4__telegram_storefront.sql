-- Bot state is isolated from the existing transaction schema. Secrets/payloads use KA_AES_KEY.
CREATE TABLE telegram_account (
    bot_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    draft_enc TEXT NULL,
    draft_expires_at DATETIME(6) NULL,
    rate_window DATETIME(6) NOT NULL,
    rate_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (bot_id, user_id)
);
CREATE TABLE telegram_inbox (
    bot_id BIGINT NOT NULL,
    update_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    payload_enc TEXT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    attempts INT NOT NULL DEFAULT 0,
    available_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (bot_id, update_id),
    INDEX idx_tg_inbox_pending (bot_id, done, available_at)
);
CREATE TABLE telegram_order (
    order_id BIGINT NOT NULL PRIMARY KEY,
    bot_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    query_token_enc TEXT NOT NULL,
    payment_enc TEXT NOT NULL,
    notified_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    created_at DATETIME(6) NOT NULL,
    INDEX idx_tg_order_owner (bot_id, user_id, order_id),
    CONSTRAINT fk_tg_order FOREIGN KEY (order_id) REFERENCES orders(id)
);
CREATE TABLE telegram_outbox (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    bot_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    method VARCHAR(32) NOT NULL,
    payload_enc TEXT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    attempts INT NOT NULL DEFAULT 0,
    available_at DATETIME(6) NOT NULL,
    lease_id VARCHAR(36) NULL,
    created_at DATETIME(6) NOT NULL,
    INDEX idx_tg_outbox_pending (bot_id, done, available_at)
);
CREATE TABLE telegram_ticket (
    token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
    order_id BIGINT NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    used_at DATETIME(6) NULL,
    INDEX idx_tg_ticket_expiry (expires_at),
    CONSTRAINT fk_tg_ticket_order FOREIGN KEY (order_id) REFERENCES telegram_order(order_id)
);
