package com.fixbridge.changeorder.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "change_orders")
public class ChangeOrderEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "job_id", nullable = false)
  private Long jobId;

  @Column(name = "contractor_user_id")
  private Long contractorUserId;

  @Column(nullable = false, columnDefinition = "TEXT")
  private String description;

  @Column(name = "media_data_url", columnDefinition = "TEXT")
  private String mediaDataUrl;

  @Column(name = "contractor_net", nullable = false, precision = 12, scale = 2)
  private BigDecimal contractorNet;

  @Column(name = "retail_amount", precision = 12, scale = 2)
  private BigDecimal retailAmount;

  @Column(nullable = false)
  private String status = "submitted";

  @Column(columnDefinition = "TEXT")
  private String reason;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "line_items", columnDefinition = "jsonb")
  private JsonNode lineItems;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "approved_snapshot", columnDefinition = "jsonb")
  private JsonNode approvedSnapshot;

  @Column(name = "created_at")
  private OffsetDateTime createdAt;

  @Column(name = "approved_at")
  private OffsetDateTime approvedAt;

  @PrePersist
  void onCreate() {
    if (createdAt == null) {
      createdAt = OffsetDateTime.now();
    }
    if (status == null) {
      status = "submitted";
    }
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public Long getJobId() {
    return jobId;
  }

  public void setJobId(Long jobId) {
    this.jobId = jobId;
  }

  public Long getContractorUserId() {
    return contractorUserId;
  }

  public void setContractorUserId(Long contractorUserId) {
    this.contractorUserId = contractorUserId;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getMediaDataUrl() {
    return mediaDataUrl;
  }

  public void setMediaDataUrl(String mediaDataUrl) {
    this.mediaDataUrl = mediaDataUrl;
  }

  public BigDecimal getContractorNet() {
    return contractorNet;
  }

  public void setContractorNet(BigDecimal contractorNet) {
    this.contractorNet = contractorNet;
  }

  public BigDecimal getRetailAmount() {
    return retailAmount;
  }

  public void setRetailAmount(BigDecimal retailAmount) {
    this.retailAmount = retailAmount;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getReason() {
    return reason;
  }

  public void setReason(String reason) {
    this.reason = reason;
  }

  public JsonNode getLineItems() {
    return lineItems;
  }

  public void setLineItems(JsonNode lineItems) {
    this.lineItems = lineItems;
  }

  public JsonNode getApprovedSnapshot() {
    return approvedSnapshot;
  }

  public void setApprovedSnapshot(JsonNode approvedSnapshot) {
    this.approvedSnapshot = approvedSnapshot;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }

  public OffsetDateTime getApprovedAt() {
    return approvedAt;
  }

  public void setApprovedAt(OffsetDateTime approvedAt) {
    this.approvedAt = approvedAt;
  }
}
