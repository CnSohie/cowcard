package com.hqyj.ka.support.repo;

import com.hqyj.ka.support.entity.SupportTicket;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SupportTicketRepository extends JpaRepository<SupportTicket, Long> {
    long countByStatus(SupportTicket.Status status);
    Page<SupportTicket> findByMemberIdOrderByIdDesc(Long memberId, Pageable pageable);
    Page<SupportTicket> findByStatus(SupportTicket.Status status, Pageable pageable);
    Page<SupportTicket> findBySubjectContainingIgnoreCaseOrRelatedOrderNoContainingIgnoreCase(String subject, String orderNo, Pageable pageable);
    Page<SupportTicket> findByStatusAndSubjectContainingIgnoreCaseOrStatusAndRelatedOrderNoContainingIgnoreCase(
            SupportTicket.Status s1, String subject, SupportTicket.Status s2, String orderNo, Pageable pageable);
}
