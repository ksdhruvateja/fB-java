package com.fixbridge.compliance.enums;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Document type catalog + status constants (mirrors api/contractor-compliance-shared.js). */
public final class ComplianceConstants {

  public static final String COI_CERTIFICATE_HOLDER = "Liora Creations, Corp. d/b/a FixBridge";
  public static final String COI_LEGAL_NOTICE_ADDRESS = "131 Continental Dr, Suite 305, Newark, DE 19713";

  public static final String REQUIRED = "REQUIRED";
  public static final String OPTIONAL = "OPTIONAL";
  public static final String NOT_APPLICABLE = "NOT_APPLICABLE";

  public static final String MISSING = "MISSING";
  public static final String UPLOADED = "UPLOADED";
  public static final String UNDER_REVIEW = "UNDER_REVIEW";
  public static final String VERIFIED = "VERIFIED";
  public static final String REJECTED = "REJECTED";
  public static final String EXPIRED = "EXPIRED";

  public static final String LEVEL_1 = "level_1";
  public static final String LEVEL_2 = "level_2";

  public static final String GREEN = "GREEN";
  public static final String YELLOW = "YELLOW";
  public static final String RED = "RED";

  public static final Set<String> BLOCKING = Set.of(MISSING, EXPIRED, REJECTED);
  public static final Set<String> REVIEW = Set.of(UPLOADED, UNDER_REVIEW);

  public static final List<String> DOCUMENT_TYPE_CODES =
      List.of(
          "W9",
          "TRADE_LICENSE",
          "GENERAL_LIABILITY_COI",
          "AI_ONGOING_OPS",
          "AI_COMPLETED_OPS",
          "PRIMARY_NON_CONTRIBUTORY",
          "GL_WAIVER_SUBROGATION",
          "WORKERS_COMP",
          "WC_WAIVER_SUBROGATION",
          "COMMERCIAL_AUTO",
          "UMBRELLA_EXCESS",
          "SOLO_OWNER_ACK");

  public static final Map<String, Map<String, Object>> DOCUMENT_TYPES = buildTypes();

  private static Map<String, Map<String, Object>> buildTypes() {
    Map<String, Map<String, Object>> map = new LinkedHashMap<>();
    put(map, "W9", "W-9", "tax", false);
    put(map, "TRADE_LICENSE", "Business / Home Improvement / Trade License", "license", true);
    put(map, "GENERAL_LIABILITY_COI", "Certificate of Insurance (COI)", "insurance", true);
    put(map, "AI_ONGOING_OPS", "Additional Insured Endorsement — ongoing operations", "insurance", true);
    put(map, "AI_COMPLETED_OPS", "Additional Insured Endorsement — completed operations", "insurance", true);
    put(map, "PRIMARY_NON_CONTRIBUTORY", "Primary & Non-Contributory Endorsement", "insurance", true);
    put(map, "GL_WAIVER_SUBROGATION", "Waiver of Subrogation — General Liability", "insurance", true);
    put(map, "WORKERS_COMP", "Workers' Compensation proof", "insurance", true);
    put(map, "WC_WAIVER_SUBROGATION", "Workers' Compensation Waiver of Subrogation", "insurance", true);
    put(map, "COMMERCIAL_AUTO", "Commercial Auto proof", "insurance", true);
    put(map, "UMBRELLA_EXCESS", "Umbrella / Excess coverage", "insurance", true);
    put(map, "SOLO_OWNER_ACK", "Solo Owner / No Employees Acknowledgment", "acknowledgment", false);
    return map;
  }

  private static void put(
      Map<String, Map<String, Object>> map, String code, String label, String category, boolean hasExpiration) {
    Map<String, Object> meta = new LinkedHashMap<>();
    meta.put("code", code);
    meta.put("label", label);
    meta.put("category", category);
    meta.put("hasExpiration", hasExpiration);
    map.put(code, meta);
  }

  private ComplianceConstants() {}
}
