package com.fixbridge.quote.mapper;

import com.fixbridge.quote.entity.ProposalEntity;
import com.fixbridge.security.principal.UserPrincipal;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class ProposalMapper {

  public Map<String, Object> toDto(ProposalEntity row, UserPrincipal viewer) {
    if (row == null) {
      return null;
    }
    boolean isAdmin = viewer != null && "admin".equals(viewer.getRole());
    boolean isCustomer = viewer != null && "homeowner".equals(viewer.getRole());

    Map<String, Object> base = new LinkedHashMap<>();
    base.put("id", row.getId());
    base.put(
        "quoteNumber",
        row.getQuoteNumber() != null
            ? row.getQuoteNumber()
            : "FBQ-" + String.format("%05d", row.getId()));
    base.put("jobId", row.getJobId());
    base.put("scopeSummary", row.getScopeSummary());
    base.put("retailAmount", toNumber(row.getRetailAmount()));
    base.put("depositAmount", toNumber(row.getDepositAmount()));
    base.put("timeline", row.getTimeline());
    base.put("warranty", row.getWarranty());
    base.put("exclusions", row.getExclusions());
    base.put("status", row.getStatus());
    base.put("publishedAt", row.getPublishedAt());
    base.put("approvedAt", row.getApprovedAt());
    base.put("createdAt", row.getCreatedAt());

    if (isAdmin) {
      base.put("contractorNet", toNumber(row.getContractorNet()));
      base.put("platformGross", toNumber(row.getPlatformGross()));
      base.put("processingCost", toNumber(row.getProcessingCost()));
      base.put("bidId", row.getBidId());
      base.put("lineItems", row.getLineItems());
      base.put("pricingAdjustments", row.getPricingAdjustments());
      base.put("adminDiscount", toNumber(row.getAdminDiscount()));
      base.put("adminDiscountReason", row.getAdminDiscountReason());
      base.put("couponCode", row.getCouponCode());
      base.put("quoteValidUntil", row.getQuoteValidUntil());
      base.put("customerLineItems", row.getCustomerLineItems());
      base.put("serviceCharge", toNumber(row.getServiceCharge()));
      base.put("shippingAmount", toNumber(row.getShippingAmount()));
      base.put("quoteOptionLabel", row.getQuoteOptionLabel());
      base.put("quoteOptionTitle", row.getQuoteOptionTitle());
      base.put("optionGroup", row.getOptionGroup());
      base.put(
          "optionSelectionStatus",
          row.getOptionSelectionStatus() != null ? row.getOptionSelectionStatus() : "pending");
      base.put("versionNumber", row.getVersionNumber() != null ? row.getVersionNumber() : 1);
      base.put(
          "contractorQuoteAmount",
          toNumber(
              row.getContractorQuoteAmount() != null
                  ? row.getContractorQuoteAmount()
                  : row.getContractorNet()));
    }

    if (isCustomer) {
      base.put("customerLineItems", row.getCustomerLineItems());
      base.put("quoteValidUntil", row.getQuoteValidUntil());
      base.put("couponCode", row.getCouponCode());
      base.put("quoteOptionLabel", row.getQuoteOptionLabel());
      base.put("quoteOptionTitle", row.getQuoteOptionTitle());
      base.put("optionGroup", row.getOptionGroup());
      base.put(
          "optionSelectionStatus",
          row.getOptionSelectionStatus() != null ? row.getOptionSelectionStatus() : "pending");
      base.put("versionNumber", row.getVersionNumber() != null ? row.getVersionNumber() : 1);
    }

    if (!isAdmin && !isCustomer) {
      base.remove("retailAmount");
      base.remove("depositAmount");
    }

    return base;
  }

  private static Double toNumber(BigDecimal value) {
    return value == null ? null : value.doubleValue();
  }
}
