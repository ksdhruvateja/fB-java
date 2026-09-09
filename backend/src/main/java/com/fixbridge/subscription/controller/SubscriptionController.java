package com.fixbridge.subscription.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fixbridge.subscription.service.HomecareConfigService;
import com.fixbridge.subscription.service.RecurringServiceOpsService;
import com.fixbridge.subscription.service.SubscriptionService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.fixbridge.security.authorization.SecurityUtils;
@RestController
public class SubscriptionController {

  private final SubscriptionService subscriptionService;
  private final HomecareConfigService homecareConfigService;
  private final RecurringServiceOpsService recurringServiceOpsService;
  private final ObjectMapper objectMapper;

  public SubscriptionController(
      SubscriptionService subscriptionService,
      HomecareConfigService homecareConfigService,
      RecurringServiceOpsService recurringServiceOpsService,
      ObjectMapper objectMapper) {
    this.subscriptionService = subscriptionService;
    this.homecareConfigService = homecareConfigService;
    this.recurringServiceOpsService = recurringServiceOpsService;
    this.objectMapper = objectMapper;
  }

  @GetMapping("/api/platform/plans")
  public Map<String, Object> platformPlans() {
    return subscriptionService.listPlatformPlans();
  }

  @GetMapping("/api/platform/go-pro-plans")
  public Map<String, Object> goProPlans() {
    return subscriptionService.listGoProPlans();
  }

  @GetMapping("/api/homecare/config")
  public Map<String, Object> publicConfig() {
    return Map.of(
        "ok",
        true,
        "config",
        homecareConfigService.toPublicConfig(homecareConfigService.getMergedConfig(), null));
  }

  @GetMapping("/api/homecare/config/me")
  public Map<String, Object> myConfig() {
    var state = subscriptionService.resolveEntitlement(
        com.fixbridge.security.authorization.SecurityUtils.requireUserId(), null);
    return Map.of(
        "ok",
        true,
        "config",
        homecareConfigService.toPublicConfig(
            homecareConfigService.getMergedConfig(), state.effectivePlanCode));
  }

  @GetMapping("/api/homecare/subscription-status")
  public Map<String, Object> subscriptionStatus() {
    return subscriptionService.subscriptionStatus();
  }

  @GetMapping("/api/subscriptions/mine")
  public Map<String, Object> mine() {
    return subscriptionService.listMine();
  }

  @PostMapping("/api/subscriptions/checkout")
  public Map<String, Object> checkout(
      @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
    String origin = request.getHeader("Origin");
    if (origin == null || origin.isBlank()) {
      origin = request.getHeader("Referer");
    }
    return subscriptionService.checkout(body != null ? body : Map.of(), origin);
  }

  @PostMapping("/api/subscriptions/cancel")
  public Map<String, Object> cancel() {
    return subscriptionService.cancelOrResume(true);
  }

  @PostMapping("/api/subscriptions/resume")
  public Map<String, Object> resume() {
    return subscriptionService.cancelOrResume(false);
  }

  @PostMapping("/api/subscriptions/billing-portal")
  public Map<String, Object> billingPortal(HttpServletRequest request) {
    String origin = request.getHeader("Origin");
    if (origin == null || origin.isBlank()) {
      origin = request.getHeader("Referer");
    }
    return subscriptionService.billingPortal(origin);
  }

  @GetMapping("/api/recurring-services")
  public Map<String, Object> listRecurring() {
    return recurringServiceOpsService.listMine();
  }

  @PostMapping("/api/recurring-services")
  public Map<String, Object> createRecurring(@RequestBody(required = false) Map<String, Object> body) {
    return recurringServiceOpsService.create(body != null ? body : Map.of());
  }

  @org.springframework.web.bind.annotation.PatchMapping("/api/recurring-services/{id}")
  public Map<String, Object> patchRecurring(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return recurringServiceOpsService.patch(id, body != null ? body : Map.of());
  }

  @GetMapping("/api/admin/subscription-plans")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminListPlans() {
    return subscriptionService.listAdminPlans();
  }

  @PostMapping("/api/admin/subscription-plans")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminCreatePlan(@RequestBody Map<String, Object> body) {
    return subscriptionService.createPlan(body);
  }

  @PutMapping("/api/admin/subscription-plans/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminPutPlan(
      @PathVariable Long id, @RequestBody Map<String, Object> body) {
    return subscriptionService.updatePlan(id, body);
  }

  @org.springframework.web.bind.annotation.PatchMapping("/api/admin/subscription-plans/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminPatchPlan(
      @PathVariable Long id, @RequestBody Map<String, Object> body) {
    return subscriptionService.updatePlan(id, body);
  }

  @GetMapping("/api/admin/homecare/settings")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminHomecareSettings() {
    var config = homecareConfigService.getMergedConfig();
    var pricing = homecareConfigService.ensurePricingRules().getRules();
    return Map.of(
        "ok",
        true,
        "config",
        config,
        "pricing",
        Map.of(
            "standardCoordinationFee",
            pricing.path("standard_coordination_fee").asDouble(125),
            "homecareProCoordinationFee",
            pricing.path("homecare_pro_coordination_fee").asDouble(99),
            "subscriptionDiscount",
            pricing.path("subscription_discount").asDouble(0)));
  }

  @org.springframework.web.bind.annotation.PatchMapping("/api/admin/homecare/settings")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminPatchHomecareSettings(
      @RequestBody Map<String, Object> body) {
    Long adminId = com.fixbridge.security.authorization.SecurityUtils.requireUserId();
    boolean confirm = Boolean.TRUE.equals(body.get("confirmImpact"));
    Object patchSrc = body.containsKey("config") ? body.get("config") : body;
    var next =
        homecareConfigService.patchSettings(
            objectMapper.valueToTree(patchSrc),
            adminId,
            confirm);
    return Map.of("ok", true, "config", next);
  }

  @GetMapping("/api/admin/homecare/activation-fee")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> getActivationFee() {
    return Map.of("ok", true, "activationFee", homecareConfigService.getActivationFee());
  }

  @PutMapping("/api/admin/homecare/activation-fee")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> putActivationFee(@RequestBody Map<String, Object> body) {
    return Map.of("ok", true, "activationFee", homecareConfigService.putActivationFee(body));
  }
}
