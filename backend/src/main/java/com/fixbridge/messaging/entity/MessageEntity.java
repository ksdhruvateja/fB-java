package com.fixbridge.messaging.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "messages")
public class MessageEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "conversation_id", nullable = false)
  private Long conversationId;

  @Column(name = "sender_user_id", nullable = false)
  private Long senderUserId;

  @Column(name = "sender_role")
  private String senderRole;

  @Column(name = "sender_display_name")
  private String senderDisplayName;

  @Column(name = "sent_by_admin_user_id")
  private Long sentByAdminUserId;

  @Lob
  @Column(nullable = false)
  private String body;

  @Column(name = "created_at")
  private OffsetDateTime createdAt;

  @PrePersist
  void onCreate() {
    if (createdAt == null) {
      createdAt = OffsetDateTime.now();
    }
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public Long getConversationId() {
    return conversationId;
  }

  public void setConversationId(Long conversationId) {
    this.conversationId = conversationId;
  }

  public Long getSenderUserId() {
    return senderUserId;
  }

  public void setSenderUserId(Long senderUserId) {
    this.senderUserId = senderUserId;
  }

  public String getSenderRole() {
    return senderRole;
  }

  public void setSenderRole(String senderRole) {
    this.senderRole = senderRole;
  }

  public String getSenderDisplayName() {
    return senderDisplayName;
  }

  public void setSenderDisplayName(String senderDisplayName) {
    this.senderDisplayName = senderDisplayName;
  }

  public Long getSentByAdminUserId() {
    return sentByAdminUserId;
  }

  public void setSentByAdminUserId(Long sentByAdminUserId) {
    this.sentByAdminUserId = sentByAdminUserId;
  }

  public String getBody() {
    return body;
  }

  public void setBody(String body) {
    this.body = body;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
