package com.hqyj.ka.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * 2C2G:Caffeine 进程内缓存代替 Redis。条目数硬性封顶,防止缓存膨胀挤占堆内存。
 * 升级路线:多节点部署时替换为 spring.cache.type=redis,业务代码零改动。
 */
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager("products", "categories", "sysconfig", "channels");
        manager.setCaffeine(Caffeine.newBuilder()
                .maximumSize(2000)
                .expireAfterWrite(Duration.ofMinutes(5)));
        return manager;
    }
}
