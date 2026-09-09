package com.fixbridge.messaging.repository;

import com.fixbridge.messaging.entity.MessageAttachmentEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MessageAttachmentRepository extends JpaRepository<MessageAttachmentEntity, Long> {

  List<MessageAttachmentEntity> findByMessageIdOrderByIdAsc(Long messageId);
}
