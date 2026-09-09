package com.fixbridge.payment.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "payment_authorization_snapshots")
public class PaymentAuthorizationSnapshotEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private Long userId;

  @Column(name = "job_id")
  private Long jobId;

  @Column(name = "payment_id")
  private Long paymentId;

  @Column(name = "authorized_amount_cents", nullable = false)
  private Integer authorizedAmountCents;

  @Column(length = 16)
  private String currency = "usd";

  @Column(name = "policy_document_version", length = 64)
  private String policyDocumentVersion;

  @Column(name = "acceptance_id")
  private Long acceptanceId;

  @Column(name = "created_at")
  private OffsetDateTime createdAt;

  @PrePersist
  void onCreate() {
    if (createdAt == null) {
      createdAt = OffsetDateTime.now();
    }
    if (currency == null) {
      currency = "usd";
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

  public Long getJobId() {
    return jobId;
  }

  public void setJobId(Long jobId) {
    this.jobId = jobId;
  }

  public Long getPaymentId() {
    return paymentId;
  }

  public void setPaymentId(Long paymentId) {
    this.paymentId = paymentId;
  }

  public Integer getAuthorizedAmountCents() {
    return authorizedAmountCents;
  }

  public void setAuthorizedAmountCents(Integer authorizedAmountCents) {
    this.authorizedAmountCents = authorizedAmountCents;
  }

  public String getCurrency() {
    return currency;
  }

  public void setCurrency(String currency) {
    this.currency = currency;
  }

  public String getPolicyDocumentVersion() {
    return policyDocumentVersion;
  }

  public void setPolicyDocumentVersion(String policyDocumentVersion) {
    this.policyDocumentVersion = policyDocumentVersion;
  }

  public Long getAcceptanceId() {
    return acceptanceId;
  }

  public void setAcceptanceId(Long acceptanceId) {
    this.acceptanceId = acceptanceId;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
