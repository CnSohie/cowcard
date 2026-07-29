package com.hqyj.ka.sysconfig.service;

import com.hqyj.ka.sysconfig.entity.SysConfig;
import com.hqyj.ka.sysconfig.repo.SysConfigRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ConfigService {

    private final SysConfigRepository repository;

    @Cacheable(cacheNames = "sysconfig", key = "'all'")
    public Map<String, String> all() {
        return repository.findAll().stream()
                .collect(Collectors.toMap(SysConfig::getCfgKey, c -> c.getCfgValue() == null ? "" : c.getCfgValue()));
    }

    @CacheEvict(cacheNames = "sysconfig", allEntries = true)
    public void saveAll(List<SysConfig> configs) {
        repository.saveAll(configs);
    }
}
