package com.fixbridge.subscription.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.subscription.entity.HomecareSettingsEntity;
import com.fixbridge.admin.entity.PricingRulesEntity;
import com.fixbridge.subscription.entity.SubscriptionPlanEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.subscription.repository.HomecareSettingsRepository;
import com.fixbridge.admin.repository.PricingRulesRepository;
import com.fixbridge.subscription.repository.SubscriptionPlanRepository;
import com.fixbridge.common.util.MoneyUtil;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class HomecareConfigService {

  public static final String FREE_PLAN_CODE = "free";
  public static final String PAID_HOME_CARE_PLAN_CODE = "homecare_pro";
  public static final List<String> PAID_HOME_CARE_PLAN_CODES =
      List.of("homecare_pro", "pro_membership", "homecare");

  private static final Set<String> FREE_BASE_FEATURES =
      Set.of(
          "ai_assessment",
          "diy_guidance",
          "service_requests",
          "quotes",
          "payments",
          "job_history",
          "messages",
          "basic_home_profile");

  private final HomecareSettingsRepository settingsRepository;
  private final PricingRulesRepository pricingRulesRepository;
  private final SubscriptionPlanRepository planRepository;
  private final ObjectMapper objectMapper;

  public HomecareConfigService(
      HomecareSettingsRepository settingsRepository,
      PricingRulesRepository pricingRulesRepository,
      SubscriptionPlanRepository planRepository,
      ObjectMapper objectMapper) {
    this.settingsRepository = settingsRepository;
    this.pricingRulesRepository = pricingRulesRepository;
    this.planRepository = planRepository;
    this.objectMapper = objectMapper;
  }

  public static boolean isPaidHomeCarePlan(String code) {
    return PAID_HOME_CARE_PLAN_CODES.contains(String.valueOf(code == null ? "" : code).trim());
  }

  @Transactional
  public HomecareSettingsEntity ensureDefaultSettings() {
    return settingsRepository
        .findById("default")
        .orElseGet(
            () -> {
              HomecareSettingsEntity row = new HomecareSettingsEntity();
              row.setId("default");
              row.setConfig(defaultConfigNode());
              row.setConfigVersion(1);
              return settingsRepository.save(row);
            });
  }

  @Transactional
  public PricingRulesEntity ensurePricingRules() {
    return pricingRulesRepository
        .findById("default")
        .orElseGet(
            () -> {
              PricingRulesEntity row = new PricingRulesEntity();
              row.setId("default");
              ObjectNode rules = objectMapper.createObjectNode();
              rules.put("homecare_subscription_price", 29);
              rules.put("pro_subscription_price", 29);
              rules.put("standard_coordination_fee", 125);
              rules.put("homecare_pro_coordination_fee", 99);
              rules.put("subscription_discount", 0);
              row.setRules(rules);
              return pricingRulesRepository.save(row);
            });
  }

  @Transactional
  public void ensureLaunchPlans() {
    if (planRepository.count() > 0) {
      return;
    }
    BigDecimal paid = readHomeCarePrice().orElse(new BigDecimal("29.00"));
    planRepository.save(buildPlan("free", "FixBridge Free", BigDecimal.ZERO, "light", 1, false, 0, "Included"));
    planRepository.save(
        buildPlan(
            PAID_HOME_CARE_PLAN_CODE,
            "HomeCare Pro",
            MoneyUtil.dollars(paid),
            "blue",
            2,
            true,
            7,
            "Upgrade to Pro"));
  }

  public JsonNode getMergedConfig() {
    HomecareSettingsEntity row = ensureDefaultSettings();
    JsonNode stored = row.getConfig() != null ? row.getConfig() : defaultConfigNode();
    ObjectNode merged = mergeConfig(stored);
    merged.put("configVersion", row.getConfigVersion() != null ? row.getConfigVersion() : 1);
    if (row.getUpdatedAt() != null) {
      merged.put("updatedAt", row.getUpdatedAt().toString());
    }
    return merged;
  }

  public Map<String, Object> toPublicConfig(JsonNode config, String planCode) {
    boolean isPro = isPaidHomeCarePlan(planCode);
    Map<String, Object> features = new LinkedHashMap<>();
    JsonNode featRoot = config.path("features");
    featRoot
        .fieldNames()
        .forEachRemaining(
            id -> {
              JsonNode f = featRoot.path(id);
              boolean enabled = f.path("enabled").asBoolean(true);
              boolean free = f.path("free").asBoolean(false);
              boolean pro = f.path("pro").asBoolean(true);
              boolean entitled = enabled && (isPro ? pro : free);
              Map<String, Object> dto = new LinkedHashMap<>();
              dto.put("enabled", enabled);
              dto.put("entitled", entitled);
              dto.put("label", f.path("label").asText(id));
              dto.put("requiresPro", enabled && !free && pro);
              features.put(id, dto);
            });

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("configVersion", config.path("configVersion").asInt(1));
    out.put(
        "updatedAt",
        config.hasNonNull("updatedAt") ? config.get("updatedAt").asText() : null);
    out.put("planCodes", Map.of("free", FREE_PLAN_CODE, "pro", PAID_HOME_CARE_PLAN_CODE));
    out.put("features", features);
    out.put("upgrade", objectMapper.convertValue(config.path("upgrade"), Map.class));
    JsonNode rec = config.path("recurring");
    out.put(
        "recurring",
        Map.of(
            "cleaningEnabled", rec.path("cleaningEnabled").asBoolean(true),
            "landscapingEnabled", rec.path("landscapingEnabled").asBoolean(true),
            "frequencies", objectMapper.convertValue(rec.path("frequencies"), Map.class),
            "fulfillmentMode", rec.path("fulfillmentMode").asText("manual"),
            "schedulerAvailable", rec.path("schedulerAvailable").asBoolean(false),
            "remindersEnabled", rec.path("remindersEnabled").asBoolean(true),
            "reminderLeadHours", rec.path("reminderLeadHours").asInt(24)));
    out.put("maintenance", Map.of("enabled", config.path("maintenance").path("enabled").asBoolean(true)));
    out.put(
        "documents",
        Map.of(
            "enabled", config.path("documents").path("enabled").asBoolean(true),
            "maxFileSizeMb", config.path("documents").path("maxFileSizeMb").asInt(4),
            "maxDocumentsPerProperty",
                config.path("documents").path("maxDocumentsPerProperty").asInt(100)));
    out.put(
        "household",
        Map.of(
            "enabled", config.path("household").path("enabled").asBoolean(true),
            "maxMembersPerProperty",
                config.path("household").path("maxMembersPerProperty").asInt(5)));
    out.put(
        "homeHealthReport",
        Map.of(
            "enabled", config.path("homeHealthReport").path("enabled").asBoolean(true),
            "minDaysBetweenReports",
                config.path("homeHealthReport").path("minDaysBetweenReports").asInt(365)));
    return out;
  }

  public Map<String, Object> getActivationFee() {
    JsonNode fee = getMergedConfig().path("recurring").path("activationFee");
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("enabled", fee.path("enabled").asBoolean(true));
    int cents = fee.path("amountCents").asInt(4900);
    out.put("amountCents", cents);
    out.put("amount", MoneyUtil.centsToDollars(cents));
    out.put("label", fee.path("label").asText("FixBridge One-Time Activation Fee"));
    out.put(
        "description",
        fee.path("description")
            .asText("One-time coordination and setup fee for recurring service activation."));
    return out;
  }

  @Transactional
  public Map<String, Object> putActivationFee(Map<String, Object> body) {
    HomecareSettingsEntity row = ensureDefaultSettings();
    ObjectNode config = mergeConfig(row.getConfig());
    ObjectNode recurring =
        config.has("recurring") && config.get("recurring").isObject()
            ? (ObjectNode) config.get("recurring")
            : config.putObject("recurring");
    ObjectNode fee =
        recurring.has("activationFee") && recurring.get("activationFee").isObject()
            ? (ObjectNode) recurring.get("activationFee")
            : recurring.putObject("activationFee");

    if (body.containsKey("enabled")) {
      fee.put("enabled", Boolean.TRUE.equals(body.get("enabled")) || "true".equalsIgnoreCase(String.valueOf(body.get("enabled"))));
    }
    if (body.containsKey("amountCents") || body.containsKey("amount")) {
      int cents;
      if (body.get("amountCents") != null) {
        cents = Math.max(0, (int) Math.round(Double.parseDouble(String.valueOf(body.get("amountCents")))));
      } else {
        BigDecimal dollars = new BigDecimal(String.valueOf(body.get("amount")));
        cents = (int) MoneyUtil.dollarsToCents(MoneyUtil.dollars(dollars));
      }
      fee.put("amountCents", cents);
    }
    if (body.get("label") != null) {
      fee.put("label", slice(String.valueOf(body.get("label")), 80));
    }
    if (body.get("description") != null) {
      fee.put("description", slice(String.valueOf(body.get("description")), 240));
    }
    row.setConfig(config);
    row.setConfigVersion((row.getConfigVersion() == null ? 1 : row.getConfigVersion()) + 1);
    settingsRepository.save(row);
    return getActivationFee();
  }

  @Transactional
  public JsonNode patchSettings(JsonNode patch, Long adminUserId, boolean confirmImpact) {
    HomecareSettingsEntity row = ensureDefaultSettings();
    ObjectNode current = mergeConfig(row.getConfig());
    ObjectNode next = mergeConfig(deepMerge(current, patch));
    List<String> warnings = detectWarnings(current, next);
    if (!warnings.isEmpty() && !confirmImpact) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "This change may affect existing homeowners. Confirm to proceed.",
          "CONFIRMATION_REQUIRED");
    }
    row.setConfig(next);
    row.setConfigVersion(next.path("configVersion").asInt(1));
    row.setUpdatedBy(adminUserId);
    settingsRepository.save(row);
    return next;
  }

  public java.util.Optional<BigDecimal> readHomeCarePrice() {
    ensurePricingRules();
    return pricingRulesRepository
        .findById("default")
        .map(PricingRulesEntity::getRules)
        .map(
            rules -> {
              if (rules.hasNonNull("homecare_subscription_price")) {
                return MoneyUtil.dollars(new BigDecimal(rules.get("homecare_subscription_price").asText("0")));
              }
              if (rules.hasNonNull("pro_subscription_price")) {
                return MoneyUtil.dollars(new BigDecimal(rules.get("pro_subscription_price").asText("0")));
              }
              return null;
            })
        .filter(v -> v != null && v.compareTo(BigDecimal.ZERO) > 0);
  }

  @Transactional
  public void syncHomeCarePrice(BigDecimal amount) {
    PricingRulesEntity row = ensurePricingRules();
    ObjectNode rules =
        row.getRules() != null && row.getRules().isObject()
            ? (ObjectNode) row.getRules().deepCopy()
            : objectMapper.createObjectNode();
    BigDecimal dollars = MoneyUtil.dollars(amount);
    rules.put("homecare_subscription_price", dollars);
    rules.put("pro_subscription_price", dollars);
    row.setRules(rules);
    pricingRulesRepository.save(row);
  }

  public boolean isRecurrenceAllowed(JsonNode config, String recurrence) {
    String key = String.valueOf(recurrence == null ? "" : recurrence).trim();
    JsonNode freq = config.path("recurring").path("frequencies");
    if (freq.has(key)) {
      return freq.path(key).asBoolean(true);
    }
    return Set.of("weekly", "biweekly", "monthly", "every_2_months", "quarterly", "every_6_months", "annually", "seasonal", "custom")
        .contains(key);
  }

  public boolean isRecurringServiceTypeAllowed(JsonNode config, String serviceType) {
    if ("recurring_cleaning".equals(serviceType)) {
      return config.path("recurring").path("cleaningEnabled").asBoolean(true);
    }
    if ("recurring_landscaping".equals(serviceType)) {
      return config.path("recurring").path("landscapingEnabled").asBoolean(true);
    }
    return false;
  }

  private SubscriptionPlanEntity buildPlan(
      String code,
      String name,
      BigDecimal amount,
      String theme,
      int sort,
      boolean highlight,
      int trialDays,
      String cta) {
    SubscriptionPlanEntity p = new SubscriptionPlanEntity();
    p.setCode(code);
    p.setName(name);
    p.setAmount(amount);
    p.setInterval("month");
    p.setTheme(theme);
    p.setSortOrder(sort);
    p.setFeatures(objectMapper.createArrayNode());
    p.setHighlight(highlight);
    p.setUnlocksDiy(true);
    p.setTrialDays(trialDays);
    p.setActive(true);
    p.setCtaLabel(cta);
    return p;
  }

  private ObjectNode defaultConfigNode() {
    ObjectNode root = objectMapper.createObjectNode();
    root.put("configVersion", 1);
    ObjectNode features = root.putObject("features");
    for (String id :
        List.of(
            "ai_assessment",
            "diy_guidance",
            "service_requests",
            "quotes",
            "payments",
            "job_history",
            "messages",
            "basic_home_profile",
            "property_aware_ai",
            "maintenance_calendar",
            "document_vault",
            "recurring_cleaning",
            "recurring_landscaping",
            "priority_routing",
            "reduced_coordination_fees",
            "quote_second_opinion",
            "household_sharing",
            "annual_health_report")) {
      ObjectNode f = features.putObject(id);
      boolean isBase = FREE_BASE_FEATURES.contains(id);
      f.put("enabled", true);
      f.put("free", isBase);
      f.put("pro", true);
      f.put("label", id.replace('_', ' '));
    }
    ObjectNode upgrade = root.putObject("upgrade");
    upgrade.put("headline", "Upgrade to HomeCare Pro");
    upgrade.put("cta", "Upgrade to HomeCare Pro");
    upgrade.put("description", "FixBridge helps manage the home all year.");
    ObjectNode recurring = root.putObject("recurring");
    recurring.put("cleaningEnabled", true);
    recurring.put("landscapingEnabled", true);
    ObjectNode frequencies = recurring.putObject("frequencies");
    frequencies.put("weekly", true);
    frequencies.put("biweekly", true);
    frequencies.put("monthly", true);
    recurring.put("fulfillmentMode", "manual");
    recurring.put("schedulerAvailable", false);
    recurring.put("leadTimeDays", 7);
    recurring.put("remindersEnabled", true);
    recurring.put("reminderLeadHours", 24);
    ObjectNode fee = recurring.putObject("activationFee");
    fee.put("enabled", true);
    fee.put("amountCents", 4900);
    fee.put("label", "FixBridge One-Time Activation Fee");
    fee.put("description", "One-time coordination and setup fee for recurring service activation.");
    root.putObject("maintenance").put("enabled", true);
    ObjectNode docs = root.putObject("documents");
    docs.put("enabled", true);
    docs.put("maxFileSizeMb", 4);
    docs.put("maxDocumentsPerProperty", 100);
    ObjectNode hh = root.putObject("household");
    hh.put("enabled", true);
    hh.put("maxMembersPerProperty", 5);
    ObjectNode report = root.putObject("homeHealthReport");
    report.put("enabled", true);
    report.put("minDaysBetweenReports", 365);
    return root;
  }

  private ObjectNode mergeConfig(JsonNode raw) {
    ObjectNode base = defaultConfigNode();
    if (raw == null || raw.isNull() || !raw.isObject()) {
      return base;
    }
    return deepMerge(base, raw);
  }

  private ObjectNode deepMerge(ObjectNode base, JsonNode patch) {
    ObjectNode out = base.deepCopy();
    if (patch == null || !patch.isObject()) {
      return out;
    }
    patch
        .fields()
        .forEachRemaining(
            e -> {
              String key = e.getKey();
              JsonNode val = e.getValue();
              if (val != null && val.isObject() && out.has(key) && out.get(key).isObject()) {
                out.set(key, deepMerge((ObjectNode) out.get(key), val));
              } else {
                out.set(key, val);
              }
            });
    return out;
  }

  private List<String> detectWarnings(JsonNode prev, JsonNode next) {
    List<String> warnings = new ArrayList<>();
    JsonNode prevF = prev.path("features");
    JsonNode nextF = next.path("features");
    prevF
        .fieldNames()
        .forEachRemaining(
            id -> {
              JsonNode was = prevF.path(id);
              JsonNode now = nextF.path(id);
              if (was.path("free").asBoolean(false)
                  && !now.path("free").asBoolean(false)
                  && now.path("pro").asBoolean(true)) {
                warnings.add(was.path("label").asText(id) + ": moved from Free to Pro-only.");
              }
              if (was.path("enabled").asBoolean(true) && !now.path("enabled").asBoolean(true)) {
                warnings.add(was.path("label").asText(id) + ": globally disabled.");
              }
            });
    return warnings;
  }

  private static String slice(String s, int max) {
    if (!StringUtils.hasText(s)) {
      return s;
    }
    return s.length() <= max ? s : s.substring(0, max);
  }
}
