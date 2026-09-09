package com.fixbridge.job.entity;

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
@Table(name = "managed_jobs")
public class ManagedJobEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "booking_id", unique = true)
  private String bookingId;

  @Column(name = "homeowner_user_id", nullable = false)
  private Long homeownerUserId;

  @Column(name = "property_id")
  private Long propertyId;

  @Column(name = "job_mode")
  private String jobMode = "managed";

  @Column(nullable = false)
  private String status = "draft";

  private String category;

  @Column(name = "service_subcategory")
  private String serviceSubcategory;

  private String title;

  @Column(columnDefinition = "TEXT")
  private String description;

  @Column(name = "media_data_url", columnDefinition = "TEXT")
  private String mediaDataUrl;

  @Column(name = "media_type")
  private String mediaType;

  @Column(name = "preferred_date")
  private String preferredDate;

  @Column(name = "preferred_time_slot")
  private String preferredTimeSlot;

  @Column(name = "service_timing")
  private String serviceTiming;

  @Column(name = "city_state_zip")
  private String cityStateZip;

  @Column(name = "full_address")
  private String fullAddress;

  @Column(name = "street_address")
  private String streetAddress;

  private String city;
  private String state;
  private String zip;
  private String country = "US";

  @Column(name = "contact_name")
  private String contactName;

  @Column(name = "contact_phone")
  private String contactPhone;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "ai_assessment", columnDefinition = "jsonb")
  private JsonNode aiAssessment;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "pricing", columnDefinition = "jsonb")
  private JsonNode pricing;

  @Column(name = "show_retail_price")
  private Boolean showRetailPrice = true;

  @Column(name = "customer_retail_estimate_low")
  private BigDecimal customerRetailEstimateLow;

  @Column(name = "customer_retail_estimate_high")
  private BigDecimal customerRetailEstimateHigh;

  @Column(name = "estimated_contractor_net_low")
  private BigDecimal estimatedContractorNetLow;

  @Column(name = "estimated_contractor_net_high")
  private BigDecimal estimatedContractorNetHigh;

  @Column(name = "assigned_contractor_user_id")
  private Long assignedContractorUserId;

  @Column(name = "preferred_contractor_user_id")
  private Long preferredContractorUserId;

  @Column(name = "active_proposal_id")
  private Long activeProposalId;

  @Column(name = "partner_code")
  private String partnerCode;

  @Column(name = "partner_id")
  private Long partnerId;

  @Column(name = "referral_source")
  private String referralSource;

  @Column(name = "referral_status")
  private String referralStatus;

  @Column(name = "referring_name")
  private String referringName;

  @Column(name = "referring_company")
  private String referringCompany;

  @Column(name = "referring_email")
  private String referringEmail;

  @Column(name = "referring_phone")
  private String referringPhone;

  @Column(name = "customer_partner_status_consent")
  private Boolean customerPartnerStatusConsent = false;

  @Column(name = "consent_timestamp")
  private OffsetDateTime consentTimestamp;

  @Column(name = "consent_version")
  private String consentVersion;

  @Column(name = "property_purpose")
  private String propertyPurpose;

  @Column(name = "transaction_stage")
  private String transactionStage;

  @Column(name = "listing_deadline")
  private String listingDeadline;

  @Column(name = "closing_deadline")
  private String closingDeadline;

  @Column(name = "inspection_report_url")
  private String inspectionReportUrl;

  @Column(name = "listing_reference_url")
  private String listingReferenceUrl;

  @Column(name = "property_opportunity_notes", columnDefinition = "TEXT")
  private String propertyOpportunityNotes;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "completion_report", columnDefinition = "jsonb")
  private JsonNode completionReport;

  @Column(name = "customer_confirmed_at")
  private OffsetDateTime customerConfirmedAt;

  @Column(name = "admin_notes", columnDefinition = "TEXT")
  private String adminNotes;

  @Column(name = "discount_code")
  private String discountCode;

  @Column(name = "discount_type")
  private String discountType;

  @Column(name = "discount_value")
  private BigDecimal discountValue;

  @Column(name = "discount_label")
  private String discountLabel;

  @Column(name = "discount_amount_low")
  private BigDecimal discountAmountLow;

  @Column(name = "discount_amount_high")
  private BigDecimal discountAmountHigh;

  @Column(name = "assessment_status")
  private String assessmentStatus;

  @Column(name = "assessment_error_code")
  private String assessmentErrorCode;

  @Column(name = "assessment_attempts")
  private Integer assessmentAttempts = 0;

  @Column(name = "assessment_started_at")
  private OffsetDateTime assessmentStartedAt;

  @Column(name = "assessment_completed_at")
  private OffsetDateTime assessmentCompletedAt;

  @Column(name = "diy_risk_level")
  private String diyRiskLevel = "green";

  @Column(name = "visit_fee_authorized")
  private Boolean visitFeeAuthorized = false;

  @Column(name = "visit_fee_captured")
  private Boolean visitFeeCaptured = false;

  @Column(name = "visit_fee_amount")
  private BigDecimal visitFeeAmount;

  @Column(name = "stripe_payment_intent_id")
  private String stripePaymentIntentId;

  @Column(name = "cancellation_reason")
  private String cancellationReason;

  @Column(name = "cancellation_reason_code")
  private String cancellationReasonCode;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "cancellation_details", columnDefinition = "jsonb")
  private JsonNode cancellationDetails;

  @Column(name = "cancelled_at")
  private OffsetDateTime cancelledAt;

  @Column(name = "cancelled_by")
  private String cancelledBy;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "checkout_snapshot", columnDefinition = "jsonb")
  private JsonNode checkoutSnapshot;

  @Column(name = "coupon_redeemed_at")
  private OffsetDateTime couponRedeemedAt;

  @Column(name = "service_fee_amount")
  private BigDecimal serviceFeeAmount;

  @Column(name = "service_amount")
  private BigDecimal serviceAmount;

  @Column(name = "coupon_discount_amount")
  private BigDecimal couponDiscountAmount;

  @Column(name = "final_customer_amount")
  private BigDecimal finalCustomerAmount;

  @Column(name = "authorized_amount_cents")
  private Integer authorizedAmountCents;

  @Column(name = "payment_completed_at")
  private OffsetDateTime paymentCompletedAt;

  @Column(name = "work_queue_status")
  private String workQueueStatus;

  @Column(name = "priority_tier")
  private String priorityTier = "standard";

  @Column(name = "estimate_confidence")
  private String estimateConfidence;

  @Column(name = "access_instructions", columnDefinition = "TEXT")
  private String accessInstructions;

  @Column(name = "assigned_employee_id")
  private Long assignedEmployeeId;

  @Column(name = "invite_deadline_at")
  private OffsetDateTime inviteDeadlineAt;

  @Column(name = "quote_request_mode")
  private String quoteRequestMode;

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
    if (jobMode == null) {
      jobMode = "managed";
    }
    if (country == null) {
      country = "US";
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

  public String getBookingId() {
    return bookingId;
  }

  public void setBookingId(String bookingId) {
    this.bookingId = bookingId;
  }

  public Long getHomeownerUserId() {
    return homeownerUserId;
  }

  public void setHomeownerUserId(Long homeownerUserId) {
    this.homeownerUserId = homeownerUserId;
  }

  public Long getPropertyId() {
    return propertyId;
  }

  public void setPropertyId(Long propertyId) {
    this.propertyId = propertyId;
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

  public JsonNode getAiAssessment() {
    return aiAssessment;
  }

  public void setAiAssessment(JsonNode aiAssessment) {
    this.aiAssessment = aiAssessment;
  }

  public JsonNode getPricing() {
    return pricing;
  }

  public void setPricing(JsonNode pricing) {
    this.pricing = pricing;
  }

  public Boolean getShowRetailPrice() {
    return showRetailPrice;
  }

  public void setShowRetailPrice(Boolean showRetailPrice) {
    this.showRetailPrice = showRetailPrice;
  }

  public BigDecimal getCustomerRetailEstimateLow() {
    return customerRetailEstimateLow;
  }

  public void setCustomerRetailEstimateLow(BigDecimal customerRetailEstimateLow) {
    this.customerRetailEstimateLow = customerRetailEstimateLow;
  }

  public BigDecimal getCustomerRetailEstimateHigh() {
    return customerRetailEstimateHigh;
  }

  public void setCustomerRetailEstimateHigh(BigDecimal customerRetailEstimateHigh) {
    this.customerRetailEstimateHigh = customerRetailEstimateHigh;
  }

  public BigDecimal getEstimatedContractorNetLow() {
    return estimatedContractorNetLow;
  }

  public void setEstimatedContractorNetLow(BigDecimal estimatedContractorNetLow) {
    this.estimatedContractorNetLow = estimatedContractorNetLow;
  }

  public BigDecimal getEstimatedContractorNetHigh() {
    return estimatedContractorNetHigh;
  }

  public void setEstimatedContractorNetHigh(BigDecimal estimatedContractorNetHigh) {
    this.estimatedContractorNetHigh = estimatedContractorNetHigh;
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

  public String getPartnerCode() {
    return partnerCode;
  }

  public void setPartnerCode(String partnerCode) {
    this.partnerCode = partnerCode;
  }

  public Long getPartnerId() {
    return partnerId;
  }

  public void setPartnerId(Long partnerId) {
    this.partnerId = partnerId;
  }

  public String getReferralSource() {
    return referralSource;
  }

  public void setReferralSource(String referralSource) {
    this.referralSource = referralSource;
  }

  public String getReferralStatus() {
    return referralStatus;
  }

  public void setReferralStatus(String referralStatus) {
    this.referralStatus = referralStatus;
  }

  public String getReferringName() {
    return referringName;
  }

  public void setReferringName(String referringName) {
    this.referringName = referringName;
  }

  public String getReferringCompany() {
    return referringCompany;
  }

  public void setReferringCompany(String referringCompany) {
    this.referringCompany = referringCompany;
  }

  public String getReferringEmail() {
    return referringEmail;
  }

  public void setReferringEmail(String referringEmail) {
    this.referringEmail = referringEmail;
  }

  public String getReferringPhone() {
    return referringPhone;
  }

  public void setReferringPhone(String referringPhone) {
    this.referringPhone = referringPhone;
  }

  public Boolean getCustomerPartnerStatusConsent() {
    return customerPartnerStatusConsent;
  }

  public void setCustomerPartnerStatusConsent(Boolean customerPartnerStatusConsent) {
    this.customerPartnerStatusConsent = customerPartnerStatusConsent;
  }

  public OffsetDateTime getConsentTimestamp() {
    return consentTimestamp;
  }

  public void setConsentTimestamp(OffsetDateTime consentTimestamp) {
    this.consentTimestamp = consentTimestamp;
  }

  public String getConsentVersion() {
    return consentVersion;
  }

  public void setConsentVersion(String consentVersion) {
    this.consentVersion = consentVersion;
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

  public String getListingDeadline() {
    return listingDeadline;
  }

  public void setListingDeadline(String listingDeadline) {
    this.listingDeadline = listingDeadline;
  }

  public String getClosingDeadline() {
    return closingDeadline;
  }

  public void setClosingDeadline(String closingDeadline) {
    this.closingDeadline = closingDeadline;
  }

  public String getInspectionReportUrl() {
    return inspectionReportUrl;
  }

  public void setInspectionReportUrl(String inspectionReportUrl) {
    this.inspectionReportUrl = inspectionReportUrl;
  }

  public String getListingReferenceUrl() {
    return listingReferenceUrl;
  }

  public void setListingReferenceUrl(String listingReferenceUrl) {
    this.listingReferenceUrl = listingReferenceUrl;
  }

  public String getPropertyOpportunityNotes() {
    return propertyOpportunityNotes;
  }

  public void setPropertyOpportunityNotes(String propertyOpportunityNotes) {
    this.propertyOpportunityNotes = propertyOpportunityNotes;
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

  public String getAdminNotes() {
    return adminNotes;
  }

  public void setAdminNotes(String adminNotes) {
    this.adminNotes = adminNotes;
  }

  public String getDiscountCode() {
    return discountCode;
  }

  public void setDiscountCode(String discountCode) {
    this.discountCode = discountCode;
  }

  public String getDiscountType() {
    return discountType;
  }

  public void setDiscountType(String discountType) {
    this.discountType = discountType;
  }

  public BigDecimal getDiscountValue() {
    return discountValue;
  }

  public void setDiscountValue(BigDecimal discountValue) {
    this.discountValue = discountValue;
  }

  public String getDiscountLabel() {
    return discountLabel;
  }

  public void setDiscountLabel(String discountLabel) {
    this.discountLabel = discountLabel;
  }

  public BigDecimal getDiscountAmountLow() {
    return discountAmountLow;
  }

  public void setDiscountAmountLow(BigDecimal discountAmountLow) {
    this.discountAmountLow = discountAmountLow;
  }

  public BigDecimal getDiscountAmountHigh() {
    return discountAmountHigh;
  }

  public void setDiscountAmountHigh(BigDecimal discountAmountHigh) {
    this.discountAmountHigh = discountAmountHigh;
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

  public Integer getAssessmentAttempts() {
    return assessmentAttempts;
  }

  public void setAssessmentAttempts(Integer assessmentAttempts) {
    this.assessmentAttempts = assessmentAttempts;
  }

  public OffsetDateTime getAssessmentStartedAt() {
    return assessmentStartedAt;
  }

  public void setAssessmentStartedAt(OffsetDateTime assessmentStartedAt) {
    this.assessmentStartedAt = assessmentStartedAt;
  }

  public OffsetDateTime getAssessmentCompletedAt() {
    return assessmentCompletedAt;
  }

  public void setAssessmentCompletedAt(OffsetDateTime assessmentCompletedAt) {
    this.assessmentCompletedAt = assessmentCompletedAt;
  }

  public String getDiyRiskLevel() {
    return diyRiskLevel;
  }

  public void setDiyRiskLevel(String diyRiskLevel) {
    this.diyRiskLevel = diyRiskLevel;
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

  public BigDecimal getVisitFeeAmount() {
    return visitFeeAmount;
  }

  public void setVisitFeeAmount(BigDecimal visitFeeAmount) {
    this.visitFeeAmount = visitFeeAmount;
  }

  public String getStripePaymentIntentId() {
    return stripePaymentIntentId;
  }

  public void setStripePaymentIntentId(String stripePaymentIntentId) {
    this.stripePaymentIntentId = stripePaymentIntentId;
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

  public JsonNode getCheckoutSnapshot() {
    return checkoutSnapshot;
  }

  public void setCheckoutSnapshot(JsonNode checkoutSnapshot) {
    this.checkoutSnapshot = checkoutSnapshot;
  }

  public OffsetDateTime getCouponRedeemedAt() {
    return couponRedeemedAt;
  }

  public void setCouponRedeemedAt(OffsetDateTime couponRedeemedAt) {
    this.couponRedeemedAt = couponRedeemedAt;
  }

  public BigDecimal getServiceFeeAmount() {
    return serviceFeeAmount;
  }

  public void setServiceFeeAmount(BigDecimal serviceFeeAmount) {
    this.serviceFeeAmount = serviceFeeAmount;
  }

  public BigDecimal getServiceAmount() {
    return serviceAmount;
  }

  public void setServiceAmount(BigDecimal serviceAmount) {
    this.serviceAmount = serviceAmount;
  }

  public BigDecimal getCouponDiscountAmount() {
    return couponDiscountAmount;
  }

  public void setCouponDiscountAmount(BigDecimal couponDiscountAmount) {
    this.couponDiscountAmount = couponDiscountAmount;
  }

  public BigDecimal getFinalCustomerAmount() {
    return finalCustomerAmount;
  }

  public void setFinalCustomerAmount(BigDecimal finalCustomerAmount) {
    this.finalCustomerAmount = finalCustomerAmount;
  }

  public Integer getAuthorizedAmountCents() {
    return authorizedAmountCents;
  }

  public void setAuthorizedAmountCents(Integer authorizedAmountCents) {
    this.authorizedAmountCents = authorizedAmountCents;
  }

  public OffsetDateTime getPaymentCompletedAt() {
    return paymentCompletedAt;
  }

  public void setPaymentCompletedAt(OffsetDateTime paymentCompletedAt) {
    this.paymentCompletedAt = paymentCompletedAt;
  }

  public String getWorkQueueStatus() {
    return workQueueStatus;
  }

  public void setWorkQueueStatus(String workQueueStatus) {
    this.workQueueStatus = workQueueStatus;
  }

  public String getPriorityTier() {
    return priorityTier;
  }

  public void setPriorityTier(String priorityTier) {
    this.priorityTier = priorityTier;
  }

  public String getEstimateConfidence() {
    return estimateConfidence;
  }

  public void setEstimateConfidence(String estimateConfidence) {
    this.estimateConfidence = estimateConfidence;
  }

  public String getAccessInstructions() {
    return accessInstructions;
  }

  public void setAccessInstructions(String accessInstructions) {
    this.accessInstructions = accessInstructions;
  }

  public Long getAssignedEmployeeId() {
    return assignedEmployeeId;
  }

  public void setAssignedEmployeeId(Long assignedEmployeeId) {
    this.assignedEmployeeId = assignedEmployeeId;
  }

  public OffsetDateTime getInviteDeadlineAt() {
    return inviteDeadlineAt;
  }

  public void setInviteDeadlineAt(OffsetDateTime inviteDeadlineAt) {
    this.inviteDeadlineAt = inviteDeadlineAt;
  }

  public String getQuoteRequestMode() {
    return quoteRequestMode;
  }

  public void setQuoteRequestMode(String quoteRequestMode) {
    this.quoteRequestMode = quoteRequestMode;
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
