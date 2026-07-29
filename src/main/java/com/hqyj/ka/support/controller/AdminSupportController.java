package com.hqyj.ka.support.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.common.PageResult;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.support.entity.SupportTicket;
import com.hqyj.ka.support.entity.SupportTicketMessage;
import com.hqyj.ka.support.repo.SupportTicketMessageRepository;
import com.hqyj.ka.support.repo.SupportTicketRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/support-tickets")
@RequiredArgsConstructor
public class AdminSupportController {
    private final SupportTicketRepository repository;
    private final SupportTicketMessageRepository messageRepository;
    private final AuditService auditService;

    public record AdminTicketView(Long id, Long memberId, String subject, String category,
                                  String relatedOrderNo, String message, String reply,
                                  String status, String priority, String repliedBy,
                                  LocalDateTime createdAt, LocalDateTime updatedAt, LocalDateTime repliedAt,
                                  List<TicketMessageView> messages) {}
    public record TicketMessageView(Long id, String senderType, String senderName, String content, LocalDateTime createdAt) {}
    public record ReplyRequest(@Size(max = 4000) String reply, String status, String priority) {}

    @GetMapping("/stats")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAuthority('support:manage')")
    public ApiResponse<Map<String, Long>> stats() {
        long open = repository.countByStatus(SupportTicket.Status.OPEN);
        long waitingUser = repository.countByStatus(SupportTicket.Status.WAITING_USER);
        long answered = repository.countByStatus(SupportTicket.Status.ANSWERED);
        long closed = repository.countByStatus(SupportTicket.Status.CLOSED);
        return ApiResponse.ok(Map.of(
                "pending", open,
                "open", open,
                "waitingUser", waitingUser,
                "answered", answered,
                "closed", closed,
                "total", open + waitingUser + answered + closed));
    }

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAuthority('support:manage')")
    public ApiResponse<PageResult<AdminTicketView>> list(@RequestParam(required = false) String status,
                                                         @RequestParam(required = false) String q,
                                                         @RequestParam(defaultValue = "0") int page,
                                                         @RequestParam(defaultValue = "20") int size) {
        PageRequest pr = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100),
                Sort.by(Sort.Direction.DESC, "id"));
        var result = (q == null || q.isBlank())
                ? (status == null || status.isBlank() ? repository.findAll(pr) : repository.findByStatus(parseStatus(status), pr))
                : (status == null || status.isBlank()
                    ? repository.findBySubjectContainingIgnoreCaseOrRelatedOrderNoContainingIgnoreCase(q.trim(), q.trim(), pr)
                    : repository.findByStatusAndSubjectContainingIgnoreCaseOrStatusAndRelatedOrderNoContainingIgnoreCase(
                        parseStatus(status), q.trim(), parseStatus(status), q.trim(), pr));
        return ApiResponse.ok(PageResult.of(result, this::view));
    }

    @PostMapping("/{id}/reply")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAuthority('support:manage')")
    @Transactional
    public ApiResponse<AdminTicketView> reply(@PathVariable Long id, @RequestBody ReplyRequest req,
                                             HttpServletRequest http) {
        SupportTicket t = repository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (req.reply() != null && !req.reply().isBlank()) {
            t.setReply(req.reply().trim());
            t.setRepliedBy(String.valueOf(http.getAttribute("uname")));
            t.setRepliedAt(LocalDateTime.now());
            addMessage(t.getId(), String.valueOf(http.getAttribute("uname")), req.reply().trim());
        }
        if (req.status() != null && !req.status().isBlank()) t.setStatus(parseStatus(req.status()));
        else if (req.reply() != null && !req.reply().isBlank()) t.setStatus(SupportTicket.Status.ANSWERED);
        if (req.priority() != null && !req.priority().isBlank()) t.setPriority(parsePriority(req.priority()));
        auditService.record(String.valueOf(http.getAttribute("uname")), "SUPPORT_REPLY",
                "ticket:" + id, RateLimitFilter.clientIp(http), t.getStatus().name());
        return ApiResponse.ok(view(t));
    }

    private void addMessage(Long ticketId, String senderName, String content) {
        SupportTicketMessage m = new SupportTicketMessage();
        m.setTicketId(ticketId);
        m.setSenderType(SupportTicketMessage.SenderType.STAFF);
        m.setSenderName(senderName);
        m.setContent(content);
        messageRepository.save(m);
    }

    private AdminTicketView view(SupportTicket t) {
        List<TicketMessageView> messages = messageRepository.findByTicketIdOrderByIdAsc(t.getId()).stream()
                .map(AdminSupportController::messageView).toList();
        if (messages.isEmpty()) messages = fallbackMessages(t);
        return new AdminTicketView(t.getId(), t.getMemberId(), t.getSubject(), t.getCategory(),
                t.getRelatedOrderNo(), t.getMessage(), t.getReply(), t.getStatus().name(),
                t.getPriority().name(), t.getRepliedBy(), t.getCreatedAt(), t.getUpdatedAt(), t.getRepliedAt(),
                messages);
    }

    private static TicketMessageView messageView(SupportTicketMessage m) {
        return new TicketMessageView(m.getId(), m.getSenderType().name(), m.getSenderName(), m.getContent(), m.getCreatedAt());
    }

    private static List<TicketMessageView> fallbackMessages(SupportTicket t) {
        TicketMessageView first = new TicketMessageView(0L, "MEMBER", null, t.getMessage(), t.getCreatedAt());
        if (t.getReply() == null || t.getReply().isBlank()) return List.of(first);
        return List.of(first, new TicketMessageView(-1L, "STAFF", t.getRepliedBy(), t.getReply(), t.getRepliedAt()));
    }

    private static SupportTicket.Status parseStatus(String raw) {
        try { return SupportTicket.Status.valueOf(raw.trim().toUpperCase()); }
        catch (RuntimeException e) { throw new BusinessException(ErrorCode.BAD_REQUEST, "工单状态无效"); }
    }

    private static SupportTicket.Priority parsePriority(String raw) {
        try { return SupportTicket.Priority.valueOf(raw.trim().toUpperCase()); }
        catch (RuntimeException e) { throw new BusinessException(ErrorCode.BAD_REQUEST, "工单优先级无效"); }
    }
}
