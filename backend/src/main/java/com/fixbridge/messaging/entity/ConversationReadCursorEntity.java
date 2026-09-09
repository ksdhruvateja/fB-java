package com.fixbridge.messaging.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.OffsetDateTime;
import java.util.Objects;

@Entity
@Table(name = "conversation_read_cursors")
@IdClass(ConversationReadCursorEntity.Pk.class)
public class ConversationReadCursorEntity {

  @Id
  @Column(name = "conversation_id")
  private Long conversationId;

  @Id
  @Column(name = "user_id")
  private Long userId;

  @Column(name = "last_read_at", nullable = false)
  private OffsetDateTime lastReadAt;

  @PrePersist
  void onCreate() {
    if (lastReadAt == null) {
      lastReadAt = OffsetDateTime.now();
    }
  }

  public Long getConversationId() {
    return conversationId;
  }

  public void setConversationId(Long conversationId) {
    this.conversationId = conversationId;
  }

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public OffsetDateTime getLastReadAt() {
    return lastReadAt;
  }

  public void setLastReadAt(OffsetDateTime lastReadAt) {
    this.lastReadAt = lastReadAt;
  }

  public static class Pk implements Serializable {
    private Long conversationId;
    private Long userId;

    public Pk() {}

    public Pk(Long conversationId, Long userId) {
      this.conversationId = conversationId;
      this.userId = userId;
    }

    @Override
    public boolean equals(Object o) {
      if (this == o) {
        return true;
      }
      if (!(o instanceof Pk pk)) {
        return false;
      }
      return Objects.equals(conversationId, pk.conversationId) && Objects.equals(userId, pk.userId);
    }

    @Override
    public int hashCode() {
      return Objects.hash(conversationId, userId);
    }
  }
}
