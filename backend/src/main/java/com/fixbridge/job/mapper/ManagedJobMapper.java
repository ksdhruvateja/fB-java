package com.fixbridge.job.mapper;

import com.fixbridge.job.dto.response.ManagedJobDto;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.security.principal.UserPrincipal;
import java.math.BigDecimal;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class ManagedJobMapper {

  private static final Set<String> ADDRESS_UNLOCKED = Set.of(
      "scheduled",
      "contractor_en_route",
      "work_started",
      "change_order_pending",
      "work_completed",
      "customer_review_pending",
      "admin_review_pending",
      "payout_pending",
      "paid_out",
      "closed");

  public ManagedJobDto toDto(ManagedJobEntity job, UserPrincipal viewer) {
    if (job == null) {
      return null;
    }
    boolean isAdmin = viewer != null && "admin".equals(viewer.getRole());
    boolean isOwner =
        viewer != null
            && viewer.getId() != null
            && viewer.getId().equals(job.getHomeownerUserId());
    boolean isAssigned =
        viewer != null
            && viewer.getId() != null
            && job.getAssignedContractorUserId() != null
            && viewer.getId().equals(job.getAssignedContractorUserId());
    boolean addressUnlocked = ADDRESS_UNLOCKED.contains(String.valueOf(job.getStatus()).toLowerCase(Locale.ROOT));

    ManagedJobDto dto = new ManagedJobDto();
    dto.setId(job.getId());
    dto.setBookingId(job.getBookingId());
    dto.setJobMode(job.getJobMode() != null ? job.getJobMode() : "managed");
    dto.setStatus(job.getStatus());
    dto.setCategory(job.getCategory());
    dto.setServiceSubcategory(job.getServiceSubcategory());
    dto.setTitle(job.getTitle());
    dto.setDescription(job.getDescription());
    dto.setMediaDataUrl(job.getMediaDataUrl());
    dto.setMediaType(job.getMediaType());
    dto.setPreferredDate(job.getPreferredDate());
    dto.setPreferredTimeSlot(job.getPreferredTimeSlot());
    dto.setServiceTiming(job.getServiceTiming());
    dto.setPropertyId(job.getPropertyId());
    dto.setPriorityTier(job.getPriorityTier() != null ? job.getPriorityTier() : "standard");
    dto.setAiAssessment(job.getAiAssessment());
    dto.setAssessmentStatus(resolveAssessmentStatus(job));
    dto.setAssessmentErrorCode(job.getAssessmentErrorCode());
    dto.setShowRetailPrice(job.getShowRetailPrice() == null || job.getShowRetailPrice());
    dto.setPreferredTimeNote("Preferred service time — not confirmed until a contractor is scheduled.");
    dto.setPartnerCode(job.getPartnerCode());
    dto.setPropertyPurpose(job.getPropertyPurpose());
    dto.setTransactionStage(job.getTransactionStage());
    dto.setCompletionReport(job.getCompletionReport());
    dto.setCustomerConfirmedAt(job.getCustomerConfirmedAt());
    dto.setCreatedAt(job.getCreatedAt());
    dto.setUpdatedAt(job.getUpdatedAt());
    dto.setAssignedContractorUserId(job.getAssignedContractorUserId());
    dto.setPreferredContractorUserId(job.getPreferredContractorUserId());
    dto.setActiveProposalId(job.getActiveProposalId());
    dto.setPricing(job.getPricing());
    dto.setWorkQueueStatus(job.getWorkQueueStatus());
    dto.setEstimateConfidence(job.getEstimateConfidence());

    if (isAdmin || isOwner || isAssigned) {
      dto.setCityStateZip(job.getCityStateZip());
    } else {
      dto.setCityStateZip(maskArea(job.getCityStateZip()));
    }

    if (isAdmin || isOwner || (isAssigned && addressUnlocked)) {
      dto.setFullAddress(job.getFullAddress());
      dto.setContactName(job.getContactName());
      dto.setContactPhone(job.getContactPhone());
      dto.setStreetAddress(job.getStreetAddress());
      dto.setZip(job.getZip());
      dto.setCountry(job.getCountry());
    }

    if (isAdmin || isOwner || isAssigned || (viewer != null && "contractor".equals(viewer.getRole()))) {
      dto.setCity(job.getCity());
      dto.setState(job.getState());
    }

    if (isAdmin) {
      dto.setHomeownerUserId(job.getHomeownerUserId());
    }

    if (isOwner || isAdmin) {
      dto.setCustomerRetailEstimateLow(toDouble(job.getCustomerRetailEstimateLow()));
      dto.setCustomerRetailEstimateHigh(toDouble(job.getCustomerRetailEstimateHigh()));
      dto.setEstimatedContractorNetLow(toDouble(job.getEstimatedContractorNetLow()));
      dto.setEstimatedContractorNetHigh(toDouble(job.getEstimatedContractorNetHigh()));
      dto.setVisitFeeAuthorized(Boolean.TRUE.equals(job.getVisitFeeAuthorized()));
      dto.setVisitFeeCaptured(Boolean.TRUE.equals(job.getVisitFeeCaptured()));
      dto.setVisitFeeAmount(toDouble(job.getVisitFeeAmount()));
      dto.setDiyRiskLevel(job.getDiyRiskLevel() != null ? job.getDiyRiskLevel() : "green");
      dto.setDiscountCode(job.getDiscountCode());
      dto.setDiscountLabel(job.getDiscountLabel());
      dto.setDiscountType(job.getDiscountType());
      dto.setDiscountValue(toDouble(job.getDiscountValue()));
      dto.setDiscountAmountLow(toDouble(job.getDiscountAmountLow()));
      dto.setDiscountAmountHigh(toDouble(job.getDiscountAmountHigh()));
      dto.setServiceFeeAmount(toDouble(job.getServiceFeeAmount()));
      dto.setServiceAmount(toDouble(job.getServiceAmount()));
      dto.setCouponDiscountAmount(toDouble(job.getCouponDiscountAmount()));
      dto.setFinalCustomerAmount(toDouble(job.getFinalCustomerAmount()));
      dto.setPaymentCompletedAt(job.getPaymentCompletedAt());
      dto.setCheckoutSnapshot(job.getCheckoutSnapshot());
      dto.setCancellationReason(job.getCancellationReason());
      dto.setCancellationReasonCode(job.getCancellationReasonCode());
      dto.setCancellationDetails(job.getCancellationDetails());
      dto.setCancelledAt(job.getCancelledAt());
      dto.setCancelledBy(job.getCancelledBy());
      dto.setHomeownerStatusLabel(job.getStatus());
      dto.setPricingDisclaimer(
          "Estimated service range includes coordination, administration, payment handling and subcontracted delivery.");
      if (job.getDiscountCode() != null && job.getDiscountType() != null) {
        if ("amount".equals(job.getDiscountType())) {
          dto.setDiscountSummary("$" + Math.round(toDouble(job.getDiscountValue()) != null ? toDouble(job.getDiscountValue()) : 0) + " off");
        } else {
          dto.setDiscountSummary(Math.round(toDouble(job.getDiscountValue()) != null ? toDouble(job.getDiscountValue()) : 0) + "% off");
        }
      }
    }

    return dto;
  }

  private static String resolveAssessmentStatus(ManagedJobEntity job) {
    if (job.getAssessmentStatus() != null && !job.getAssessmentStatus().isBlank()) {
      return job.getAssessmentStatus();
    }
    if (job.getAiAssessment() != null && !job.getAiAssessment().isNull()) {
      return "ready";
    }
    return "pending";
  }

  private static String maskArea(String cityStateZip) {
    if (cityStateZip == null || cityStateZip.isBlank()) {
      return null;
    }
    String[] parts = cityStateZip.split(",");
    if (parts.length >= 2) {
      return parts[0].trim() + ", " + parts[1].trim();
    }
    return cityStateZip;
  }

  private static Double toDouble(BigDecimal value) {
    return value == null ? null : value.doubleValue();
  }
}
