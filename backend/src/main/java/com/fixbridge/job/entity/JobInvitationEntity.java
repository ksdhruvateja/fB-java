package com.fixbridge.job.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(
    name = "job_invitations",
    uniqueConstraints =
        @UniqueConstraint(
            name = "uq_job_invitations_job_contractor",
            columnNames = {"job_id", "contractor_user_id"}))
public class JobInvitationEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "job_id", nullable = false)
  private Long jobId;

  @Column(name = "contractor_user_id", nullable = false)
  private Long contractorUserId;

  @Column(nullable = false)
  private String status = "invited";

  @Column(name = "expected_net_low")
  private BigDecimal expectedNetLow;

  @Column(name = "expected_net_high")
  private BigDecimal expectedNetHigh;

  @Column(columnDefinition = "TEXT")
  private String message;

  @Column(name = "invited_by")
  private Long invitedBy;

  @Column(name = "request_type")
  private String requestType = "remote_quote";

  @Column(name = "site_visit_window")
  private String siteVisitWindow;

  @Column(name = "created_at")
  private OffsetDateTime createdAt;

  @Column(name = "responded_at")
  private OffsetDateTime respondedAt;

  @PrePersist
  void onCreate() {
    if (createdAt == null) {
      createdAt = OffsetDateTime.now();
    }
    if (status == null) {
      status = "invited";
    }
    if (requestType == null) {
      requestType = "remote_quote";
    }
  }

  @PreUpdate
  void onUpdate() {
    // no-op; responded_at set explicitly
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

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public BigDecimal getExpectedNetLow() {
    return expectedNetLow;
  }

  public void setExpectedNetLow(BigDecimal expectedNetLow) {
    this.expectedNetLow = expectedNetLow;
  }

  public BigDecimal getExpectedNetHigh() {
    return expectedNetHigh;
  }

  public void setExpectedNetHigh(BigDecimal expectedNetHigh) {
    this.expectedNetHigh = expectedNetHigh;
  }

  public String getMessage() {
    return message;
  }

  public void setMessage(String message) {
    this.message = message;
  }

  public Long getInvitedBy() {
    return invitedBy;
  }

  public void setInvitedBy(Long invitedBy) {
    this.invitedBy = invitedBy;
  }

  public String getRequestType() {
    return requestType;
  }

  public void setRequestType(String requestType) {
    this.requestType = requestType;
  }

  public String getSiteVisitWindow() {
    return siteVisitWindow;
  }

  public void setSiteVisitWindow(String siteVisitWindow) {
    this.siteVisitWindow = siteVisitWindow;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }

  public OffsetDateTime getRespondedAt() {
    return respondedAt;
  }

  public void setRespondedAt(OffsetDateTime respondedAt) {
    this.respondedAt = respondedAt;
  }
}
