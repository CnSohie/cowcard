package com.hqyj.ka.observability;

import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/** 读 Hikari 池状态。不借连接,连接耗尽时健康检查本身也不会再卡 5 秒。 */
@Component
public class DbPoolProbe {

    public record Counts(String name, Integer active, Integer idle, Integer pending, Integer max, boolean readable) {}

    private final DataSource dataSource;
    private final MeterRegistry registry;

    public DbPoolProbe(DataSource dataSource, MeterRegistry registry) {
        this.dataSource = dataSource;
        this.registry = registry;
    }

    @PostConstruct
    void bindGauges() {
        Gauge.builder("ka.db.pool.active", this, probe -> number(probe.read().active())).register(registry);
        Gauge.builder("ka.db.pool.idle", this, probe -> number(probe.read().idle())).register(registry);
        Gauge.builder("ka.db.pool.pending", this, probe -> number(probe.read().pending()))
                .description("Threads waiting for a database connection. Above 0 means the pool is exhausted")
                .register(registry);
        Gauge.builder("ka.db.pool.max", this, probe -> number(probe.read().max())).register(registry);
    }

    public Counts read() {
        HikariDataSource hikari = hikari();
        if (hikari == null) return new Counts(null, null, null, null, null, false);
        HikariPoolMXBean mx = hikari.getHikariPoolMXBean();
        int max = hikari.getMaximumPoolSize();
        if (mx == null) return new Counts(hikari.getPoolName(), 0, 0, 0, max, true);
        return new Counts(hikari.getPoolName(), mx.getActiveConnections(), mx.getIdleConnections(),
                mx.getThreadsAwaitingConnection(), max, true);
    }

    private HikariDataSource hikari() {
        try {
            if (dataSource instanceof HikariDataSource hikari) return hikari;
            return dataSource.unwrap(HikariDataSource.class);
        } catch (RuntimeException e) {
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    private static double number(Integer value) {
        return value == null ? 0d : value.doubleValue();
    }
}
