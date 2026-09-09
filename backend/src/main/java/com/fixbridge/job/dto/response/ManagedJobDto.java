package com.fixbridge.job.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ManagedJobDto {

  private Long id;
  private String bookingId;
  private String jobMode;
  private String status;
  private String category;
  private String serviceSubcategory;
  private String title;
  private String description;
  private String mediaDataUrl;
  private String mediaType;
  private String preferredDate;
  private String preferredTimeSlot;
  private String serviceTiming;
  private String cityStateZip;
  private String fullAddress;
  private String streetAddress;
  private String city;
  private String state;
  private String zip;
  private String country;
  private String contactName;
  private String contactPhone;
  private Long propertyId;
  private String priorityTier;
  private Long homeownerUserId;
  private JsonNode aiAssessment;
  private String assessmentStatus;
  private String assessmentErrorCode;
  private Boolean showRetailPrice;
  private Double customerRetailEstimateLow;
  private Double customerRetailEstimateHigh;
  private Double estimatedContractorNetLow;
  private Double estimatedContractorNetHigh;
  private String pricingDisclaimer;
  private String estimateContext;
  private String estimateConfidence;
  private String preferredTimeNote;
  private Long assignedContractorUserId;
  private Long preferredContractorUserId;
  private Long activeProposalId;
  private JsonNode completionReport;
  private OffsetDateTime customerConfirmedAt;
  private String partnerCode;
  private String discountCode;
  private String discountLabel;
  private String discountType;
  private Double discountValue;
  private String discountSummary;
  private Double discountAmountLow;
  private Double discountAmountHigh;
  private String propertyPurpose;
  private String transactionStage;
  private OffsetDateTime createdAt;
  private OffsetDateTime updatedAt;
  private JsonNode pricing;
  private Boolean visitFeeAuthorized;
  private Boolean visitFeeCaptured;
  private Double visitFeeAmount;
  private String diyRiskLevel;
  private String workQueueStatus;
  private Double serviceFeeAmount;
  private Double serviceAmount;
  private Double couponDiscountAmount;
  private Double finalCustomerAmount;
  private OffsetDateTime paymentCompletedAt;
  private JsonNode checkoutSnapshot;
  private String cancellationReason;
  private String cancellationReasonCode;
  private JsonNode cancellationDetails;
  private OffsetDateTime cancelledAt;
  private String cancelledBy;
  private String homeownerStatusLabel;
  private Double quotedAmount;
  private Double paidAmount;
  private Double outstandingAmount;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public String getBookingId() {
    return bookingId;
  }

  public void setBookingId(String bookingId) {
    this.bookingId = bookingId;
  }

  public String getJobMode() {
    return jobMode;
  }

  public void setJobMode(String jobMode) {
    this.jobMode = jobMode;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getCategory() {
    return category;
  }

  public void setCategory(String category) {
    this.category = category;
  }

  public String getServiceSubcategory() {
    return serviceSubcategory;
  }

  public void setServiceSubcategory(String serviceSubcategory) {
    this.serviceSubcategory = serviceSubcategory;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
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

  public String getMediaType() {
    return mediaType;
  }

  public void setMediaType(String mediaType) {
    this.mediaType = mediaType;
  }

  public String getPreferredDate() {
    return preferredDate;
  }

  public void setPreferredDate(String preferredDate) {
    this.preferredDate = preferredDate;
  }

  public String getPreferredTimeSlot() {
    return preferredTimeSlot;
  }

  public void setPreferredTimeSlot(String preferredTimeSlot) {
    this.preferredTimeSlot = preferredTimeSlot;
  }

  public String getServiceTiming() {
    return serviceTiming;
  }

  public void setServiceTiming(String serviceTiming) {
    this.serviceTiming = serviceTiming;
  }

  public String getCityStateZip() {
    return cityStateZip;
  }

  public void setCityStateZip(String cityStateZip) {
    this.cityStateZip = cityStateZip;
  }

  public String getFullAddress() {
    return fullAddress;
  }

  public void setFullAddress(String fullAddress) {
    this.fullAddress = fullAddress;
  }

  public String getStreetAddress() {
    return streetAddress;
  }

  public void setStreetAddress(String streetAddress) {
    this.streetAddress = streetAddress;
  }

  public String getCity() {
    return city;
  }

  public void setCity(String city) {
    this.city = city;
  }

  public String getState() {
    return state;
  }

  public void setState(String state) {
    this.state = state;
  }

  public String getZip() {
    return zip;
  }

  public void setZip(String zip) {
    this.zip = zip;
  }

  public String getCountry() {
    return country;
  }

  public void setCountry(String country) {
    this.country = country;
  }

  public String getContactName() {
    return contactName;
  }

  public void setContactName(String contactName) {
    this.contactName = contactName;
  }

  public String getContactPhone() {
    return contactPhone;
  }

  public void setContactPhone(String contactPhone) {
    this.contactPhone = contactPhone;
  }

  public Long getPropertyId() {
    return propertyId;
  }

  public void setPropertyId(Long propertyId) {
    this.propertyId = propertyId;
  }

  public String getPriorityTier() {
    return priorityTier;
  }

  public void setPriorityTier(String priorityTier) {
    this.priorityTier = priorityTier;
  }

  public Long getHomeownerUserId() {
    return homeownerUserId;
  }

  public void setHomeownerUserId(Long homeownerUserId) {
    this.homeownerUserId = homeownerUserId;
  }

  public JsonNode getAiAssessment() {
    return aiAssessment;
  }

  public void setAiAssessment(JsonNode aiAssessment) {
    this.aiAssessment = aiAssessment;
  }

  public String getAssessmentStatus() {
    return assessmentStatus;
  }

  public void setAssessmentStatus(String assessmentStatus) {
    this.assessmentStatus = assessmentStatus;
  }

  public String getAssessmentErrorCode() {
    return assessmentErrorCode;
  }

  public void setAssessmentErrorCode(String assessmentErrorCode) {
    this.assessmentErrorCode = assessmentErrorCode;
  }

  public Boolean getShowRetailPrice() {
    return showRetailPrice;
  }

  public void setShowRetailPrice(Boolean showRetailPrice) {
    this.showRetailPrice = showRetailPrice;
  }

  public Double getCustomerRetailEstimateLow() {
    return customerRetailEstimateLow;
  }

  public void setCustomerRetailEstimateLow(Double customerRetailEstimateLow) {
    this.customerRetailEstimateLow = customerRetailEstimateLow;
  }

  public Double getCustomerRetailEstimateHigh() {
    return customerRetailEstimateHigh;
  }

  public void setCustomerRetailEstimateHigh(Double customerRetailEstimateHigh) {
    this.customerRetailEstimateHigh = customerRetailEstimateHigh;
  }

  public Double getEstimatedContractorNetLow() {
    return estimatedContractorNetLow;
  }

  public void setEstimatedContractorNetLow(Double estimatedContractorNetLow) {
    this.estimatedContractorNetLow = estimatedContractorNetLow;
  }

  public Double getEstimatedContractorNetHigh() {
    return estimatedContractorNetHigh;
  }

  public void setEstimatedContractorNetHigh(Double estimatedContractorNetHigh) {
    this.estimatedContractorNetHigh = estimatedContractorNetHigh;
  }

  public String getPricingDisclaimer() {
    return pricingDisclaimer;
  }

  public void setPricingDisclaimer(String pricingDisclaimer) {
    this.pricingDisclaimer = pricingDisclaimer;
  }

  public String getEstimateContext() {
    return estimateContext;
  }

  public void setEstimateContext(String estimateContext) {
    this.estimateContext = estimateContext;
  }

  public String getEstimateConfidence() {
    return estimateConfidence;
  }

  public void setEstimateConfidence(String estimateConfidence) {
    this.estimateConfidence = estimateConfidence;
  }

  public String getPreferredTimeNote() {
    return preferredTimeNote;
  }

  public void setPreferredTimeNote(String preferredTimeNote) {
    this.preferredTimeNote = preferredTimeNote;
  }

  public Long getAssignedContractorUserId() {
    return assignedContractorUserId;
  }

  public void setAssignedContractorUserId(Long assignedContractorUserId) {
    this.assignedContractorUserId = assignedContractorUserId;
  }

  public Long getPreferredContractorUserId() {
    return preferredContractorUserId;
  }

  public void setPreferredContractorUserId(Long preferredContractorUserId) {
    this.preferredContractorUserId = preferredContractorUserId;
  }

  public Long getActiveProposalId() {
    return activeProposalId;
  }

  public void setActiveProposalId(Long activeProposalId) {
    this.activeProposalId = activeProposalId;
  }

  public JsonNode getCompletionReport() {
    return completionReport;
  }

  public void setCompletionReport(JsonNode completionReport) {
    this.completionReport = completionReport;
  }

  public OffsetDateTime getCustomerConfirmedAt() {
    return customerConfirmedAt;
  }

  public void setCustomerConfirmedAt(OffsetDateTime customerConfirmedAt) {
    this.customerConfirmedAt = customerConfirmedAt;
  }

  public String getPartnerCode() {
    return partnerCode;
  }

  public void setPartnerCode(String partnerCode) {
    this.partnerCode = partnerCode;
  }

  public String getDiscountCode() {
    return discountCode;
  }

  public void setDiscountCode(String discountCode) {
    this.discountCode = discountCode;
  }

  public String getDiscountLabel() {
    return discountLabel;
  }

  public void setDiscountLabel(String discountLabel) {
    this.discountLabel = discountLabel;
  }

  public String getDiscountType() {
    return discountType;
  }

  public void setDiscountType(String discountType) {
    this.discountType = discountType;
  }

  public Double getDiscountValue() {
    return discountValue;
  }

  public void setDiscountValue(Double discountValue) {
    this.discountValue = discountValue;
  }

  public String getDiscountSummary() {
    return discountSummary;
  }

  public void setDiscountSummary(String discountSummary) {
    this.discountSummary = discountSummary;
  }

  public Double getDiscountAmountLow() {
    return discountAmountLow;
  }

  public void setDiscountAmountLow(Double discountAmountLow) {
    this.discountAmountLow = discountAmountLow;
  }

  public Double getDiscountAmountHigh() {
    return discountAmountHigh;
  }

  public void setDiscountAmountHigh(Double discountAmountHigh) {
    this.discountAmountHigh = discountAmountHigh;
  }

  public String getPropertyPurpose() {
    return propertyPurpose;
  }

  public void setPropertyPurpose(String propertyPurpose) {
    this.propertyPurpose = propertyPurpose;
  }

  public String getTransactionStage() {
    return transactionStage;
  }

  public void setTransactionStage(String transactionStage) {
    this.transactionStage = transactionStage;
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

  public JsonNode getPricing() {
    return pricing;
  }

  public void setPricing(JsonNode pricing) {
    this.pricing = pricing;
  }

  public Boolean getVisitFeeAuthorized() {
    return visitFeeAuthorized;
  }

  public void setVisitFeeAuthorized(Boolean visitFeeAuthorized) {
    this.visitFeeAuthorized = visitFeeAuthorized;
  }

  public Boolean getVisitFeeCaptured() {
    return visitFeeCaptured;
  }

  public void setVisitFeeCaptured(Boolean visitFeeCaptured) {
    this.visitFeeCaptured = visitFeeCaptured;
  }

  public Double getVisitFeeAmount() {
    return visitFeeAmount;
  }

  public void setVisitFeeAmount(Double visitFeeAmount) {
    this.visitFeeAmount = visitFeeAmount;
  }

  public String getDiyRiskLevel() {
    return diyRiskLevel;
  }

  public void setDiyRiskLevel(String diyRiskLevel) {
    this.diyRiskLevel = diyRiskLevel;
  }

  public String getWorkQueueStatus() {
    return workQueueStatus;
  }

  public void setWorkQueueStatus(String workQueueStatus) {
    this.workQueueStatus = workQueueStatus;
  }

  public Double getServiceFeeAmount() {
    return serviceFeeAmount;
  }

  public void setServiceFeeAmount(Double serviceFeeAmount) {
    this.serviceFeeAmount = serviceFeeAmount;
  }

  public Double getServiceAmount() {
    return serviceAmount;
  }

  public void setServiceAmount(Double serviceAmount) {
    this.serviceAmount = serviceAmount;
  }

  public Double getCouponDiscountAmount() {
    return couponDiscountAmount;
  }

  public void setCouponDiscountAmount(Double couponDiscountAmount) {
    this.couponDiscountAmount = couponDiscountAmount;
  }

  public Double getFinalCustomerAmount() {
    return finalCustomerAmount;
  }

  public void setFinalCustomerAmount(Double finalCustomerAmount) {
    this.finalCustomerAmount = finalCustomerAmount;
  }

  public OffsetDateTime getPaymentCompletedAt() {
    return paymentCompletedAt;
  }

  public void setPaymentCompletedAt(OffsetDateTime paymentCompletedAt) {
    this.paymentCompletedAt = paymentCompletedAt;
  }

  public JsonNode getCheckoutSnapshot() {
    return checkoutSnapshot;
  }

  public void setCheckoutSnapshot(JsonNode checkoutSnapshot) {
    this.checkoutSnapshot = checkoutSnapshot;
  }

  public String getCancellationReason() {
    return cancellationReason;
  }

  public void setCancellationReason(String cancellationReason) {
    this.cancellationReason = cancellationReason;
  }

  public String getCancellationReasonCode() {
    return cancellationReasonCode;
  }

  public void setCancellationReasonCode(String cancellationReasonCode) {
    this.cancellationReasonCode = cancellationReasonCode;
  }

  public JsonNode getCancellationDetails() {
    return cancellationDetails;
  }

  public void setCancellationDetails(JsonNode cancellationDetails) {
    this.cancellationDetails = cancellationDetails;
  }

  public OffsetDateTime getCancelledAt() {
    return cancelledAt;
  }

  public void setCancelledAt(OffsetDateTime cancelledAt) {
    this.cancelledAt = cancelledAt;
  }

  public String getCancelledBy() {
    return cancelledBy;
  }

  public void setCancelledBy(String cancelledBy) {
    this.cancelledBy = cancelledBy;
  }

  public String getHomeownerStatusLabel() {
    return homeownerStatusLabel;
  }

  public void setHomeownerStatusLabel(String homeownerStatusLabel) {
    this.homeownerStatusLabel = homeownerStatusLabel;
  }

  public Double getQuotedAmount() {
    return quotedAmount;
  }

  public void setQuotedAmount(Double quotedAmount) {
    this.quotedAmount = quotedAmount;
  }

  public Double getPaidAmount() {
    return paidAmount;
  }

  public void setPaidAmount(Double paidAmount) {
    this.paidAmount = paidAmount;
  }

  public Double getOutstandingAmount() {
    return outstandingAmount;
  }

  public void setOutstandingAmount(Double outstandingAmount) {
    this.outstandingAmount = outstandingAmount;
  }
}
