-- 旧可用余额全部归购物钱包;历史账本不改写。旧待审提现保留原占用,驳回只退购物钱包。
ALTER TABLE wallet_account ADD COLUMN withdrawable_balance DECIMAL(20,2) NOT NULL DEFAULT 0;
ALTER TABLE wallet_account ADD COLUMN withdrawable_frozen DECIMAL(20,2) NOT NULL DEFAULT 0;
ALTER TABLE wallet_account ADD COLUMN withdrawal_frozen DECIMAL(20,2) NOT NULL DEFAULT 0;
ALTER TABLE wallet_account ADD CONSTRAINT ck_wallet_split_nonnegative CHECK (
    balance >= 0 AND frozen >= 0 AND withdrawable_balance >= 0
    AND withdrawable_balance <= balance AND withdrawable_frozen >= 0
    AND withdrawable_frozen <= frozen AND withdrawal_frozen >= 0
);
UPDATE wallet_account
SET withdrawal_frozen = COALESCE((SELECT SUM(r.amount) FROM withdraw_request r
    WHERE r.member_id = wallet_account.member_id AND r.status = 'PENDING'), 0);
-- 若旧冻结不足覆盖待审提现,约束将拒绝升级;发布前须核对并处理,禁止猜测式补钱。
UPDATE wallet_account SET frozen = frozen - withdrawal_frozen;

ALTER TABLE withdraw_request ADD COLUMN withdrawable_source BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE withdraw_request ALTER COLUMN withdrawable_source SET DEFAULT TRUE;

ALTER TABLE wallet_txn ADD COLUMN shopping_amount DECIMAL(20,2) NULL;
ALTER TABLE wallet_txn ADD COLUMN withdrawable_amount DECIMAL(20,2) NULL;
ALTER TABLE wallet_txn ADD COLUMN shopping_balance_after DECIMAL(20,2) NULL;
ALTER TABLE wallet_txn ADD COLUMN withdrawable_balance_after DECIMAL(20,2) NULL;
