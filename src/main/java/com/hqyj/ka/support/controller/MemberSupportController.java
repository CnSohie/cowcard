package com.hqyj.ka.support.controller;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.common.PageResult;
import com.hqyj.ka.support.entity.SupportTicket;
import com.hqyj.ka.support.entity.SupportTicketMessage;
import com.hqyj.ka.support.repo.SupportTicketMessageRepository;
import com.hqyj.ka.support.repo.SupportTicketRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/member/support-tickets")
@RequiredArgsConstructor
public class MemberSupportController {
    private final SupportTicketRepository repository;
    private final SupportTicketMessageRepository messageRepository;

    public record TicketView(Long id, String subject, String category, String relatedOrderNo,
                             String message, String reply, String status, String priority,
                             LocalDateTime createdAt, LocalDateTime updatedAt, LocalDateTime repliedAt,
                             List<TicketMessageView> messages, boolean canFollowUp) {}
    public record TicketMessageView(Long id, String senderType, String senderName, String content, LocalDateTime createdAt) {}
    public record CreateTicketRequest(@NotBlank @Size(max = 128) String subject,
                                      @Size(max = 32) String category,
                                      @Size(max = 64) String relatedOrderNo,
                                      @NotBlank @Size(max = 4000) String message) {}
    public record AddMessageRequest(@NotBlank @Size(max = 4000) String message) {}

    @GetMapping
    public ApiResponse<PageResult<TicketView>> list(HttpServletRequest http,
                                                    @RequestParam(defaultValue = "0") int page,
                                                    @RequestParam(defaultValue = "10") int size) {
        Long mid = (Long) http.getAttribute("mid");
        var result = repository.findByMemberIdOrderByIdDesc(mid,
                PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 50)));
        return ApiResponse.ok(PageResult.of(result, this::view));
    }

    @PostMapping
    @Transactional
    public ApiResponse<TicketView> create(@Valid @RequestBody CreateTicketRequest req, HttpServletRequest http) {
        Long mid = (Long) http.getAttribute("mid");
        SupportTicket t = new SupportTicket();
        t.setMemberId(mid);
        t.setSubject(req.subject().trim());
        t.setCategory(req.category() == null ? "GENERAL" : req.category().trim().toUpperCase());
        t.setRelatedOrderNo(req.relatedOrderNo() == null ? null : req.relatedOrderNo().trim());
        t.setMessage(req.message().trim());
        t = repository.save(t);
        addMessage(t.getId(), SupportTicketMessage.SenderType.MEMBER,
                String.valueOf(http.getAttribute("mname")), req.message().trim());
        return ApiResponse.ok(view(t));
    }

    @PostMapping("/{id}/messages")
    @Transactional
    public ApiResponse<TicketView> addMessage(@PathVariable Long id, @Valid @RequestBody AddMessageRequest req,
                                              HttpServletRequest http) {
        Long mid = (Long) http.getAttribute("mid");
        SupportTicket t = repository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!mid.equals(t.getMemberId())) throw new BusinessException(ErrorCode.FORBIDDEN);
        if (t.getStatus() == SupportTicket.Status.CLOSED) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "工单已关闭,请提交新的工单");
        }
        if (t.getStatus() == SupportTicket.Status.OPEN) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "客服回复前不能连续追加消息");
        }
        addMessage(t.getId(), SupportTicketMessage.SenderType.MEMBER,
                String.valueOf(http.getAttribute("mname")), req.message().trim());
        t.setStatus(SupportTicket.Status.OPEN);
        return ApiResponse.ok(view(t));
    }

    @PostMapping("/{id}/close")
    @Transactional
    public ApiResponse<TicketView> close(@PathVariable Long id, HttpServletRequest http) {
        Long mid = (Long) http.getAttribute("mid");
        SupportTicket t = repository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!mid.equals(t.getMemberId())) throw new BusinessException(ErrorCode.FORBIDDEN);
        t.setStatus(SupportTicket.Status.CLOSED);
        return ApiResponse.ok(view(t));
    }

    private void addMessage(Long ticketId, SupportTicketMessage.SenderType senderType, String senderName, String content) {
        SupportTicketMessage m = new SupportTicketMessage();
        m.setTicketId(ticketId);
        m.setSenderType(senderType);
        m.setSenderName(senderName);
        m.setContent(content);
        messageRepository.save(m);
    }

    TicketView view(SupportTicket t) {
        List<TicketMessageView> messages = messageRepository.findByTicketIdOrderByIdAsc(t.getId()).stream()
                .map(MemberSupportController::messageView).toList();
        if (messages.isEmpty()) {
            messages = fallbackMessages(t);
        }
        return new TicketView(t.getId(), t.getSubject(), t.getCategory(), t.getRelatedOrderNo(),
                t.getMessage(), t.getReply(), t.getStatus().name(), t.getPriority().name(),
                t.getCreatedAt(), t.getUpdatedAt(), t.getRepliedAt(), messages, canFollowUp(t));
    }

    private static boolean canFollowUp(SupportTicket t) {
        return t.getStatus() == SupportTicket.Status.ANSWERED || t.getStatus() == SupportTicket.Status.WAITING_USER;
    }

    private static TicketMessageView messageView(SupportTicketMessage m) {
        return new TicketMessageView(m.getId(), m.getSenderType().name(), m.getSenderName(), m.getContent(), m.getCreatedAt());
    }

    private static List<TicketMessageView> fallbackMessages(SupportTicket t) {
        TicketMessageView first = new TicketMessageView(0L, "MEMBER", null, t.getMessage(), t.getCreatedAt());
        if (t.getReply() == null || t.getReply().isBlank()) return List.of(first);
        return List.of(first, new TicketMessageView(-1L, "STAFF", t.getRepliedBy(), t.getReply(), t.getRepliedAt()));
    }
}
