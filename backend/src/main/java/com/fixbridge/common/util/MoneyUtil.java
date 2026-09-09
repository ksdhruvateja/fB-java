package com.fixbridge.common.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Money helpers — BigDecimal only; never use double for amounts. */
public final class MoneyUtil {

  private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

  private MoneyUtil() {}

  public static BigDecimal centsToDollars(long cents) {
    return BigDecimal.valueOf(cents).divide(HUNDRED, 2, RoundingMode.HALF_UP);
  }

  public static long dollarsToCents(BigDecimal dollars) {
    if (dollars == null) {
      return 0L;
    }
    return dollars.multiply(HUNDRED).setScale(0, RoundingMode.HALF_UP).longValue();
  }

  public static BigDecimal dollars(BigDecimal value) {
    if (value == null) {
      return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    }
    return value.setScale(2, RoundingMode.HALF_UP);
  }
}
