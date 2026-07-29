package com.hqyj.ka.audit.service;

import com.hqyj.ka.audit.entity.AuditLog;
import com.hqyj.ka.audit.repo.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/** 异步落库:审计不阻塞业务线程(2C2G 下写放大最小化);失败仅记日志,不影响主流程。 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    @Async("taskExecutor")
    public void record(String actor, String action, String resource, String ip, String detail) {
        try {
            AuditLog auditLog = new AuditLog();
            auditLog.setActor(actor == null ? "anonymous" : actor);
            auditLog.setAction(action);
            auditLog.setResource(resource);
            auditLog.setIp(ip);
            auditLog.setDetail(detail);
            auditLogRepository.save(auditLog);
        } catch (Exception e) {
            log.warn("audit record failed: {}", e.getMessage());
        }
    }
}
