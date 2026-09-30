ALTER TABLE withdraw_request
    ADD COLUMN payout_amount VARCHAR(64) NULL;
ALTER TABLE withdraw_request
    ADD COLUMN payout_currency VARCHAR(8) NULL;
ALTER TABLE withdraw_request
    ADD COLUMN payout_fx_rate DECIMAL(20,8) NULL;

-- 人民币历史申请可由原始金额恢复;USDT 无历史汇率,不能猜测。
UPDATE withdraw_request
SET payout_amount = CAST(COALESCE(net_amount, amount - COALESCE(fee_amount, 0)) AS CHAR(64)),
    payout_currency = 'CNY'
WHERE channel IN ('ALIPAY', 'BANK');
