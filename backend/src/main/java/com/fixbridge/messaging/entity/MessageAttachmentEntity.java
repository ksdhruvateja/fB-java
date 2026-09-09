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
@Table(name = "message_attachments")
public class MessageAttachmentEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "message_id", nullable = false)
  private Long messageId;

  @Column(name = "conversation_id", nullable = false)
  private Long conversationId;

  @Column(name = "uploader_user_id", nullable = false)
  private Long uploaderUserId;

  @Column(name = "file_name", nullable = false)
  private String fileName;

  @Column(name = "mime_type", nullable = false)
  private String mimeType;

  @Column(name = "byte_size", nullable = false)
  private int byteSize;

  @Lob
  @Column(name = "storage_data", nullable = false)
  private String storageData;

  @Column(name = "storage_provider")
  private String storageProvider = "database";

  @Column(name = "storage_key")
  private String storageKey;

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

  public Long getMessageId() {
    return messageId;
  }

  public void setMessageId(Long messageId) {
    this.messageId = messageId;
  }

  public Long getConversationId() {
    return conversationId;
  }

  public void setConversationId(Long conversationId) {
    this.conversationId = conversationId;
  }

  public Long getUploaderUserId() {
    return uploaderUserId;
  }

  public void setUploaderUserId(Long uploaderUserId) {
    this.uploaderUserId = uploaderUserId;
  }

  public String getFileName() {
    return fileName;
  }

  public void setFileName(String fileName) {
    this.fileName = fileName;
  }

  public String getMimeType() {
    return mimeType;
  }

  public void setMimeType(String mimeType) {
    this.mimeType = mimeType;
  }

  public int getByteSize() {
    return byteSize;
  }

  public void setByteSize(int byteSize) {
    this.byteSize = byteSize;
  }

  public String getStorageData() {
    return storageData;
  }

  public void setStorageData(String storageData) {
    this.storageData = storageData;
  }

  public String getStorageProvider() {
    return storageProvider;
  }

  public void setStorageProvider(String storageProvider) {
    this.storageProvider = storageProvider;
  }

  public String getStorageKey() {
    return storageKey;
  }

  public void setStorageKey(String storageKey) {
    this.storageKey = storageKey;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
