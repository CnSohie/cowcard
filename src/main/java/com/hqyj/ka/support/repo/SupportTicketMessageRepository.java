package com.hqyj.ka.support.repo;

import com.hqyj.ka.support.entity.SupportTicketMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface SupportTicketMessageRepository extends JpaRepository<SupportTicketMessage, Long> {
    List<SupportTicketMessage> findByTicketIdOrderByIdAsc(Long ticketId);
    List<SupportTicketMessage> findByTicketIdInOrderByTicketIdAscIdAsc(Collection<Long> ticketIds);
}
