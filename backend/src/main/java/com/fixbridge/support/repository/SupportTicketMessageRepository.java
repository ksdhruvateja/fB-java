package com.fixbridge.support.repository;

import com.fixbridge.support.entity.SupportTicketMessageEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SupportTicketMessageRepository extends JpaRepository<SupportTicketMessageEntity, Long> {

  List<SupportTicketMessageEntity> findByTicketIdAndInternalFalseOrderByCreatedAtAscIdAsc(Long ticketId);

  List<SupportTicketMessageEntity> findByTicketIdOrderByCreatedAtAscIdAsc(Long ticketId);
}
