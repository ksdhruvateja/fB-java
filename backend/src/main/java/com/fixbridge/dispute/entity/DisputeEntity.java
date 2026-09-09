package com.fixbridge.dispute.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "disputes")
public class DisputeEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "payment_id")
  private Long paymentId;

  @Column(name = "job_id")
  private Long jobId;

  @Column(name = "stripe_dispute_id")
  private String stripeDisputeId;

  @Column(precision = 12, scale = 2)
  private BigDecimal amount;

  @Column(length = 1024)
  private String reason;

  @Column(length = 64)
  private String category;

  @Column(columnDefinition = "TEXT")
  private String description;

  @Column(name = "preferred_resolution", length = 512)
  private String preferredResolution;

  private String status = "open";

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private JsonNode meta;

  @Column(name = "opened_by_user_id")
  private Long openedByUserId;

  @Column(name = "opened_by_role", length = 32)
  private String openedByRole;

  @Column(name = "homeowner_user_id")
  private Long homeownerUserId;

  @Column(name = "contractor_user_id")
  private Long contractorUserId;

  @Column(name = "assigned_employee_id")
  private Long assignedEmployeeId;

  @Column(name = "created_at")
  private OffsetDateTime createdAt;

  @Column(name = "updated_at")
  private OffsetDateTime updatedAt;

  @PrePersist
  void onCreate() {
    OffsetDateTime now = OffsetDateTime.now();
    if (createdAt == null) {
      createdAt = now;
    }
    updatedAt = now;
    if (status == null) {
      status = "open";
    }
  }

  @PreUpdate
  void onUpdate() {
    updatedAt = OffsetDateTime.now();
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

  public String getStripeDisputeId() {
    return stripeDisputeId;
  }

  public void setStripeDisputeId(String stripeDisputeId) {
    this.stripeDisputeId = stripeDisputeId;
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

  public String getCategory() {
    return category;
  }

  public void setCategory(String category) {
    this.category = category;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getPreferredResolution() {
    return preferredResolution;
  }

  public void setPreferredResolution(String preferredResolution) {
    this.preferredResolution = preferredResolution;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public JsonNode getMeta() {
    return meta;
  }

  public void setMeta(JsonNode meta) {
    this.meta = meta;
  }

  public Long getOpenedByUserId() {
    return openedByUserId;
  }

  public void setOpenedByUserId(Long openedByUserId) {
    this.openedByUserId = openedByUserId;
  }

  public String getOpenedByRole() {
    return openedByRole;
  }

  public void setOpenedByRole(String openedByRole) {
    this.openedByRole = openedByRole;
  }

  public Long getHomeownerUserId() {
    return homeownerUserId;
  }

  public void setHomeownerUserId(Long homeownerUserId) {
    this.homeownerUserId = homeownerUserId;
  }

  public Long getContractorUserId() {
    return contractorUserId;
  }

  public void setContractorUserId(Long contractorUserId) {
    this.contractorUserId = contractorUserId;
  }

  public Long getAssignedEmployeeId() {
    return assignedEmployeeId;
  }

  public void setAssignedEmployeeId(Long assignedEmployeeId) {
    this.assignedEmployeeId = assignedEmployeeId;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }

  public OffsetDateTime getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(OffsetDateTime updatedAt) {
    this.updatedAt = updatedAt;
  }
}
