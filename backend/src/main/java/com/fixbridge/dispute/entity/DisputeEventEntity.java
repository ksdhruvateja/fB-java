package com.fixbridge.dispute.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "dispute_events")
public class DisputeEventEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "dispute_id", nullable = false)
  private Long disputeId;

  @Column(name = "actor_user_id")
  private Long actorUserId;

  @Column(name = "actor_role", length = 32)
  private String actorRole;

  @Column(nullable = false, length = 64)
  private String action;

  @Column(columnDefinition = "TEXT")
  private String reason;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "before_state", columnDefinition = "jsonb")
  private JsonNode beforeState;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "after_state", columnDefinition = "jsonb")
  private JsonNode afterState;

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

  public Long getDisputeId() {
    return disputeId;
  }

  public void setDisputeId(Long disputeId) {
    this.disputeId = disputeId;
  }

  public Long getActorUserId() {
    return actorUserId;
  }

  public void setActorUserId(Long actorUserId) {
    this.actorUserId = actorUserId;
  }

  public String getActorRole() {
    return actorRole;
  }

  public void setActorRole(String actorRole) {
    this.actorRole = actorRole;
  }

  public String getAction() {
    return action;
  }

  public void setAction(String action) {
    this.action = action;
  }

  public String getReason() {
    return reason;
  }

  public void setReason(String reason) {
    this.reason = reason;
  }

  public JsonNode getBeforeState() {
    return beforeState;
  }

  public void setBeforeState(JsonNode beforeState) {
    this.beforeState = beforeState;
  }

  public JsonNode getAfterState() {
    return afterState;
  }

  public void setAfterState(JsonNode afterState) {
    this.afterState = afterState;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
