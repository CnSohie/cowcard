ALTER TABLE product ADD COLUMN wholesale_rules TEXT NULL;
ALTER TABLE member_level ADD COLUMN manual_only BIT NOT NULL DEFAULT 0;
