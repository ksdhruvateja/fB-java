package com.fixbridge.support.repository;

import com.fixbridge.support.entity.SupportTicketEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SupportTicketRepository extends JpaRepository<SupportTicketEntity, Long> {

  Optional<SupportTicketEntity> findByTicketNumber(String ticketNumber);

  List<SupportTicketEntity> findTop50ByUserIdOrderByUpdatedAtDescCreatedAtDesc(Long userId);

  @Query("""
      SELECT t FROM SupportTicketEntity t
      WHERE t.userId = :userId
        AND LOWER(t.status) NOT IN ('resolved', 'closed')
      ORDER BY t.updatedAt DESC, t.createdAt DESC
      """)
  List<SupportTicketEntity> findOpenByUser(@Param("userId") Long userId);

  List<SupportTicketEntity> findTop200ByOrderByUpdatedAtDescCreatedAtDesc();

  Optional<SupportTicketEntity> findFirstByTicketNumberStartingWithOrderByIdDesc(String prefix);
}
