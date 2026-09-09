package com.fixbridge.payment.entity;

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
@Table(name = "financial_ledger_events")
public class FinancialLedgerEventEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "event_type", nullable = false, length = 80)
  private String eventType;

  @Column(name = "job_id")
  private Long jobId;

  @Column(name = "payment_id")
  private Long paymentId;

  @Column(name = "payout_id")
  private Long payoutId;

  @Column(name = "contractor_id")
  private Long contractorId;

  @Column(name = "amount_cents")
  private Integer amountCents;

  @Column(name = "stripe_object_id")
  private String stripeObjectId;

  @Column(name = "created_by")
  private Long createdBy;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private JsonNode metadata;

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

  public String getEventType() {
    return eventType;
  }

  public void setEventType(String eventType) {
    this.eventType = eventType;
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

  public Long getPayoutId() {
    return payoutId;
  }

  public void setPayoutId(Long payoutId) {
    this.payoutId = payoutId;
  }

  public Long getContractorId() {
    return contractorId;
  }

  public void setContractorId(Long contractorId) {
    this.contractorId = contractorId;
  }

  public Integer getAmountCents() {
    return amountCents;
  }

  public void setAmountCents(Integer amountCents) {
    this.amountCents = amountCents;
  }

  public String getStripeObjectId() {
    return stripeObjectId;
  }

  public void setStripeObjectId(String stripeObjectId) {
    this.stripeObjectId = stripeObjectId;
  }

  public Long getCreatedBy() {
    return createdBy;
  }

  public void setCreatedBy(Long createdBy) {
    this.createdBy = createdBy;
  }

  public JsonNode getMetadata() {
    return metadata;
  }

  public void setMetadata(JsonNode metadata) {
    this.metadata = metadata;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
