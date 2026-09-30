# 本机旧库首次接入迁移演练记录

2026-09-29 启动失败根因：ka 已有业务表，但没有 flyway_schema_history。

隔离演练已完成：
- 将本机 MySQL 9.6 的 ka 完整逻辑备份恢复到隔离 MySQL 9.6 实例。
- 对比 V1 的字段、类型、默认值、索引及约束，生成同目录专用桥接 SQL。
- 预售订单唯一性及 NULL SKU 规范化后唯一性检查无冲突。
- 4 条历史提现的手续费、净额为 NULL，按现有 DTO 兼容规则回填 0 与申请金额。
- 隔离副本执行桥接、显式 baseline 1、V2/V3 migrate、Flyway validate 均通过。
- 采用 Spring Boot 相同的字段命名策略，全部 JPA 实体 Hibernate validate 通过。
- 30 张业务表逐字段对比通过（对历史 NULL 使用上述兼容规则）；71 笔订单、5 笔提现保留。

备份及核账哈希：`data/backups/20260929-141400/`，此目录已由 data/ 规则排除 Git。
桥接 SQL 仅适用于本次核对的旧库；其他数据库需重新比对，不可通用执行。

用户于本会话明确授权后，2026-09-29 14:17 对本机 ka 原库执行完成：
- 写入前再次与隔离副本核对 30 张业务表，一致。
- 执行专用桥接 SQL，显式 baseline 1，应用 V2、V3。
- flyway_schema_history 中 V1 BASELINE、V2 SQL、V3 SQL 全部 success=1。
- Flyway validate 与全部 JPA 实体结构校验通过。
- 写入后再次逐字段核对 30 张业务表通过；71 笔订单、5 笔提现保留。
- payout_amount、payout_currency、payout_fx_rate 三列已确认存在。

未开启 baseline-on-migrate，未关闭 Hibernate validate。用户可按原方式重启应用。
本次验证未启动完整业务应用，避免触发定时关单、扫链及通知；验证结果限于数据库迁移、实体结构及数据一致性。

