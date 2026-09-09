package com.fixbridge.compliance.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "contractor_compliance_documents")
public class ContractorComplianceDocumentEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "contractor_user_id", nullable = false)
  private Long contractorUserId;

  @Column(name = "document_type", nullable = false)
  private String documentType;

  @Column(nullable = false)
  private String applicability = "REQUIRED";

  @Column(nullable = false)
  private String status = "MISSING";

  @Column(name = "file_name")
  private String fileName;

  @Column(name = "file_data", columnDefinition = "CLOB")
  private String fileData;

  @Column(name = "issue_date")
  private LocalDate issueDate;

  @Column(name = "expiration_date")
  private LocalDate expirationDate;

  @Column(name = "upload_later")
  private Boolean uploadLater = false;

  @Column(name = "uploaded_at")
  private OffsetDateTime uploadedAt;

  @Column(name = "verified_at")
  private OffsetDateTime verifiedAt;

  @Column(name = "verified_by")
  private Long verifiedBy;

  @Column(name = "rejected_at")
  private OffsetDateTime rejectedAt;

  @Column(name = "rejected_by")
  private Long rejectedBy;

  @Column(name = "rejection_reason", columnDefinition = "CLOB")
  private String rejectionReason;

  @Column(columnDefinition = "CLOB")
  private String notes;

  @Column(name = "policy_carrier")
  private String policyCarrier;

  @Column(name = "policy_number")
  private String policyNumber;

  @Column(nullable = false)
  private Integer version = 1;

  @Column(name = "is_current", nullable = false)
  private Boolean current = true;

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
    if (applicability == null) {
      applicability = "REQUIRED";
    }
    if (status == null) {
      status = "MISSING";
    }
    if (version == null) {
      version = 1;
    }
    if (current == null) {
      current = true;
    }
    if (uploadLater == null) {
      uploadLater = false;
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

  public Long getContractorUserId() {
    return contractorUserId;
  }

  public void setContractorUserId(Long contractorUserId) {
    this.contractorUserId = contractorUserId;
  }

  public String getDocumentType() {
    return documentType;
  }

  public void setDocumentType(String documentType) {
    this.documentType = documentType;
  }

  public String getApplicability() {
    return applicability;
  }

  public void setApplicability(String applicability) {
    this.applicability = applicability;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getFileName() {
    return fileName;
  }

  public void setFileName(String fileName) {
    this.fileName = fileName;
  }

  public String getFileData() {
    return fileData;
  }

  public void setFileData(String fileData) {
    this.fileData = fileData;
  }

  public LocalDate getIssueDate() {
    return issueDate;
  }

  public void setIssueDate(LocalDate issueDate) {
    this.issueDate = issueDate;
  }

  public LocalDate getExpirationDate() {
    return expirationDate;
  }

  public void setExpirationDate(LocalDate expirationDate) {
    this.expirationDate = expirationDate;
  }

  public Boolean getUploadLater() {
    return uploadLater;
  }

  public void setUploadLater(Boolean uploadLater) {
    this.uploadLater = uploadLater;
  }

  public OffsetDateTime getUploadedAt() {
    return uploadedAt;
  }

  public void setUploadedAt(OffsetDateTime uploadedAt) {
    this.uploadedAt = uploadedAt;
  }

  public OffsetDateTime getVerifiedAt() {
    return verifiedAt;
  }

  public void setVerifiedAt(OffsetDateTime verifiedAt) {
    this.verifiedAt = verifiedAt;
  }

  public Long getVerifiedBy() {
    return verifiedBy;
  }

  public void setVerifiedBy(Long verifiedBy) {
    this.verifiedBy = verifiedBy;
  }

  public OffsetDateTime getRejectedAt() {
    return rejectedAt;
  }

  public void setRejectedAt(OffsetDateTime rejectedAt) {
    this.rejectedAt = rejectedAt;
  }

  public Long getRejectedBy() {
    return rejectedBy;
  }

  public void setRejectedBy(Long rejectedBy) {
    this.rejectedBy = rejectedBy;
  }

  public String getRejectionReason() {
    return rejectionReason;
  }

  public void setRejectionReason(String rejectionReason) {
    this.rejectionReason = rejectionReason;
  }

  public String getNotes() {
    return notes;
  }

  public void setNotes(String notes) {
    this.notes = notes;
  }

  public String getPolicyCarrier() {
    return policyCarrier;
  }

  public void setPolicyCarrier(String policyCarrier) {
    this.policyCarrier = policyCarrier;
  }

  public String getPolicyNumber() {
    return policyNumber;
  }

  public void setPolicyNumber(String policyNumber) {
    this.policyNumber = policyNumber;
  }

  public Integer getVersion() {
    return version;
  }

  public void setVersion(Integer version) {
    this.version = version;
  }

  public Boolean getCurrent() {
    return current;
  }

  public void setCurrent(Boolean current) {
    this.current = current;
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
