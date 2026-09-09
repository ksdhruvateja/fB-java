package com.fixbridge.messaging.repository;

import com.fixbridge.messaging.entity.ConversationEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConversationRepository extends JpaRepository<ConversationEntity, Long> {

  List<ConversationEntity> findTop100ByHomeownerUserIdOrderByUpdatedAtDescCreatedAtDesc(Long homeownerUserId);

  List<ConversationEntity> findTop100ByContractorUserIdOrderByUpdatedAtDescCreatedAtDesc(Long contractorUserId);

  @Query("""
      SELECT c FROM ConversationEntity c
      WHERE c.type IN ('homeowner_admin', 'contractor_admin')
      ORDER BY c.updatedAt DESC, c.createdAt DESC
      """)
  List<ConversationEntity> findAdminConversations();

  @Query("""
      SELECT c FROM ConversationEntity c
      WHERE c.type = :type
      ORDER BY c.updatedAt DESC, c.createdAt DESC
      """)
  List<ConversationEntity> findAdminConversationsByType(@Param("type") String type);

  @Query("""
      SELECT c FROM ConversationEntity c
      WHERE c.type IN ('homeowner_admin', 'contractor_admin') AND c.jobId IS NOT NULL
      ORDER BY c.updatedAt DESC, c.createdAt DESC
      """)
  List<ConversationEntity> findAdminJobConversations();

  Optional<ConversationEntity> findFirstByTypeAndJobIdAndStatusNotAndHomeownerUserIdOrderByUpdatedAtDesc(
      String type, Long jobId, String status, Long homeownerUserId);

  Optional<ConversationEntity> findFirstByTypeAndJobIdAndStatusNotAndContractorUserIdOrderByUpdatedAtDesc(
      String type, Long jobId, String status, Long contractorUserId);
}
