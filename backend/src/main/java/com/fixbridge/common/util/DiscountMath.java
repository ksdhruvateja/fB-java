package com.fixbridge.common.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/** Pure coupon math — port of api/discounts.js applyDiscountToAmount / normalize. */
public final class DiscountMath {

  private DiscountMath() {}

  public static String normalizeDiscountCode(String raw) {
    if (raw == null) {
      return "";
    }
    String trimmed = raw.trim();
    if (trimmed.isEmpty()) {
      return "";
    }
    try {
      if (trimmed.contains("://") || trimmed.contains("?")) {
        java.net.URI uri =
            trimmed.contains("://")
                ? java.net.URI.create(trimmed)
                : java.net.URI.create("https://local.invalid" + (trimmed.startsWith("?") ? trimmed : "?" + trimmed));
        String query = uri.getRawQuery();
        if (query != null) {
          for (String part : query.split("&")) {
            String[] kv = part.split("=", 2);
            if (kv.length == 2
                && ("discount".equalsIgnoreCase(kv[0]) || "promo".equalsIgnoreCase(kv[0]))) {
              return sanitizeCode(java.net.URLDecoder.decode(kv[1], java.nio.charset.StandardCharsets.UTF_8));
            }
          }
        }
      }
    } catch (Exception ignored) {
      // fall through
    }
    java.util.regex.Matcher m =
        java.util.regex.Pattern.compile("[?&](?:discount|promo)=([A-Za-z0-9_-]+)", java.util.regex.Pattern.CASE_INSENSITIVE)
            .matcher(trimmed);
    if (m.find()) {
      return sanitizeCode(m.group(1));
    }
    return sanitizeCode(trimmed);
  }

  private static String sanitizeCode(String value) {
    return value.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9_-]", "");
  }

  /**
   * Apply discount to a retail amount in dollars.
   * Returns map with retail, discountAmount, and optional rejected.
   */
  public static Map<String, Object> applyDiscountToAmount(
      BigDecimal retail, String discountType, BigDecimal value, BigDecimal minPurchase, BigDecimal maxDiscount) {
    BigDecimal base = MoneyUtil.dollars(retail).max(BigDecimal.ZERO);
    Map<String, Object> out = new LinkedHashMap<>();
    if (value == null || value.compareTo(BigDecimal.ZERO) <= 0) {
      out.put("retail", base);
      out.put("discountAmount", BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
      return out;
    }
    if (minPurchase != null && base.compareTo(MoneyUtil.dollars(minPurchase)) < 0) {
      out.put("retail", base);
      out.put("discountAmount", BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
      out.put("rejected", "min_purchase");
      return out;
    }

    String type = discountType == null ? "percent" : discountType.toLowerCase(Locale.ROOT);
    BigDecimal off;
    if ("amount".equals(type) || "fixed".equals(type)) {
      off = MoneyUtil.dollars(value).min(base);
    } else {
      // Match Node: Math.round(base * value / 100) on dollars (nearest dollar), then 2-decimal polish.
      double raw = base.doubleValue() * value.doubleValue() / 100.0;
      off = BigDecimal.valueOf(Math.round(raw)).setScale(2, RoundingMode.HALF_UP);
    }
    if (maxDiscount != null) {
      off = off.min(MoneyUtil.dollars(maxDiscount).max(BigDecimal.ZERO));
    }
    off = off.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    BigDecimal retailOut = base.subtract(off).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    out.put("retail", retailOut);
    out.put("discountAmount", off);
    return out;
  }
}
