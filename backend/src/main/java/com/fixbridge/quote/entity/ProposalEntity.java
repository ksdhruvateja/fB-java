package com.fixbridge.quote.entity;

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
@Table(name = "proposals")
public class ProposalEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "job_id", nullable = false)
  private Long jobId;

  @Column(name = "bid_id")
  private Long bidId;

  @Column(name = "scope_summary", columnDefinition = "TEXT")
  private String scopeSummary;

  @Column(name = "retail_amount", nullable = false, precision = 12, scale = 2)
  private BigDecimal retailAmount;

  @Column(name = "deposit_amount", precision = 12, scale = 2)
  private BigDecimal depositAmount;

  @Column(columnDefinition = "TEXT")
  private String timeline;

  @Column(columnDefinition = "TEXT")
  private String warranty;

  @Column(columnDefinition = "TEXT")
  private String exclusions;

  @Column(name = "contractor_net", precision = 12, scale = 2)
  private BigDecimal contractorNet;

  @Column(name = "platform_gross", precision = 12, scale = 2)
  private BigDecimal platformGross;

  @Column(name = "processing_cost", precision = 12, scale = 2)
  private BigDecimal processingCost;

  @Column(nullable = false)
  private String status = "draft";

  @Column(name = "created_by")
  private Long createdBy;

  @Column(name = "published_at")
  private OffsetDateTime publishedAt;

  @Column(name = "approved_at")
  private OffsetDateTime approvedAt;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "line_items", columnDefinition = "jsonb")
  private JsonNode lineItems;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "customer_line_items", columnDefinition = "jsonb")
  private JsonNode customerLineItems;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "pricing_adjustments", columnDefinition = "jsonb")
  private JsonNode pricingAdjustments;

  @Column(name = "admin_discount", precision = 12, scale = 2)
  private BigDecimal adminDiscount;

  @Column(name = "admin_discount_reason")
  private String adminDiscountReason;

  @Column(name = "coupon_code")
  private String couponCode;

  @Column(name = "quote_valid_until")
  private OffsetDateTime quoteValidUntil;

  @Column(name = "service_charge", precision = 12, scale = 2)
  private BigDecimal serviceCharge;

  @Column(name = "quote_number")
  private String quoteNumber;

  @Column(name = "shipping_amount", precision = 12, scale = 2)
  private BigDecimal shippingAmount;

  @Column(name = "quote_option_label")
  private String quoteOptionLabel;

  @Column(name = "quote_option_title")
  private String quoteOptionTitle;

  @Column(name = "option_group")
  private String optionGroup;

  @Column(name = "option_selection_status")
  private String optionSelectionStatus = "pending";

  @Column(name = "version_number")
  private Integer versionNumber = 1;

  @Column(name = "contractor_quote_amount", precision = 12, scale = 2)
  private BigDecimal contractorQuoteAmount;

  @Column(name = "converted_invoice_id")
  private Long convertedInvoiceId;

  @Column(name = "locked_at")
  private OffsetDateTime lockedAt;

  @Column(name = "accepted_snapshot_id")
  private Long acceptedSnapshotId;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "document_totals", columnDefinition = "jsonb")
  private JsonNode documentTotals;

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
      status = "draft";
    }
    if (versionNumber == null) {
      versionNumber = 1;
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

  public Long getJobId() {
    return jobId;
  }

  public void setJobId(Long jobId) {
    this.jobId = jobId;
  }

  public Long getBidId() {
    return bidId;
  }

  public void setBidId(Long bidId) {
    this.bidId = bidId;
  }

  public String getScopeSummary() {
    return scopeSummary;
  }

  public void setScopeSummary(String scopeSummary) {
    this.scopeSummary = scopeSummary;
  }

  public BigDecimal getRetailAmount() {
    return retailAmount;
  }

  public void setRetailAmount(BigDecimal retailAmount) {
    this.retailAmount = retailAmount;
  }

  public BigDecimal getDepositAmount() {
    return depositAmount;
  }

  public void setDepositAmount(BigDecimal depositAmount) {
    this.depositAmount = depositAmount;
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

  public BigDecimal getContractorNet() {
    return contractorNet;
  }

  public void setContractorNet(BigDecimal contractorNet) {
    this.contractorNet = contractorNet;
  }

  public BigDecimal getPlatformGross() {
    return platformGross;
  }

  public void setPlatformGross(BigDecimal platformGross) {
    this.platformGross = platformGross;
  }

  public BigDecimal getProcessingCost() {
    return processingCost;
  }

  public void setProcessingCost(BigDecimal processingCost) {
    this.processingCost = processingCost;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public Long getCreatedBy() {
    return createdBy;
  }

  public void setCreatedBy(Long createdBy) {
    this.createdBy = createdBy;
  }

  public OffsetDateTime getPublishedAt() {
    return publishedAt;
  }

  public void setPublishedAt(OffsetDateTime publishedAt) {
    this.publishedAt = publishedAt;
  }

  public OffsetDateTime getApprovedAt() {
    return approvedAt;
  }

  public void setApprovedAt(OffsetDateTime approvedAt) {
    this.approvedAt = approvedAt;
  }

  public JsonNode getLineItems() {
    return lineItems;
  }

  public void setLineItems(JsonNode lineItems) {
    this.lineItems = lineItems;
  }

  public JsonNode getCustomerLineItems() {
    return customerLineItems;
  }

  public void setCustomerLineItems(JsonNode customerLineItems) {
    this.customerLineItems = customerLineItems;
  }

  public JsonNode getPricingAdjustments() {
    return pricingAdjustments;
  }

  public void setPricingAdjustments(JsonNode pricingAdjustments) {
    this.pricingAdjustments = pricingAdjustments;
  }

  public BigDecimal getAdminDiscount() {
    return adminDiscount;
  }

  public void setAdminDiscount(BigDecimal adminDiscount) {
    this.adminDiscount = adminDiscount;
  }

  public String getAdminDiscountReason() {
    return adminDiscountReason;
  }

  public void setAdminDiscountReason(String adminDiscountReason) {
    this.adminDiscountReason = adminDiscountReason;
  }

  public String getCouponCode() {
    return couponCode;
  }

  public void setCouponCode(String couponCode) {
    this.couponCode = couponCode;
  }

  public OffsetDateTime getQuoteValidUntil() {
    return quoteValidUntil;
  }

  public void setQuoteValidUntil(OffsetDateTime quoteValidUntil) {
    this.quoteValidUntil = quoteValidUntil;
  }

  public BigDecimal getServiceCharge() {
    return serviceCharge;
  }

  public void setServiceCharge(BigDecimal serviceCharge) {
    this.serviceCharge = serviceCharge;
  }

  public String getQuoteNumber() {
    return quoteNumber;
  }

  public void setQuoteNumber(String quoteNumber) {
    this.quoteNumber = quoteNumber;
  }

  public BigDecimal getShippingAmount() {
    return shippingAmount;
  }

  public void setShippingAmount(BigDecimal shippingAmount) {
    this.shippingAmount = shippingAmount;
  }

  public String getQuoteOptionLabel() {
    return quoteOptionLabel;
  }

  public void setQuoteOptionLabel(String quoteOptionLabel) {
    this.quoteOptionLabel = quoteOptionLabel;
  }

  public String getQuoteOptionTitle() {
    return quoteOptionTitle;
  }

  public void setQuoteOptionTitle(String quoteOptionTitle) {
    this.quoteOptionTitle = quoteOptionTitle;
  }

  public String getOptionGroup() {
    return optionGroup;
  }

  public void setOptionGroup(String optionGroup) {
    this.optionGroup = optionGroup;
  }

  public String getOptionSelectionStatus() {
    return optionSelectionStatus;
  }

  public void setOptionSelectionStatus(String optionSelectionStatus) {
    this.optionSelectionStatus = optionSelectionStatus;
  }

  public Integer getVersionNumber() {
    return versionNumber;
  }

  public void setVersionNumber(Integer versionNumber) {
    this.versionNumber = versionNumber;
  }

  public BigDecimal getContractorQuoteAmount() {
    return contractorQuoteAmount;
  }

  public void setContractorQuoteAmount(BigDecimal contractorQuoteAmount) {
    this.contractorQuoteAmount = contractorQuoteAmount;
  }

  public Long getConvertedInvoiceId() {
    return convertedInvoiceId;
  }

  public void setConvertedInvoiceId(Long convertedInvoiceId) {
    this.convertedInvoiceId = convertedInvoiceId;
  }

  public OffsetDateTime getLockedAt() {
    return lockedAt;
  }

  public void setLockedAt(OffsetDateTime lockedAt) {
    this.lockedAt = lockedAt;
  }

  public Long getAcceptedSnapshotId() {
    return acceptedSnapshotId;
  }

  public void setAcceptedSnapshotId(Long acceptedSnapshotId) {
    this.acceptedSnapshotId = acceptedSnapshotId;
  }

  public JsonNode getDocumentTotals() {
    return documentTotals;
  }

  public void setDocumentTotals(JsonNode documentTotals) {
    this.documentTotals = documentTotals;
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
