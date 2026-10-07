# 数据库测试

## 快速测试

```bash
./mvnw test
```

普通业务测试仍使用 H2；不能将其通过视为 MySQL 行为兼容证明。

## MySQL 8 集成测试（上线前必跑）

安装并启动支持 Testcontainers 的 Docker 环境后执行：

```bash
./mvnw -Pmysql-it verify
```

使用 Boot BOM 管理的 Testcontainers 2 依赖，自动启动独立 `mysql:8.0.36` 容器，随机宿主端口，无需安装 MySQL 或配置数据库密码。容器数据库由生产 Flyway 脚本创建，Hibernate 使用 `validate`，容器结束后销毁，不接触开发/生产数据库。镜像固定补丁版本以便复现；生产若使用其他 MySQL 8 补丁版本，需同步调整镜像并执行验证。

`MySqlDatabaseIT` 由 Failsafe 在 integration-test/verify 阶段运行；常规 `test` 不执行它。显式运行 `mysql-it` 时，Docker 不可用、拉镜像失败、迁移失败、实体不兼容均导致构建失败，没有 disabledWithoutDocker 或 H2 回退。首次运行需要网络拉取依赖及镜像。

覆盖：

- 真实 MySQL 上运行所有 Flyway 迁移及实体校验，重复迁移不重放。
- Repository 原生 `FOR UPDATE SKIP LOCKED`：第二事务在第一事务持锁期间拿到不同卡密；回滚后卡密重新可用。
- 两个独立事务并发扣款，余额不足的请求失败，余额不透支。
- 支付订单 CAS 并发只成功一次。
- 提现冻结事务失败后，可用余额和冻结金额一同回滚。
- `tx_hash`、金额占位及渠道流水号唯一约束拒绝重复，链上唯一字段支持多行 NULL。
- JPA 重新读取 DECIMAL(20,2)、DECIMAL(20,6) 及超 Long 范围的 18 位代币最小单位字符串，保持精度。
- 默认 REPEATABLE READ：同一事务不读到并发提交的新余额，新事务可见。

并发测试无外层测试事务，数据先提交再启动竞争线程；使用同步信号与超时，不依赖 sleep。测试使用独立随机业务标识，互不依赖执行顺序。此套件验证数据库关键行为，不能替代完整支付回调/链上确认的端到端测试。

`.github/workflows/mysql-integration.yml` 在后端相关 PR/push 自动执行完整 `verify` 并上传 Surefire/Failsafe 报告。仓库管理员可将 `mysql-integration` 设置为合并必需检查；仅添加 workflow 不会自动更改分支保护规则。

此前 `MySqlMigrationTest` 保留为外部一次性 MySQL 库的手动诊断入口，新集成套件不依赖它的环境变量，也不会因其被跳过而省略容器测试。

参考：[Testcontainers MySQL 模块](https://java.testcontainers.org/modules/databases/mysql/)。

## 2026-10-07 首页紧凑布局与轮播控件

`frontend/tests/storefront-layout.smoke.cjs` 覆盖九种屏宽、四主题、深浅模式，校验轮播控件独占内容下方一行、六屏长短文案切换与自动播放、桌面四列紧凑卡片、32px 描边操作提示、16:10 封面与移动端裸箭头。另用触摸设备配置模拟进入商品后返回、滚动、主题切换，确认不触发旧 CoW 圆形装饰与粘滞悬停背景。`catalog.smoke.cjs` 保留 157 商品/40 分类筛选分页，并补充 640/767/1200px 断点和异步加载等待。布局、目录、商城查单/模拟支付三套浏览器回归、TypeScript 与 Vite 构建已通过；真实 iPhone Safari 未执行。
