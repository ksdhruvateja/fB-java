package com.fixbridge.payment.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "refunds")
public class RefundEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "payment_id")
  private Long paymentId;

  @Column(name = "job_id")
  private Long jobId;

  @Column(nullable = false, precision = 12, scale = 2)
  private BigDecimal amount;

  @Column(columnDefinition = "TEXT")
  private String reason;

  private String status = "pending";

  @Column(name = "stripe_refund_id")
  private String stripeRefundId;

  private Boolean simulated = false;

  @Column(name = "created_by")
  private Long createdBy;

  @Column(name = "idempotency_key")
  private String idempotencyKey;

  @Column(name = "ledger_note", columnDefinition = "TEXT")
  private String ledgerNote;

  @Column(name = "created_at")
  private OffsetDateTime createdAt;

  @PrePersist
  void onCreate() {
    if (createdAt == null) {
      createdAt = OffsetDateTime.now();
    }
    if (status == null) {
      status = "pending";
    }
    if (simulated == null) {
      simulated = false;
    }
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public Long getPaymentId() {
    return paymentId;
  }

  public void setPaymentId(Long paymentId) {
    this.paymentId = paymentId;
  }

  public Long getJobId() {
    return jobId;
  }

  public void setJobId(Long jobId) {
    this.jobId = jobId;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public void setAmount(BigDecimal amount) {
    this.amount = amount;
  }

  public String getReason() {
    return reason;
  }

  public void setReason(String reason) {
    this.reason = reason;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getStripeRefundId() {
    return stripeRefundId;
  }

  public void setStripeRefundId(String stripeRefundId) {
    this.stripeRefundId = stripeRefundId;
  }

  public Boolean getSimulated() {
    return simulated;
  }

  public void setSimulated(Boolean simulated) {
    this.simulated = simulated;
  }

  public Long getCreatedBy() {
    return createdBy;
  }

  public void setCreatedBy(Long createdBy) {
    this.createdBy = createdBy;
  }

  public String getIdempotencyKey() {
    return idempotencyKey;
  }

  public void setIdempotencyKey(String idempotencyKey) {
    this.idempotencyKey = idempotencyKey;
  }

  public String getLedgerNote() {
    return ledgerNote;
  }

  public void setLedgerNote(String ledgerNote) {
    this.ledgerNote = ledgerNote;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
