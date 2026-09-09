package com.fixbridge.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.util.Map;
import org.junit.jupiter.api.Test;

class DiscountMathTest {

  @Test
  void percentCouponRoundsLikeLegacy() {
    Map<String, Object> result =
        DiscountMath.applyDiscountToAmount(
            new BigDecimal("95.00"), "percent", new BigDecimal("10"), null, null);
    assertEquals(new BigDecimal("10.00"), result.get("discountAmount"));
    assertEquals(new BigDecimal("85.00"), result.get("retail"));
  }

  @Test
  void amountCouponCapsAtBase() {
    Map<String, Object> result =
        DiscountMath.applyDiscountToAmount(
            new BigDecimal("40.00"), "amount", new BigDecimal("100"), null, null);
    assertEquals(new BigDecimal("40.00"), result.get("discountAmount"));
    assertEquals(new BigDecimal("0.00"), result.get("retail"));
  }

  @Test
  void normalizeExtractsPromoQuery() {
    assertEquals("SAVE20", DiscountMath.normalizeDiscountCode("https://app.example/?promo=save20"));
    assertEquals("WELCOME", DiscountMath.normalizeDiscountCode("welcome!!!"));
  }

  @Test
  void minPurchaseRejectsDiscount() {
    Map<String, Object> result =
        DiscountMath.applyDiscountToAmount(
            new BigDecimal("20.00"),
            "percent",
            new BigDecimal("50"),
            new BigDecimal("50.00"),
            null);
    assertEquals("min_purchase", result.get("rejected"));
    assertEquals(new BigDecimal("0.00"), result.get("discountAmount"));
    assertEquals(new BigDecimal("20.00"), result.get("retail"));
  }
}
