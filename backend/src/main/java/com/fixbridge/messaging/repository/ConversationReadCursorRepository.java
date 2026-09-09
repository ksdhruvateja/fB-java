package com.fixbridge.messaging.repository;

import com.fixbridge.messaging.entity.ConversationReadCursorEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConversationReadCursorRepository
    extends JpaRepository<ConversationReadCursorEntity, ConversationReadCursorEntity.Pk> {

  Optional<ConversationReadCursorEntity> findByConversationIdAndUserId(Long conversationId, Long userId);
}
