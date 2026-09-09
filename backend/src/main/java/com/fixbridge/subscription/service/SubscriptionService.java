package com.fixbridge.subscription.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.payment.entity.PaymentEntity;
import com.fixbridge.subscription.entity.SubscriptionEntity;
import com.fixbridge.subscription.entity.SubscriptionPlanEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.payment.stripe.common.StripeService;
import com.fixbridge.payment.repository.PaymentRepository;
import com.fixbridge.subscription.repository.SubscriptionPlanRepository;
import com.fixbridge.subscription.repository.SubscriptionRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import com.fixbridge.common.util.MoneyUtil;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class SubscriptionService {

  private static final Set<String> PRO_GRANTING = Set.of("active", "trialing");

  private final SubscriptionPlanRepository planRepository;
  private final SubscriptionRepository subscriptionRepository;
  private final PaymentRepository paymentRepository;
  private final UserRepository userRepository;
  private final HomecareConfigService homecareConfigService;
  private final StripeService stripeService;
  private final ObjectMapper objectMapper;

  public SubscriptionService(
      SubscriptionPlanRepository planRepository,
      SubscriptionRepository subscriptionRepository,
      PaymentRepository paymentRepository,
      UserRepository userRepository,
      HomecareConfigService homecareConfigService,
      StripeService stripeService,
      ObjectMapper objectMapper) {
    this.planRepository = planRepository;
    this.subscriptionRepository = subscriptionRepository;
    this.paymentRepository = paymentRepository;
    this.userRepository = userRepository;
    this.homecareConfigService = homecareConfigService;
    this.stripeService = stripeService;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public Map<String, Object> listGoProPlans() {
    homecareConfigService.ensureLaunchPlans();
    List<SubscriptionPlanEntity> plans = planRepository.findByActiveTrueOrderBySortOrderAscIdAsc();
    List<Map<String, Object>> dtos = plans.stream().map(this::toPlanDto).toList();
    String revision =
        dtos.stream()
            .map(
                p ->
                    p.get("code")
                        + ":"
                        + MoneyUtil.dollars((BigDecimal) p.get("amount"))
                        + ":"
                        + String.valueOf(p.get("updatedAt")))
            .reduce((a, b) -> a + "|" + b)
            .orElse("");
    return Map.of("ok", true, "plans", dtos, "pricingRevision", revision);
  }

  @Transactional
  public Map<String, Object> listPlatformPlans() {
    homecareConfigService.ensurePricingRules();
    BigDecimal proPrice =
        homecareConfigService.readHomeCarePrice().orElse(BigDecimal.ZERO);
    List<Map<String, Object>> plans = new ArrayList<>();
    plans.add(catalogPlan("diy_plus", "diy", "DIY Plus", new BigDecimal("14.99"), "month", 0));
    plans.add(catalogPlan("diy_plus_annual", "diy", "DIY Plus Annual", new BigDecimal("119"), "year", 0));
    plans.add(catalogPlan("homecare_plus", "diy", "HomeCare Plus", new BigDecimal("24.99"), "month", 0));
    plans.add(catalogPlan("property_pro", "property", "Property Pro", new BigDecimal("49"), "month", 0));
    plans.add(catalogPlan("portfolio", "property", "Portfolio", new BigDecimal("149"), "month", 0));
    plans.add(
        catalogPlan("brokerage", "property", "Brokerage / White Label", new BigDecimal("499"), "month", 0));
    plans.add(catalogPlan("contractor_pro", "contractor", "Contractor Pro", new BigDecimal("99"), "month", 0));
    plans.add(
        catalogPlan("contractor_growth", "contractor", "Contractor Growth", new BigDecimal("249"), "month", 0));
    plans.add(
        catalogPlan(
            HomecareConfigService.PAID_HOME_CARE_PLAN_CODE,
            "diy",
            "HomeCare Pro",
            proPrice,
            "month",
            7));
    plans.add(catalogPlan("pro_membership", "diy", "Pro Membership", proPrice, "month", 7));
    return Map.of("ok", true, "plans", plans);
  }

  public Map<String, Object> listAdminPlans() {
    homecareConfigService.ensureLaunchPlans();
    return Map.of(
        "ok",
        true,
        "plans",
        planRepository.findAllByOrderBySortOrderAscIdAsc().stream().map(this::toPlanDto).toList());
  }

  @Transactional
  public Map<String, Object> createPlan(Map<String, Object> body) {
    ParsedPlan p = parsePlanBody(body, false);
    if (planRepository.existsByCodeIgnoreCase(p.code)) {
      throw new ApiException(HttpStatus.CONFLICT, "A plan with that code already exists.");
    }
    SubscriptionPlanEntity entity = new SubscriptionPlanEntity();
    applyParsed(entity, p);
    entity = planRepository.save(entity);
    if (HomecareConfigService.isPaidHomeCarePlan(entity.getCode())) {
      homecareConfigService.syncHomeCarePrice(entity.getAmount());
    }
    return Map.of("ok", true, "plan", toPlanDto(entity));
  }

  @Transactional
  public Map<String, Object> updatePlan(Long id, Map<String, Object> body) {
    SubscriptionPlanEntity entity =
        planRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Plan not found."));
    ParsedPlan p = parsePlanBody(body, true);
    if (p.code != null
        && !p.code.equalsIgnoreCase(entity.getCode())
        && planRepository.existsByCodeIgnoreCase(p.code)) {
      throw new ApiException(HttpStatus.CONFLICT, "A plan with that code already exists.");
    }
    if (p.code != null) {
      entity.setCode(p.code);
    }
    if (p.name != null) {
      entity.setName(p.name);
    }
    if (p.amount != null) {
      entity.setAmount(p.amount);
    }
    if (p.interval != null) {
      entity.setInterval(p.interval);
    }
    if (p.theme != null) {
      entity.setTheme(p.theme);
    }
    if (p.sortOrder != null) {
      entity.setSortOrder(p.sortOrder);
    }
    if (p.features != null) {
      entity.setFeatures(p.features);
    }
    if (p.highlight != null) {
      entity.setHighlight(p.highlight);
    }
    if (p.unlocksDiy != null) {
      entity.setUnlocksDiy(p.unlocksDiy);
    }
    if (p.trialDays != null) {
      entity.setTrialDays(p.trialDays);
    }
    if (p.active != null) {
      entity.setActive(p.active);
    }
    if (p.ctaLabel != null) {
      entity.setCtaLabel(p.ctaLabel);
    }
    if (p.descriptionSet) {
      entity.setDescription(p.description);
    }
    entity = planRepository.save(entity);
    if (HomecareConfigService.isPaidHomeCarePlan(entity.getCode())) {
      homecareConfigService.syncHomeCarePrice(entity.getAmount());
    }
    return Map.of("ok", true, "plan", toPlanDto(entity));
  }

  public Map<String, Object> listMine() {
    Long userId = SecurityUtils.requireUserId();
    List<Map<String, Object>> rows =
        subscriptionRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
            .map(this::toSubscriptionRow)
            .toList();
    return Map.of("ok", true, "subscriptions", rows);
  }

  public Map<String, Object> subscriptionStatus() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    EntitlementState state = resolveEntitlement(principal.getId(), null);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("ok", true);
    out.putAll(toPublicDto(state));
    SubscriptionEntity best = loadBestHomeCare(principal.getId()).orElse(null);
    if (best != null) {
      out.put(
          "subscription",
          Map.of(
              "planCode", best.getPlanCode(),
              "status", best.getStatus(),
              "currentPeriodEnd", best.getCurrentPeriodEnd(),
              "cancelAtPeriodEnd", state.cancelAtPeriodEnd,
              "paymentIssue", state.paymentIssue));
    } else {
      out.put("subscription", null);
    }
    return out;
  }

  @Transactional
  public Map<String, Object> checkout(Map<String, Object> body, String origin) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    String planCode = String.valueOf(body.getOrDefault("planCode", "")).trim();
    if (!StringUtils.hasText(planCode)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Plan code is required.");
    }
    ResolvedPlan plan = resolvePlan(planCode);
    if (plan.amount.compareTo(BigDecimal.ZERO) <= 0) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "This plan is included with your account — no checkout needed.");
    }
    if (HomecareConfigService.isPaidHomeCarePlan(planCode)) {
      EntitlementState state = resolveEntitlement(principal.getId(), null);
      if (state.isPro) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("alreadySubscribed", true);
        out.put("plan", state.effectivePlanCode);
        out.put("status", state.status);
        out.put("subscription", toPublicDto(state));
        return out;
      }
      if (state.paymentIssue) {
        throw new ApiException(
            HttpStatus.CONFLICT,
            "There is a problem with your HomeCare Pro billing. Update your payment method instead of starting a new subscription.",
            "BILLING_ISSUE");
      }
    }

    if (!stripeService.isConfigured()) {
      throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "Payments are not configured. Set STRIPE_SECRET_KEY in your environment.",
          "STRIPE_NOT_CONFIGURED");
    }

    Long jobId = null;
    if (body.get("jobId") != null && StringUtils.hasText(String.valueOf(body.get("jobId")))) {
      jobId = Long.valueOf(String.valueOf(body.get("jobId")));
    }
    String returnTo = String.valueOf(body.getOrDefault("returnTo", "")).trim();
    String returnFeature =
        Set.of("diy", "report", "hire", "passport", "dashboard").contains(returnTo) ? returnTo : "";
    String returnQuery =
        StringUtils.hasText(returnFeature) ? "&returnTo=" + returnFeature : "";
    String successPath =
        jobId != null
            ? "/?paid=subscription&plan=" + planCode + "&jobId=" + jobId + returnQuery
            : "/?paid=subscription&plan=" + planCode + returnQuery;
    String cancelPath =
        jobId != null
            ? "/?canceled=subscription&plan=" + planCode + "&jobId=" + jobId
            : "/?canceled=subscription&plan=" + planCode;

    Map<String, String> metadata = new LinkedHashMap<>();
    metadata.put("paymentType", "subscription");
    metadata.put("planCode", planCode);
    metadata.put("userId", String.valueOf(principal.getId()));
    metadata.put("jobId", jobId != null ? String.valueOf(jobId) : "");

    Map<String, String> session =
        stripeService.createSubscriptionCheckoutSession(
            MoneyUtil.dollarsToCents(plan.amount),
            principal.getEmail(),
            "FixBridge " + plan.label,
            successPath,
            cancelPath,
            origin,
            metadata,
            plan.trialDays,
            plan.interval);

    PaymentEntity payment = new PaymentEntity();
    payment.setUserId(principal.getId());
    payment.setPaymentType("subscription");
    payment.setAmount(MoneyUtil.dollars(plan.amount));
    payment.setCurrency("usd");
    payment.setStatus("pending");
    payment.setStripeSessionId(session.get("sessionId"));
    payment.setProvider("stripe");
    payment.setSimulated(false);
    ObjectNode meta = objectMapper.createObjectNode();
    meta.put("planCode", planCode);
    payment.setMeta(meta);
    paymentRepository.save(payment);

    return Map.of("ok", true, "url", session.get("url"));
  }

  @Transactional
  public Map<String, Object> cancelOrResume(boolean cancelAtPeriodEnd) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    SubscriptionEntity sub =
        loadBestHomeCare(principal.getId())
            .filter(this::grantsPro)
            .orElseThrow(
                () ->
                    new ApiException(
                        HttpStatus.BAD_REQUEST, "No active HomeCare subscription to update."));
    if (StringUtils.hasText(sub.getStripeSubscriptionId()) && stripeService.isConfigured()) {
      stripeService.updateSubscriptionCancelAtPeriodEnd(
          sub.getStripeSubscriptionId(), cancelAtPeriodEnd);
    }
    ObjectNode meta =
        sub.getMeta() != null && sub.getMeta().isObject()
            ? (ObjectNode) sub.getMeta().deepCopy()
            : objectMapper.createObjectNode();
    meta.put("cancelAtPeriodEnd", cancelAtPeriodEnd);
    meta.put("cancel_at_period_end", cancelAtPeriodEnd);
    sub.setMeta(meta);
    subscriptionRepository.save(sub);
    syncUserPlan(principal.getId());
    EntitlementState state = resolveEntitlement(principal.getId(), null);
    return Map.of("ok", true, "subscription", toPublicDto(state));
  }

  @Transactional(readOnly = true)
  public Map<String, Object> billingPortal(String origin) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    SubscriptionEntity sub =
        loadBestHomeCare(principal.getId())
            .orElseThrow(
                () -> new ApiException(HttpStatus.BAD_REQUEST, "No HomeCare subscription found."));
    String customerId = null;
    if (sub.getMeta() != null) {
      if (sub.getMeta().hasNonNull("stripeCustomerId")) {
        customerId = sub.getMeta().get("stripeCustomerId").asText();
      } else if (sub.getMeta().hasNonNull("stripe_customer_id")) {
        customerId = sub.getMeta().get("stripe_customer_id").asText();
      }
    }
    if (!StringUtils.hasText(customerId) || !stripeService.isConfigured()) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Billing management is not available for this subscription yet.");
    }
    String url = stripeService.createBillingPortalSession(customerId, origin);
    return Map.of("ok", true, "url", url);
  }

  public void syncUserPlan(Long userId) {
    EntitlementState state = resolveEntitlement(userId, null);
    userRepository
        .findById(userId)
        .ifPresent(
            u -> {
              u.setPlanCode(state.isPro ? state.effectivePlanCode : HomecareConfigService.FREE_PLAN_CODE);
              userRepository.save(u);
            });
  }

  public EntitlementState resolveEntitlement(Long userId, String fallbackPlanCode) {
    Optional<SubscriptionEntity> best = loadBestHomeCare(userId);
    EntitlementState state = new EntitlementState();
    if (best.isEmpty()) {
      String plan =
          StringUtils.hasText(fallbackPlanCode)
              ? fallbackPlanCode
              : userRepository.findById(userId).map(UserEntity::getPlanCode).orElse(null);
      state.isPro = HomecareConfigService.isPaidHomeCarePlan(plan);
      state.planCode = plan;
      state.effectivePlanCode =
          state.isPro ? HomecareConfigService.PAID_HOME_CARE_PLAN_CODE : HomecareConfigService.FREE_PLAN_CODE;
      state.status = state.isPro ? "active" : "none";
      return state;
    }
    SubscriptionEntity sub = best.get();
    state.planCode = sub.getPlanCode();
    state.status = sub.getStatus();
    state.currentPeriodEnd = sub.getCurrentPeriodEnd();
    state.cancelAtPeriodEnd = readCancelFlag(sub.getMeta());
    String status = String.valueOf(sub.getStatus() == null ? "" : sub.getStatus()).toLowerCase();
    state.paymentIssue = "past_due".equals(status) || "unpaid".equals(status);
    state.isPro = grantsPro(sub);
    state.effectivePlanCode =
        state.isPro ? HomecareConfigService.PAID_HOME_CARE_PLAN_CODE : HomecareConfigService.FREE_PLAN_CODE;
    return state;
  }

  private Optional<SubscriptionEntity> loadBestHomeCare(Long userId) {
    List<SubscriptionEntity> rows =
        subscriptionRepository.findHomeCareByUser(
            userId, HomecareConfigService.PAID_HOME_CARE_PLAN_CODES);
    return rows.stream().filter(this::grantsPro).findFirst().or(() -> rows.stream().findFirst());
  }

  private boolean grantsPro(SubscriptionEntity sub) {
    if (sub == null || !HomecareConfigService.isPaidHomeCarePlan(sub.getPlanCode())) {
      return false;
    }
    String status = String.valueOf(sub.getStatus() == null ? "" : sub.getStatus()).toLowerCase();
    if ("past_due".equals(status)
        || "canceled".equals(status)
        || "cancelled".equals(status)
        || "expired".equals(status)
        || "unpaid".equals(status)
        || "incomplete".equals(status)
        || "incomplete_expired".equals(status)
        || "paused".equals(status)) {
      return false;
    }
    if (!PRO_GRANTING.contains(status) && !"active".equals(status)) {
      return false;
    }
    if (sub.getCurrentPeriodEnd() != null && sub.getCurrentPeriodEnd().isBefore(OffsetDateTime.now())) {
      return false;
    }
    return true;
  }

  private ResolvedPlan resolvePlan(String planCode) {
    Optional<SubscriptionPlanEntity> managed = planRepository.findByCodeIgnoreCase(planCode);
    if (managed.isPresent() && Boolean.TRUE.equals(managed.get().getActive())) {
      SubscriptionPlanEntity m = managed.get();
      return new ResolvedPlan(
          MoneyUtil.dollars(m.getAmount()),
          m.getName(),
          "diy",
          m.getTrialDays() != null ? m.getTrialDays() : 0,
          "year".equalsIgnoreCase(m.getInterval()) ? "year" : "month");
    }
    if (HomecareConfigService.isPaidHomeCarePlan(planCode)) {
      BigDecimal amount =
          homecareConfigService.readHomeCarePrice().orElse(BigDecimal.ZERO);
      return new ResolvedPlan(
          amount,
          HomecareConfigService.PAID_HOME_CARE_PLAN_CODE.equals(planCode)
              ? "HomeCare Pro"
              : "Pro Membership",
          "diy",
          7,
          "month");
    }
    throw new ApiException(HttpStatus.BAD_REQUEST, "Unknown plan.");
  }

  private Map<String, Object> toPublicDto(EntitlementState state) {
    Map<String, Object> dto = new LinkedHashMap<>();
    dto.put("isPro", state.isPro);
    dto.put("planCode", state.planCode);
    dto.put("effectivePlanCode", state.effectivePlanCode);
    dto.put("status", state.status);
    dto.put("currentPeriodEnd", state.currentPeriodEnd);
    dto.put("cancelAtPeriodEnd", state.cancelAtPeriodEnd);
    dto.put("paymentIssue", state.paymentIssue);
    return dto;
  }

  private Map<String, Object> toPlanDto(SubscriptionPlanEntity r) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", r.getId());
    m.put("code", r.getCode());
    m.put("name", r.getName());
    m.put("amount", MoneyUtil.dollars(r.getAmount()));
    m.put("interval", r.getInterval());
    m.put("theme", r.getTheme());
    m.put("sortOrder", r.getSortOrder());
    m.put("features", r.getFeatures());
    m.put("highlight", Boolean.TRUE.equals(r.getHighlight()));
    m.put("unlocksDiy", Boolean.TRUE.equals(r.getUnlocksDiy()));
    m.put("trialDays", r.getTrialDays());
    m.put("active", r.getActive() != false);
    m.put("ctaLabel", r.getCtaLabel());
    m.put("description", r.getDescription());
    m.put("createdAt", r.getCreatedAt());
    m.put("updatedAt", r.getUpdatedAt());
    return m;
  }

  private Map<String, Object> toSubscriptionRow(SubscriptionEntity s) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", s.getId());
    m.put("user_id", s.getUserId());
    m.put("plan_code", s.getPlanCode());
    m.put("plan_family", s.getPlanFamily());
    m.put("status", s.getStatus());
    m.put("stripe_subscription_id", s.getStripeSubscriptionId());
    m.put("current_period_end", s.getCurrentPeriodEnd());
    m.put("simulated", s.getSimulated());
    m.put("meta", s.getMeta());
    m.put("created_at", s.getCreatedAt());
    return m;
  }

  private Map<String, Object> catalogPlan(
      String code, String family, String label, BigDecimal amount, String interval, int trialDays) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("code", code);
    m.put("family", family);
    m.put("label", label);
    m.put("amount", MoneyUtil.dollars(amount));
    m.put("interval", interval);
    m.put("trialDays", trialDays);
    return m;
  }

  private boolean readCancelFlag(JsonNode meta) {
    if (meta == null) {
      return false;
    }
    if (meta.has("cancelAtPeriodEnd")) {
      return meta.get("cancelAtPeriodEnd").asBoolean(false);
    }
    return meta.path("cancel_at_period_end").asBoolean(false);
  }

  private ParsedPlan parsePlanBody(Map<String, Object> body, boolean partial) {
    ParsedPlan out = new ParsedPlan();
    if (!partial || body.containsKey("code")) {
      String code =
          String.valueOf(body.getOrDefault("code", ""))
              .trim()
              .toLowerCase()
              .replaceAll("[^a-z0-9_]+", "_")
              .replaceAll("^_+|_+$", "");
      if (!StringUtils.hasText(code)) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Plan code is required.");
      }
      out.code = code;
    }
    if (!partial || body.containsKey("name")) {
      String name = String.valueOf(body.getOrDefault("name", "")).trim();
      if (!StringUtils.hasText(name)) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Plan name is required.");
      }
      out.name = name.length() > 80 ? name.substring(0, 80) : name;
    }
    if (!partial || body.containsKey("amount")) {
      BigDecimal amount = new BigDecimal(String.valueOf(body.get("amount")));
      if (amount.compareTo(BigDecimal.ZERO) < 0) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Amount must be a non-negative number.");
      }
      out.amount = MoneyUtil.dollars(amount);
    }
    if (!partial || body.containsKey("interval")) {
      out.interval = "year".equals(String.valueOf(body.get("interval"))) ? "year" : "month";
    }
    if (!partial || body.containsKey("theme")) {
      String theme = String.valueOf(body.getOrDefault("theme", "light"));
      out.theme = Set.of("light", "blue", "plum").contains(theme) ? theme : "light";
    }
    if (!partial || body.containsKey("sortOrder")) {
      out.sortOrder =
          body.get("sortOrder") != null
              ? Integer.parseInt(String.valueOf(body.get("sortOrder")))
              : 0;
    }
    if (!partial || body.containsKey("features")) {
      out.features = objectMapper.valueToTree(body.getOrDefault("features", List.of()));
    }
    if (!partial || body.containsKey("highlight")) {
      out.highlight = Boolean.TRUE.equals(body.get("highlight"));
    }
    if (!partial || body.containsKey("unlocksDiy")) {
      out.unlocksDiy = Boolean.TRUE.equals(body.get("unlocksDiy"));
    }
    if (!partial || body.containsKey("trialDays")) {
      int td =
          body.get("trialDays") != null
              ? Integer.parseInt(String.valueOf(body.get("trialDays")))
              : 0;
      out.trialDays = Math.min(90, Math.max(0, td));
    }
    if (!partial || body.containsKey("active")) {
      out.active = body.get("active") == null || !Boolean.FALSE.equals(body.get("active"));
    }
    if (!partial || body.containsKey("ctaLabel")) {
      String cta = String.valueOf(body.getOrDefault("ctaLabel", "Select")).trim();
      out.ctaLabel = StringUtils.hasText(cta) ? cta.substring(0, Math.min(40, cta.length())) : "Select";
    }
    if (!partial || body.containsKey("description")) {
      out.descriptionSet = true;
      Object d = body.get("description");
      out.description = d == null || !StringUtils.hasText(String.valueOf(d))
          ? null
          : String.valueOf(d).substring(0, Math.min(500, String.valueOf(d).length()));
    }
    return out;
  }

  private void applyParsed(SubscriptionPlanEntity entity, ParsedPlan p) {
    entity.setCode(p.code);
    entity.setName(p.name);
    entity.setAmount(p.amount != null ? p.amount : BigDecimal.ZERO);
    entity.setInterval(p.interval != null ? p.interval : "month");
    entity.setTheme(p.theme != null ? p.theme : "light");
    entity.setSortOrder(p.sortOrder != null ? p.sortOrder : 0);
    entity.setFeatures(p.features != null ? p.features : objectMapper.createArrayNode());
    entity.setHighlight(Boolean.TRUE.equals(p.highlight));
    entity.setUnlocksDiy(Boolean.TRUE.equals(p.unlocksDiy));
    entity.setTrialDays(p.trialDays != null ? p.trialDays : 0);
    entity.setActive(p.active == null || p.active);
    entity.setCtaLabel(p.ctaLabel != null ? p.ctaLabel : "Select");
    entity.setDescription(p.description);
  }

  public static final class EntitlementState {
    public boolean isPro;
    public String planCode;
    public String effectivePlanCode;
    public String status;
    public OffsetDateTime currentPeriodEnd;
    public boolean cancelAtPeriodEnd;
    public boolean paymentIssue;
  }

  private static final class ResolvedPlan {
    final BigDecimal amount;
    final String label;
    final String family;
    final int trialDays;
    final String interval;

    ResolvedPlan(BigDecimal amount, String label, String family, int trialDays, String interval) {
      this.amount = amount;
      this.label = label;
      this.family = family;
      this.trialDays = trialDays;
      this.interval = interval;
    }
  }

  private static final class ParsedPlan {
    String code;
    String name;
    BigDecimal amount;
    String interval;
    String theme;
    Integer sortOrder;
    JsonNode features;
    Boolean highlight;
    Boolean unlocksDiy;
    Integer trialDays;
    Boolean active;
    String ctaLabel;
    String description;
    boolean descriptionSet;
  }
}
