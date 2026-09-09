package com.fixbridge.admin.entity;

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
@Table(name = "homeowner_acceptances")
public class HomeownerAcceptanceEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private Long userId;

  @Column(name = "guest_session_id")
  private String guestSessionId;

  @Column(name = "job_id")
  private Long jobId;

  @Column(name = "quote_id")
  private Long quoteId;

  @Column(name = "change_order_id")
  private Long changeOrderId;

  @Column(name = "payment_id")
  private Long paymentId;

  @Column(name = "acceptance_type", nullable = false)
  private String acceptanceType;

  @Column(name = "document_key")
  private String documentKey;

  @Column(name = "document_version", nullable = false)
  private String documentVersion;

  @Column(name = "document_title")
  private String documentTitle;

  @Column(nullable = false)
  private Boolean accepted = true;

  @Column(name = "accepted_at", nullable = false)
  private OffsetDateTime acceptedAt;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private JsonNode metadata;

  @Column(name = "action_completed", nullable = false)
  private Boolean actionCompleted = true;

  @Column(name = "idempotency_key", unique = true)
  private String idempotencyKey;

  @Column(name = "ip_address")
  private String ipAddress;

  @Column(name = "user_agent")
  private String userAgent;

  @Column(name = "source_route")
  private String sourceRoute;

  @Column(name = "created_at")
  private OffsetDateTime createdAt;

  @PrePersist
  void onCreate() {
    OffsetDateTime now = OffsetDateTime.now();
    if (createdAt == null) {
      createdAt = now;
    }
    if (acceptedAt == null) {
      acceptedAt = now;
    }
    if (accepted == null) {
      accepted = true;
    }
    if (actionCompleted == null) {
      actionCompleted = true;
    }
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public String getGuestSessionId() {
    return guestSessionId;
  }

  public void setGuestSessionId(String guestSessionId) {
    this.guestSessionId = guestSessionId;
  }

  public Long getJobId() {
    return jobId;
  }

  public void setJobId(Long jobId) {
    this.jobId = jobId;
  }

  public Long getQuoteId() {
    return quoteId;
  }

  public void setQuoteId(Long quoteId) {
    this.quoteId = quoteId;
  }

  public Long getChangeOrderId() {
    return changeOrderId;
  }

  public void setChangeOrderId(Long changeOrderId) {
    this.changeOrderId = changeOrderId;
  }

  public Long getPaymentId() {
    return paymentId;
  }

  public void setPaymentId(Long paymentId) {
    this.paymentId = paymentId;
  }

  public String getAcceptanceType() {
    return acceptanceType;
  }

  public void setAcceptanceType(String acceptanceType) {
    this.acceptanceType = acceptanceType;
  }

  public String getDocumentKey() {
    return documentKey;
  }

  public void setDocumentKey(String documentKey) {
    this.documentKey = documentKey;
  }

  public String getDocumentVersion() {
    return documentVersion;
  }

  public void setDocumentVersion(String documentVersion) {
    this.documentVersion = documentVersion;
  }

  public String getDocumentTitle() {
    return documentTitle;
  }

  public void setDocumentTitle(String documentTitle) {
    this.documentTitle = documentTitle;
  }

  public Boolean getAccepted() {
    return accepted;
  }

  public void setAccepted(Boolean accepted) {
    this.accepted = accepted;
  }

  public OffsetDateTime getAcceptedAt() {
    return acceptedAt;
  }

  public void setAcceptedAt(OffsetDateTime acceptedAt) {
    this.acceptedAt = acceptedAt;
  }

  public JsonNode getMetadata() {
    return metadata;
  }

  public void setMetadata(JsonNode metadata) {
    this.metadata = metadata;
  }

  public Boolean getActionCompleted() {
    return actionCompleted;
  }

  public void setActionCompleted(Boolean actionCompleted) {
    this.actionCompleted = actionCompleted;
  }

  public String getIdempotencyKey() {
    return idempotencyKey;
  }

  public void setIdempotencyKey(String idempotencyKey) {
    this.idempotencyKey = idempotencyKey;
  }

  public String getIpAddress() {
    return ipAddress;
  }

  public void setIpAddress(String ipAddress) {
    this.ipAddress = ipAddress;
  }

  public String getUserAgent() {
    return userAgent;
  }

  public void setUserAgent(String userAgent) {
    this.userAgent = userAgent;
  }

  public String getSourceRoute() {
    return sourceRoute;
  }

  public void setSourceRoute(String sourceRoute) {
    this.sourceRoute = sourceRoute;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
