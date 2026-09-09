package com.fixbridge.integration.geoapify;

import com.fixbridge.common.util.AddressFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class ServiceAreaService {

  public Map<String, Object> checkZip(String zipRaw) {
    String z = AddressFormat.zip5(zipRaw);
    Map<String, Object> body = new LinkedHashMap<>();
    if (!z.matches("\\d{5}")) {
      body.put("ok", false);
      body.put("covered", false);
      body.put("message", "Enter a valid 5-digit ZIP code.");
      return body;
    }
    String market = zipMarketLabel(z);
    boolean nationwide = "National baseline".equals(market);
    body.put("ok", true);
    body.put("covered", true);
    body.put("zip", z);
    body.put("market", market);
    body.put("message", nationwide ? "Service available nationwide." : "We serve the " + market + ".");
    return body;
  }

  /** Port of api/pricing.js getZipMarketLabel (label only). */
  static String zipMarketLabel(String zip) {
    String z = zip == null ? "" : zip.trim();
    if (z.matches("^(100|101|102|103|104|110|111|112|113|114|116).*")) {
      return "New York City metro";
    }
    if (z.matches("^(115|117|118|119).*")) {
      return "Long Island, NY";
    }
    if (z.matches("^(070|071|072|073|074|076|077|078|079).*")) {
      return "Northern New Jersey metro";
    }
    if (z.matches("^(068|069).*")) {
      return "Fairfield County, CT";
    }
    if (z.matches("^(940|941|942|943|944|945|946).*")) {
      return "San Francisco Bay Area";
    }
    if (z.matches("^(900|901|902|903|904|905).*")) {
      return "Los Angeles metro";
    }
    if (z.matches("^(606|607|608).*")) {
      return "Chicago metro";
    }
    if (z.matches("^(331|332|333).*")) {
      return "Miami metro";
    }
    if (z.matches("^(750|751|752).*")) {
      return "Dallas–Fort Worth metro";
    }
    if (z.matches("^(770|771|772).*")) {
      return "Houston metro";
    }
    Double factor = locationFactor(z);
    if (factor != null && factor != 1.0) {
      return "Regional metro";
    }
    return "National baseline";
  }

  private static Double locationFactor(String z) {
    if (z.matches("^(100|101|102|103|104|110|111|112|113|114|116).*")) {
      return 1.25;
    }
    if (z.matches("^(115|117|118|119).*")) {
      return 1.22;
    }
    if (z.matches("^(940|941|942|943|944|945|946).*")) {
      return 1.30;
    }
    if (z.matches("^(900|901|902|903|904|905).*")) {
      return 1.20;
    }
    if (z.matches("^(606|607|608).*")) {
      return 1.15;
    }
    if (z.matches("^(331|332|333).*")) {
      return 1.12;
    }
    if (z.matches("^(750|751|752|770|771|772).*")) {
      return 1.05;
    }
    if (z.matches("^(070|071|072|073|074|076|077|078|079).*")) {
      return 1.18;
    }
    if (z.matches("^(068|069).*")) {
      return 1.16;
    }
    return 1.0;
  }
}
