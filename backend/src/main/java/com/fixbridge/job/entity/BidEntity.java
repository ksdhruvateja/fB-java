package com.fixbridge.job.entity;

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
@Table(name = "bids")
public class BidEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "job_id", nullable = false)
  private Long jobId;

  @Column(name = "contractor_user_id", nullable = false)
  private Long contractorUserId;

  @Column(name = "net_total", nullable = false, precision = 12, scale = 2)
  private BigDecimal netTotal;

  @Column(name = "labor_amount", precision = 12, scale = 2)
  private BigDecimal laborAmount;

  @Column(name = "materials_amount", precision = 12, scale = 2)
  private BigDecimal materialsAmount;

  @Column(columnDefinition = "TEXT")
  private String timeline;

  @Column(columnDefinition = "TEXT")
  private String warranty;

  @Column(columnDefinition = "TEXT")
  private String exclusions;

  @Column(columnDefinition = "TEXT")
  private String notes;

  @Column(nullable = false)
  private String status = "submitted";

  @Column(name = "created_at")
  private OffsetDateTime createdAt;

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

  public BigDecimal getNetTotal() {
    return netTotal;
  }

  public void setNetTotal(BigDecimal netTotal) {
    this.netTotal = netTotal;
  }

  public BigDecimal getLaborAmount() {
    return laborAmount;
  }

  public void setLaborAmount(BigDecimal laborAmount) {
    this.laborAmount = laborAmount;
  }

  public BigDecimal getMaterialsAmount() {
    return materialsAmount;
  }

  public void setMaterialsAmount(BigDecimal materialsAmount) {
    this.materialsAmount = materialsAmount;
  }

  public String getTimeline() {
    return timeline;
  }

  public void setTimeline(String timeline) {
    this.timeline = timeline;
  }

  public String getWarranty() {
    return warranty;
  }

  public void setWarranty(String warranty) {
    this.warranty = warranty;
  }

  public String getExclusions() {
    return exclusions;
  }

  public void setExclusions(String exclusions) {
    this.exclusions = exclusions;
  }

  public String getNotes() {
    return notes;
  }

  public void setNotes(String notes) {
    this.notes = notes;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
