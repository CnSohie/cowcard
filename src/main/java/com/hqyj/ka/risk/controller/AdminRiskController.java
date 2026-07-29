package com.hqyj.ka.risk.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.common.PageResult;
import com.hqyj.ka.risk.entity.RiskReview;
import com.hqyj.ka.risk.repo.RiskReviewRepository;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.user.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/admin/risk-reviews")
@RequiredArgsConstructor
public class AdminRiskController {
    private final RiskReviewRepository repository;
    private final AuditService auditService;
    private final AuthService authService;

    public record RiskView(Long id, String sourceType, String sourceId, String subject, String reason,
                           String severity, String status, String createdBy, String reviewedBy,
                           String reviewNote, LocalDateTime createdAt, LocalDateTime reviewedAt) {}
    public record CreateRiskRequest(@NotBlank @Size(max = 32) String sourceType,
                                    @Size(max = 64) String sourceId,
                                    @NotBlank @Size(max = 128) String subject,
                                    @NotBlank @Size(max = 4000) String reason,
                                    String severity) {}
    public record ReviewRiskRequest(String status, @Size(max = 255) String note,
                                    String password, String totpCode) {}

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAuthority('risk:review')")
    public ApiResponse<PageResult<RiskView>> list(@RequestParam(required = false) String status,
                                                  @RequestParam(required = false) String q,
                                                  @RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(defaultValue = "20") int size) {
        PageRequest pr = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100),
                Sort.by(Sort.Direction.DESC, "id"));
        var result = (q == null || q.isBlank())
                ? (status == null || status.isBlank()
                    ? repository.findAll(pr)
                    : repository.findByStatus(parseStatus(status), pr))
                : (status == null || status.isBlank()
                    ? repository.findBySubjectContainingIgnoreCaseOrSourceIdContainingIgnoreCase(q.trim(), q.trim(), pr)
                    : repository.findByStatusAndSubjectContainingIgnoreCaseOrStatusAndSourceIdContainingIgnoreCase(
                        parseStatus(status), q.trim(), parseStatus(status), q.trim(), pr));
        return ApiResponse.ok(PageResult.of(result, AdminRiskController::view));
    }

    @PostMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAuthority('risk:review')")
    public ApiResponse<RiskView> create(@Valid @RequestBody CreateRiskRequest req, HttpServletRequest http) {
        RiskReview r = new RiskReview();
        r.setSourceType(req.sourceType().trim().toUpperCase());
        r.setSourceId(req.sourceId() == null ? null : req.sourceId().trim());
        r.setSubject(req.subject().trim());
        r.setReason(req.reason().trim());
        r.setSeverity(parseSeverity(req.severity()));
        r.setCreatedBy(String.valueOf(http.getAttribute("uname")));
        r = repository.save(r);
        auditService.record(String.valueOf(http.getAttribute("uname")), "RISK_CREATE",
                "risk:" + r.getId(), RateLimitFilter.clientIp(http), r.getSeverity().name());
        return ApiResponse.ok(view(r));
    }

    @PostMapping("/{id}/review")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAuthority('risk:review')")
    public ApiResponse<RiskView> review(@PathVariable Long id, @RequestBody ReviewRiskRequest req,
                                        HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "risk-review", RateLimitFilter.clientIp(http));
        RiskReview r = repository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (r.getStatus() != RiskReview.Status.PENDING) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "该风控项已处理");
        }
        RiskReview.Status target = parseStatus(req.status());
        if (target == RiskReview.Status.PENDING) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "请选择处理结果");
        }
        r.setStatus(target);
        r.setReviewNote(req.note() == null ? null : req.note().trim());
        r.setReviewedBy(String.valueOf(http.getAttribute("uname")));
        r.setReviewedAt(LocalDateTime.now());
        auditService.record(String.valueOf(http.getAttribute("uname")), "RISK_REVIEW",
                "risk:" + id, RateLimitFilter.clientIp(http), target.name());
        return ApiResponse.ok(view(r));
    }

    private static RiskView view(RiskReview r) {
        return new RiskView(r.getId(), r.getSourceType(), r.getSourceId(), r.getSubject(), r.getReason(),
                r.getSeverity().name(), r.getStatus().name(), r.getCreatedBy(), r.getReviewedBy(),
                r.getReviewNote(), r.getCreatedAt(), r.getReviewedAt());
    }

    private static RiskReview.Status parseStatus(String raw) {
        try {
            return raw == null || raw.isBlank() ? RiskReview.Status.PENDING : RiskReview.Status.valueOf(raw.trim().toUpperCase());
        } catch (RuntimeException e) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "风控状态无效");
        }
    }

    private static RiskReview.Severity parseSeverity(String raw) {
        try {
            return raw == null || raw.isBlank() ? RiskReview.Severity.MEDIUM : RiskReview.Severity.valueOf(raw.trim().toUpperCase());
        } catch (RuntimeException e) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "风险等级无效");
        }
    }
}
