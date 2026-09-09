package com.fixbridge.quote.entity;

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
@Table(name = "quote_revision_snapshots")
public class QuoteRevisionSnapshotEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "proposal_id", nullable = false)
  private Long proposalId;

  @Column(name = "version_number", nullable = false)
  private Integer versionNumber;

  @Column(name = "change_reason", length = 1024)
  private String changeReason;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "document_snapshot", nullable = false, columnDefinition = "jsonb")
  private JsonNode documentSnapshot;

  @Column(name = "customer_total", precision = 12, scale = 2)
  private BigDecimal customerTotal;

  @Column(name = "contractor_amount", precision = 12, scale = 2)
  private BigDecimal contractorAmount;

  @Column(name = "created_by")
  private Long createdBy;

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

  public Long getProposalId() {
    return proposalId;
  }

  public void setProposalId(Long proposalId) {
    this.proposalId = proposalId;
  }

  public Integer getVersionNumber() {
    return versionNumber;
  }

  public void setVersionNumber(Integer versionNumber) {
    this.versionNumber = versionNumber;
  }

  public String getChangeReason() {
    return changeReason;
  }

  public void setChangeReason(String changeReason) {
    this.changeReason = changeReason;
  }

  public JsonNode getDocumentSnapshot() {
    return documentSnapshot;
  }

  public void setDocumentSnapshot(JsonNode documentSnapshot) {
    this.documentSnapshot = documentSnapshot;
  }

  public BigDecimal getCustomerTotal() {
    return customerTotal;
  }

  public void setCustomerTotal(BigDecimal customerTotal) {
    this.customerTotal = customerTotal;
  }

  public BigDecimal getContractorAmount() {
    return contractorAmount;
  }

  public void setContractorAmount(BigDecimal contractorAmount) {
    this.contractorAmount = contractorAmount;
  }

  public Long getCreatedBy() {
    return createdBy;
  }

  public void setCreatedBy(Long createdBy) {
    this.createdBy = createdBy;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
