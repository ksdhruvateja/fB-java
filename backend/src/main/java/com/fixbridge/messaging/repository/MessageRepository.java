package com.fixbridge.messaging.repository;

import com.fixbridge.messaging.entity.MessageEntity;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MessageRepository extends JpaRepository<MessageEntity, Long> {

  Optional<MessageEntity> findFirstByConversationIdOrderByCreatedAtDesc(Long conversationId);

  @Query("""
      SELECT COUNT(m) FROM MessageEntity m
      WHERE m.conversationId = :conversationId
        AND m.senderUserId <> :userId
        AND m.createdAt > :lastRead
      """)
  long countUnread(
      @Param("conversationId") Long conversationId,
      @Param("userId") Long userId,
      @Param("lastRead") OffsetDateTime lastRead);

  List<MessageEntity> findByConversationIdAndIdLessThanOrderByCreatedAtDesc(
      Long conversationId, Long beforeId, org.springframework.data.domain.Pageable pageable);

  List<MessageEntity> findByConversationIdOrderByCreatedAtDesc(
      Long conversationId, org.springframework.data.domain.Pageable pageable);

  Optional<MessageEntity> findFirstBySenderUserIdAndBodyAndCreatedAtAfterOrderByIdDesc(
      Long senderUserId, String body, OffsetDateTime after);
}
