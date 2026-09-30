# 数据库迁移

主站使用 Spring Boot 管理版本的 Flyway starter + flyway-mysql。社区数据库仍独立管理，不要对社区运行主站迁移。

## 唯一来源与启动顺序

`src/main/resources/db/migration/V1__initial_schema.sql` 是引入迁移时的结构快照，V2 补齐旧脚本缺失的工单消息表。Flyway 在 JPA 初始化前迁移并检查历史校验和，Hibernate `validate` 再核对实体。开发和生产不再使用 `update`；`schema.sql` 仅为废弃入口提示，`db-init.sql` 只创建开发库及账号。RBAC 等种子数据继续由 DataInitializer 幂等初始化。

默认禁止自动 baseline、clean 和乱序迁移。不要通过关闭校验或修改历史记录绕过启动失败。Hibernate 的结构校验并不覆盖所有索引、约束、长度及默认值，不能替代数据库结构比对。

## 新数据库

开发：`mysql -u root -p < db-init.sql`，然后启动应用。
生产：按 DEPLOY.md 创建空库与 DML 运行账号，另建迁移账号（密码自行设置）：

```sql
CREATE USER 'ka_migrator'@'localhost' IDENTIFIED BY '<独立强密码>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON ka.* TO 'ka_migrator'@'localhost';
```

在 `.env` 设置 `SPRING_FLYWAY_USER`、`SPRING_FLYWAY_PASSWORD`。Flyway 与应用使用同一 JDBC URL，迁移账号独立连接；正常启动执行 V1、V2 并生成 `flyway_schema_history`。应用账号无需 DDL 权限。开发环境不设置这些变量时使用 datasource 账号。

## 已上线数据库首次接入

**不能直接给未知旧库标记 V1，更不能开启 baseline-on-migrate。** 旧脚本和 Hibernate update 产生的结构可能不同。

1. 停止应用及所有写入任务，备份数据库（包含触发器/事件）并确认能在隔离库恢复。保留旧应用包与 AES 主密钥。
2. 将备份恢复到隔离演练库。另建一个空参考库，运行本版本迁移得到标准结构。
3. 用 `SHOW CREATE TABLE` / `information_schema.columns`、`statistics`、`table_constraints` 比较演练库与 V1：逐表核对字段、类型/精度、可空性、默认值、主键、唯一约束、外键和索引。重点核对订单金额、钱包余额、提现净额，以及支付流水 `channel_trade_no`、链上 `tx_hash` 和金额占位 `unique_key` 的唯一约束。检查重复值与 NULL 后再加约束。
4. 对差异编写针对该旧版本的、可审阅的桥接 SQL，先在演练库执行并归档到发布记录。不要从实体盲目推导 ALTER，也不要重新执行 V1 覆盖数据。必须回填的列先允许 NULL、分批回填、核账后再收紧。旧版本差异未知，本仓库不提供猜测式自动修复。
5. 确认演练库至少完整符合 V1 后，用 Flyway CLI **显式 baseline 版本 1**。CLI 使用与项目 `flyway-core` 相同版本（`./mvnw dependency:tree -Dincludes=org.flywaydb` 查看），连接凭据放环境变量，不写进命令历史：

```bash
# FLYWAY_URL / FLYWAY_USER / FLYWAY_PASSWORD 指向经过核对的隔离库
flyway -locations=filesystem:src/main/resources/db/migration -baselineVersion=1 baseline
flyway -locations=filesystem:src/main/resources/db/migration validate
flyway -locations=filesystem:src/main/resources/db/migration migrate
flyway -locations=filesystem:src/main/resources/db/migration info
```

V2 的 IF NOT EXISTS 仅用于兼容已被 Hibernate 创建的工单消息表；若表已存在，也必须核对其结构，IF NOT EXISTS 不会修复差异。然后启动应用，完成 JPA 校验、订单/支付/钱包和工单回归，核对迁移前后行数及金额汇总。

6. 演练通过后，在维护窗口对正式库重复相同备份、桥接、基线及升级步骤。再次核账，确认最新历史记录 success=1 后恢复流量。基线只做一次；以后每次部署自动执行新增版本。

## 后续变更与恢复

- 每次结构变化新增 `V3__description.sql`、`V4__description.sql` 等；已应用文件不可改名、删除或修改。实体与迁移同一次提交，多环境部署相同制品。
- 优先扩展→回填→切换→收缩，避免升级时删除旧应用仍使用的列；大表 ALTER 先评估锁表及磁盘空间。
- MySQL DDL 可能隐式提交，迁移失败不代表已执行语句自动回滚。停止重试，查看历史与实际结构；恢复备份或完成审阅后的前向修复，确认结构后才考虑 `repair`。repair 只修历史，不撤销 DDL，禁止盲用。
- 不提供自动 down/clean；常规回退优先回退兼容旧结构的应用包。必须恢复数据库时先停写，使用已演练的备份及 binlog/PITR 方案，核对外部支付入账和钱包流水后再开放服务，避免丢失升级后的交易。

## 验证

`./mvnw test` 包括真实迁移 SQL 在 H2 MySQL 模式下的新库迁移、重复迁移、旧库拒绝、显式基线及校验和篡改测试。普通业务测试继续用 H2 create-drop。

H2 不代表 MySQL 8：每次发布还须在一次性 MySQL 8 数据库执行上述新库与旧库演练。当前开发机未提供 MySQL/Docker，因此本次本地验证不包含真实 MySQL。不要用生产库作为测试数据库。

参考：[Spring Boot 数据库初始化](https://docs.spring.io/spring-boot/how-to/data-initialization.html)、[Flyway baseline](https://documentation.red-gate.com/flyway/reference/commands/baseline)。

提供空的一次性 MySQL 8 库后，可设置 `KA_MIGRATION_TEST_URL`、`KA_MIGRATION_TEST_USER`、`KA_MIGRATION_TEST_PASSWORD`，运行 `./mvnw -Dtest=MySqlMigrationTest test` 验证真实迁移与全部实体的 Hibernate 校验；未设置 URL 时该测试明确跳过。

现已加入自动 MySQL 8 容器验证：`./mvnw -Pmysql-it verify`，详见 [测试手册](TESTING.md)。该命令不依赖上述手动测试库环境变量。
