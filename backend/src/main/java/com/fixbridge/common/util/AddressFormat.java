package com.fixbridge.common.util;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.util.StringUtils;

/** Local address format helpers — no external verification. */
public final class AddressFormat {

  private AddressFormat() {}

  public static String zip5(Object value) {
    String digits = String.valueOf(value == null ? "" : value).replaceAll("\\D", "");
    return digits.length() >= 5 ? digits.substring(0, 5) : "";
  }

  public static String zipPlus4(Object value) {
    String digits = String.valueOf(value == null ? "" : value).replaceAll("\\D", "");
    if (digits.length() == 4 && !StringUtils.hasText(zip5(value))) {
      return digits;
    }
    if (digits.length() >= 9) {
      return digits.substring(5, 9);
    }
    return "";
  }

  public static Map<String, Object> validateAddressFormat(Map<String, Object> input) {
    Map<String, Object> body = input == null ? Map.of() : input;
    String addressLine1 =
        first(body, "addressLine1", "streetAddress");
    String city = first(body, "city");
    String state = first(body, "state").toUpperCase(Locale.ROOT);
    String zipRaw = first(body, "zip", "ZIPCode");
    String zip = zip5(zipRaw);

    List<String> missing = new ArrayList<>();
    if (!StringUtils.hasText(addressLine1)) {
      missing.add("addressLine1");
    }
    if (!StringUtils.hasText(city)) {
      missing.add("city");
    }
    if (!StringUtils.hasText(state) || state.length() != 2) {
      missing.add("state");
    }
    if (!StringUtils.hasText(zip) || zip.length() != 5) {
      missing.add("zip");
    }

    Map<String, Object> result = new LinkedHashMap<>();
    if (!missing.isEmpty()) {
      result.put("ok", false);
      result.put("code", "INVALID_ADDRESS_FORMAT");
      result.put("message", "Please check the address and ZIP code.");
      result.put("missing", missing);
      return result;
    }

    Map<String, Object> address = new LinkedHashMap<>();
    address.put("addressLine1", addressLine1);
    String line2 = first(body, "addressLine2", "secondaryAddress");
    address.put("addressLine2", StringUtils.hasText(line2) ? line2 : null);
    address.put("city", city);
    address.put("state", state);
    address.put("zip", zip);
    String plus4 = zipPlus4(zipRaw);
    address.put("postalCodePlus4", StringUtils.hasText(plus4) ? plus4 : null);

    result.put("ok", true);
    result.put("address", address);
    return result;
  }

  private static String first(Map<String, Object> body, String... keys) {
    for (String key : keys) {
      Object v = body.get(key);
      if (v != null && StringUtils.hasText(String.valueOf(v))) {
        return String.valueOf(v).trim();
      }
    }
    return "";
  }
}
