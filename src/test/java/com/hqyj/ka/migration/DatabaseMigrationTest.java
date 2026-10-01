package com.hqyj.ka.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

class DatabaseMigrationTest {
    private String url() {
        return "jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;NON_KEYWORDS=VALUE";
    }
    private Flyway flyway(String url) {
        return Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration")
                .baselineOnMigrate(false).cleanDisabled(true).validateMigrationNaming(true).load();
    }
    @Test
    void freshDatabaseAndRestart() {
        var flyway = flyway(url());
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(6);
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("6");
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThatThrownBy(flyway::clean).isInstanceOf(FlywayException.class);
    }
    @Test
    void refusesUnknownExistingSchema() throws Exception {
        var url = url();
        try (var c = DriverManager.getConnection(url, "sa", ""); var s = c.createStatement()) {
            s.execute("CREATE TABLE legacy_data (id BIGINT PRIMARY KEY)");
            s.execute("INSERT INTO legacy_data VALUES (42)");
        }
        assertThatThrownBy(() -> flyway(url).migrate()).isInstanceOf(FlywayException.class);
        try (var c = DriverManager.getConnection(url, "sa", ""); var s = c.createStatement();
             var result = s.executeQuery("SELECT id FROM legacy_data")) {
            assertThat(result.next()).isTrue();
            assertThat(result.getLong(1)).isEqualTo(42);
        }
    }
    @Test
    void explicitBaselinePreservesExistingData() throws Exception {
        var url = url();
        // Build a pre-Flyway V1 fixture using the actual frozen SQL, without history.
        try (var c = DriverManager.getConnection(url, "sa", ""); var reader = new java.io.InputStreamReader(
                getClass().getResourceAsStream("/db/migration/V1__initial_schema.sql"), java.nio.charset.StandardCharsets.UTF_8)) {
            org.h2.tools.RunScript.execute(c, reader);
            try (var s = c.createStatement()) {
                s.execute("INSERT INTO sys_config VALUES ('migration.sentinel', 'preserved')");
            }
        }
        var flyway = flyway(url);
        flyway.baseline();
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(5);
        try (var c = DriverManager.getConnection(url, "sa", ""); var s = c.createStatement();
             var r = s.executeQuery("SELECT cfg_value FROM sys_config WHERE cfg_key='migration.sentinel'")) {
            assertThat(r.next()).isTrue();
            assertThat(r.getString(1)).isEqualTo("preserved");
        }
    }
    @Test
    void legacyCnyBackfillsNetButCryptoKeepsUnknownRate() throws Exception {
        var url = url();
        Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration")
                .target("2").load().migrate();
        try (var c = DriverManager.getConnection(url, "sa", ""); var s = c.createStatement()) {
            s.execute("INSERT INTO withdraw_request (member_id,amount,fee_amount,net_amount,channel,account,status) VALUES (1,100,3.5,96.5,'ALIPAY','test','PENDING'),(2,100,3.5,96.5,'USDT_BEP20','0x1','PENDING')");
        }
        flyway(url).migrate();
        try (var c = DriverManager.getConnection(url, "sa", ""); var s = c.createStatement();
             var r = s.executeQuery("SELECT payout_amount,payout_currency,payout_fx_rate FROM withdraw_request ORDER BY member_id")) {
            assertThat(r.next()).isTrue();
            assertThat(new java.math.BigDecimal(r.getString(1).trim())).isEqualByComparingTo("96.50");
            assertThat(r.getString(2)).isEqualTo("CNY");
            assertThat(r.next()).isTrue();
            assertThat(r.getString(1)).isNull();
            assertThat(r.getBigDecimal(3)).isNull();
        }
    }
    @Test
    void rejectsChangedMigration(@TempDir Path dir) throws Exception {
        var script = dir.resolve("V1__fixture.sql");
        Files.writeString(script, "CREATE TABLE fixture (id BIGINT PRIMARY KEY);");
        var flyway = Flyway.configure().dataSource(url(), "sa", "").locations("filesystem:" + dir).load();
        flyway.migrate();
        Files.writeString(script, "CREATE TABLE fixture (id INT PRIMARY KEY);");
        assertThatThrownBy(flyway::validate).isInstanceOf(FlywayException.class);
    }
}
