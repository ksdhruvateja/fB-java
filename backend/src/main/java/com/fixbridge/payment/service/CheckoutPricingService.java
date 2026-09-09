package com.fixbridge.payment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.common.util.MoneyUtil;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.fixbridge.common.util.DiscountMath;
/**
 * Server-authoritative professional dispatch checkout snapshot.
 * Port of default lines from api/professional-dispatch-pricing.js (cents internally).
 */
@Component
public class CheckoutPricingService {

  private static final List<LineDef> DEFAULT_LINES =
      List.of(
          new LineDef("assessment_coordination", "FixBridge Assessment / Coordination", 14900, "charge"),
          new LineDef("visit_diagnostic", "Contractor Visit / Diagnostic", 9500, "charge"),
          new LineDef("beta_discount", "Beta Discount", 14900, "discount"));

  private final ObjectMapper objectMapper;

  public CheckoutPricingService(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public ObjectNode buildCheckoutBreakdown(ManagedJobEntity job) {
    long chargesCents = 0;
    long lineDiscountCents = 0;
    ArrayNode lines = objectMapper.createArrayNode();

    for (LineDef line : DEFAULT_LINES) {
      ObjectNode row = objectMapper.createObjectNode();
      row.put("key", line.key());
      row.put("label", line.label());
      row.put("line_type", line.lineType());
      if ("discount".equals(line.lineType())) {
        lineDiscountCents += line.amountCents();
        row.put("amount_cents", -line.amountCents());
      } else {
        chargesCents += line.amountCents();
        row.put("amount_cents", line.amountCents());
      }
      lines.add(row);
    }

    long pricingLineSumCents = chargesCents - lineDiscountCents;

    long couponDiscountCents = 0;
    String couponCode = null;
    String couponLabel = null;
    if (StringUtils.hasText(job.getDiscountCode()) && job.getDiscountValue() != null) {
      couponCode = job.getDiscountCode();
      couponLabel = job.getDiscountLabel();
      BigDecimal baseDollars = MoneyUtil.centsToDollars(pricingLineSumCents);
      BigDecimal discountDollars = applyJobDiscount(baseDollars, job);
      couponDiscountCents = MoneyUtil.dollarsToCents(discountDollars);
      if (couponDiscountCents > pricingLineSumCents) {
        couponDiscountCents = pricingLineSumCents;
      }
    }

    long authorizedNowCents = pricingLineSumCents - couponDiscountCents;
    BigDecimal serviceFee = MoneyUtil.centsToDollars(pricingLineSumCents);
    BigDecimal couponDiscount = MoneyUtil.centsToDollars(couponDiscountCents);
    BigDecimal finalAmount = MoneyUtil.centsToDollars(authorizedNowCents);

    BigDecimal estLow = job.getCustomerRetailEstimateLow();
    BigDecimal estHigh = job.getCustomerRetailEstimateHigh();
    BigDecimal serviceAmount = null;
    if (estLow != null && estHigh != null) {
      serviceAmount =
          estLow.add(estHigh).divide(BigDecimal.valueOf(2), 2, RoundingMode.HALF_UP);
    } else if (estLow != null) {
      serviceAmount = MoneyUtil.dollars(estLow);
    } else if (estHigh != null) {
      serviceAmount = MoneyUtil.dollars(estHigh);
    }

    ObjectNode breakdown = objectMapper.createObjectNode();
    breakdown.put("ok", true);
    breakdown.set("lines", lines);
    breakdown.put("chargesCents", chargesCents);
    breakdown.put("lineDiscountCents", lineDiscountCents);
    breakdown.put("subtotalCents", chargesCents);
    breakdown.put("discountCents", lineDiscountCents + couponDiscountCents);
    breakdown.put("pricingLineSumCents", pricingLineSumCents);
    breakdown.put("couponDiscountCents", couponDiscountCents);
    if (couponCode != null) {
      breakdown.put("couponCode", couponCode);
    } else {
      breakdown.putNull("couponCode");
    }
    if (couponLabel != null) {
      breakdown.put("couponLabel", couponLabel);
    } else {
      breakdown.putNull("couponLabel");
    }
    breakdown.put("authorizedNowCents", authorizedNowCents);
    breakdown.put("authorizedNow", finalAmount);
    breakdown.put("currency", "usd");
    breakdown.put("pricingVersion", "1");
    breakdown.putNull("pricingEffectiveFrom");
    breakdown.put("repairWorkIncluded", false);
    breakdown.put(
        "repairWorkNote",
        "Any repair or additional work will require a separate estimate/quote and your approval before work proceeds.");
    breakdown.put("serviceFee", serviceFee);
    breakdown.put("couponDiscount", couponDiscount);
    breakdown.put("finalAmount", finalAmount);
    if (serviceAmount != null) {
      breakdown.put("serviceAmount", serviceAmount);
    } else {
      breakdown.putNull("serviceAmount");
    }
    if (estLow != null) {
      breakdown.put("serviceAmountLow", estLow);
    } else {
      breakdown.putNull("serviceAmountLow");
    }
    if (estHigh != null) {
      breakdown.put("serviceAmountHigh", estHigh);
    } else {
      breakdown.putNull("serviceAmountHigh");
    }
    if (job.getHomeownerUserId() != null) {
      breakdown.put("customerId", job.getHomeownerUserId());
    } else {
      breakdown.putNull("customerId");
    }
    if (job.getPropertyId() != null) {
      breakdown.put("propertyId", job.getPropertyId());
    } else {
      breakdown.putNull("propertyId");
    }
    if (job.getId() != null) {
      breakdown.put("serviceRequestId", job.getId());
    }
    String bookingId =
        StringUtils.hasText(job.getBookingId())
            ? job.getBookingId()
            : (job.getId() != null ? "FB-" + job.getId() : null);
    breakdown.put("bookingId", bookingId);
    breakdown.put(
        "serviceTitle",
        StringUtils.hasText(job.getTitle())
            ? job.getTitle()
            : (StringUtils.hasText(job.getCategory()) ? job.getCategory() : "Service request"));
    breakdown.put("serviceCategory", job.getCategory());
    breakdown.put("preferredDate", job.getPreferredDate());
    breakdown.put("preferredTimeSlot", job.getPreferredTimeSlot());
    breakdown.put("serviceTiming", job.getServiceTiming());
    String address =
        StringUtils.hasText(job.getFullAddress())
            ? job.getFullAddress()
            : job.getCityStateZip();
    breakdown.put("address", address);
    breakdown.put("createdAt", OffsetDateTime.now().toString());
    return breakdown;
  }

  private static BigDecimal applyJobDiscount(BigDecimal base, ManagedJobEntity job) {
    BigDecimal value = job.getDiscountValue();
    if (value == null) {
      return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    }
    String type = job.getDiscountType() == null ? "fixed" : job.getDiscountType().toLowerCase();
    Map<String, Object> applied =
        com.fixbridge.common.util.DiscountMath.applyDiscountToAmount(base, type, value, null, null);
    return MoneyUtil.dollars((BigDecimal) applied.get("discountAmount"));
  }

  private record LineDef(String key, String label, long amountCents, String lineType) {}
}
