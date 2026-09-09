package com.fixbridge.security.authorization;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Server-side admin RBAC — mirrors api/rbac.js presets.
 * Authorization must use these helpers; UI hiding is not security.
 */
public final class RbacPermissions {

  private RbacPermissions() {}

  public static final List<String> ALL_PERMISSIONS = List.of(
      "jobs.view",
      "jobs.edit",
      "jobs.assign",
      "quotes.view",
      "quotes.approve",
      "contractors.view",
      "contractors.edit",
      "contractors.verify",
      "contractors.suspend",
      "homeowners.view",
      "homeowners.edit",
      "partners.view",
      "partners.edit",
      "payments.view",
      "payments.refund",
      "payouts.view",
      "payouts.approve",
      "pricing.view",
      "pricing.edit",
      "homecare.view",
      "homecare.manage",
      "settings.view",
      "settings.edit",
      "staff.view",
      "staff.create",
      "staff.edit",
      "staff.disable",
      "audit.view",
      "ai.view",
      "ai.override",
      "profitability.view"
  );

  private static final List<String> WORK_OPS = List.of(
      "jobs.view",
      "jobs.edit",
      "jobs.assign",
      "quotes.view",
      "quotes.approve",
      "ai.view",
      "contractors.view",
      "homeowners.view"
  );

  public static final Map<String, List<String>> ROLE_PRESETS;

  static {
    Map<String, List<String>> presets = new LinkedHashMap<>();
    presets.put("super_admin", ALL_PERMISSIONS);
    presets.put("operations_admin", concat(
        WORK_OPS,
        List.of(
            "contractors.edit",
            "contractors.verify",
            "contractors.suspend",
            "homeowners.edit",
            "partners.view",
            "payments.view",
            "payouts.view",
            "ai.override",
            "audit.view",
            "homecare.view"
        )
    ));
    presets.put("dispatcher", List.of(
        "jobs.view", "jobs.edit", "jobs.assign", "quotes.view", "contractors.view", "ai.view"
    ));
    presets.put("finance_admin", List.of(
        "jobs.view",
        "payments.view",
        "payments.refund",
        "payouts.view",
        "payouts.approve",
        "pricing.view",
        "pricing.edit",
        "profitability.view",
        "audit.view",
        "homeowners.view",
        "contractors.view",
        "homecare.view"
    ));
    presets.put("contractor_manager", List.of(
        "contractors.view",
        "contractors.edit",
        "contractors.verify",
        "contractors.suspend",
        "jobs.view",
        "quotes.view",
        "audit.view"
    ));
    presets.put("customer_support", List.of(
        "homeowners.view",
        "homeowners.edit",
        "jobs.view",
        "jobs.edit",
        "quotes.view",
        "payments.view",
        "payments.refund",
        "partners.view"
    ));
    presets.put("read_only", List.of(
        "jobs.view",
        "quotes.view",
        "contractors.view",
        "homeowners.view",
        "partners.view",
        "payments.view",
        "payouts.view",
        "pricing.view",
        "ai.view",
        "audit.view",
        "staff.view",
        "settings.view",
        "profitability.view",
        "homecare.view"
    ));
    ROLE_PRESETS = Collections.unmodifiableMap(presets);
  }

  public static final Set<String> VALID_ROLE_PRESETS = Set.copyOf(ROLE_PRESETS.keySet());

  public static String legacyAccessToPreset(String level) {
    String l = level == null ? "read-write" : level.toLowerCase();
    if ("read".equals(l)) {
      return "read_only";
    }
    if ("write".equals(l)) {
      return "operations_admin";
    }
    if (VALID_ROLE_PRESETS.contains(l)) {
      return l;
    }
    return "operations_admin";
  }

  public static String resolveAdminPreset(String role, String adminRolePreset, String adminAccessLevel) {
    if (!"admin".equals(role)) {
      return null;
    }
    String stored = adminRolePreset == null ? "" : adminRolePreset.toLowerCase();
    if (VALID_ROLE_PRESETS.contains(stored)) {
      return stored;
    }
    return legacyAccessToPreset(adminAccessLevel);
  }

  public static Set<String> permissionsForPreset(String preset) {
    if (preset == null || !ROLE_PRESETS.containsKey(preset)) {
      return Set.of();
    }
    return new LinkedHashSet<>(ROLE_PRESETS.get(preset));
  }

  public static Set<String> permissionsForUser(String role, String adminRolePreset, String adminAccessLevel) {
    String preset = resolveAdminPreset(role, adminRolePreset, adminAccessLevel);
    return permissionsForPreset(preset);
  }

  public static boolean userHasPermission(
      String role, String adminRolePreset, String adminAccessLevel, String permission) {
    return permissionsForUser(role, adminRolePreset, adminAccessLevel).contains(permission);
  }

  public static String presetToAccessLevel(String preset) {
    if ("read_only".equals(preset)) {
      return "read";
    }
    if ("dispatcher".equals(preset) || "customer_support".equals(preset)) {
      return "write";
    }
    return "read-write";
  }

  private static List<String> concat(List<String> a, List<String> b) {
    Set<String> out = new LinkedHashSet<>(a);
    out.addAll(b);
    return List.copyOf(out);
  }
}
