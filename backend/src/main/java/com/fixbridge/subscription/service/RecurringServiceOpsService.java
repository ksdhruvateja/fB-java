package com.fixbridge.subscription.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.subscription.entity.RecurringServiceEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.property.repository.PropertyRepository;
import com.fixbridge.subscription.repository.RecurringServiceRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class RecurringServiceOpsService {

  private final RecurringServiceRepository recurringServiceRepository;
  private final PropertyRepository propertyRepository;
  private final HomecareConfigService homecareConfigService;
  private final SubscriptionService subscriptionService;
  private final ObjectMapper objectMapper;

  public RecurringServiceOpsService(
      RecurringServiceRepository recurringServiceRepository,
      PropertyRepository propertyRepository,
      HomecareConfigService homecareConfigService,
      SubscriptionService subscriptionService,
      ObjectMapper objectMapper) {
    this.recurringServiceRepository = recurringServiceRepository;
    this.propertyRepository = propertyRepository;
    this.homecareConfigService = homecareConfigService;
    this.subscriptionService = subscriptionService;
    this.objectMapper = objectMapper;
  }

  public Map<String, Object> listMine() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    assertAnyRecurring(principal);
    List<Map<String, Object>> services =
        recurringServiceRepository.findVisibleToPropertyOwner(principal.getId()).stream()
            .map(this::serialize)
            .toList();
    return Map.of("ok", true, "services", services);
  }

  @Transactional
  public Map<String, Object> create(Map<String, Object> body) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    assertAnyRecurring(principal);
    JsonNode config = homecareConfigService.getMergedConfig();
    Long propertyId = Long.valueOf(String.valueOf(body.get("propertyId")));
    String serviceType = String.valueOf(body.getOrDefault("serviceType", "")).trim();
    String recurrence = String.valueOf(body.getOrDefault("recurrence", "")).trim();
    if (!homecareConfigService.isRecurringServiceTypeAllowed(config, serviceType)
        || !homecareConfigService.isRecurrenceAllowed(config, recurrence)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid recurring service request.");
    }
    propertyRepository
        .findByIdAndOwnerUserId(propertyId, principal.getId())
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Property not found."));

    LocalDate startDate =
        body.get("startDate") != null
            ? LocalDate.parse(String.valueOf(body.get("startDate")).substring(0, 10))
            : LocalDate.now();

    RecurringServiceEntity row = new RecurringServiceEntity();
    row.setOwnerUserId(principal.getId());
    row.setPropertyId(propertyId);
    row.setServiceType(serviceType);
    row.setRecurrence(recurrence);
    if (body.get("preferredDay") != null) {
      row.setPreferredDay(clip(String.valueOf(body.get("preferredDay")), 40));
    }
    if (body.get("preferredTimeWindow") != null) {
      row.setPreferredTimeWindow(clip(String.valueOf(body.get("preferredTimeWindow")), 40));
    }
    row.setStartDate(startDate);
    row.setNextServiceDate(startDate);
    row.setStatus("active");
    if (body.get("notes") != null) {
      row.setNotes(clip(String.valueOf(body.get("notes")), 500));
    }
    row.setMetadata(objectMapper.createObjectNode());
    row = recurringServiceRepository.save(row);
    return Map.of("ok", true, "service", serialize(row));
  }

  @Transactional
  public Map<String, Object> patch(Long id, Map<String, Object> body) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    assertAnyRecurring(principal);
    JsonNode config = homecareConfigService.getMergedConfig();
    RecurringServiceEntity existing =
        recurringServiceRepository
            .findByIdAndOwnerUserId(id, principal.getId())
            .orElseThrow(
                () -> new ApiException(HttpStatus.NOT_FOUND, "Recurring service not found."));

    // Property isolation: owner must still own the property
    propertyRepository
        .findByIdAndOwnerUserId(existing.getPropertyId(), principal.getId())
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Property not found."));

    String status =
        body.get("status") != null ? String.valueOf(body.get("status")) : existing.getStatus();
    if (!Set.of("active", "paused", "cancelled").contains(status)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid status.");
    }
    if (body.get("recurrence") != null) {
      String recurrence = String.valueOf(body.get("recurrence"));
      if (!homecareConfigService.isRecurrenceAllowed(config, recurrence)) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid recurrence.");
      }
      existing.setRecurrence(recurrence);
    }
    if (body.containsKey("preferredDay")) {
      existing.setPreferredDay(
          body.get("preferredDay") == null
              ? null
              : clip(String.valueOf(body.get("preferredDay")), 40));
    }
    if (body.containsKey("preferredTimeWindow")) {
      existing.setPreferredTimeWindow(
          body.get("preferredTimeWindow") == null
              ? null
              : clip(String.valueOf(body.get("preferredTimeWindow")), 40));
    }
    existing.setStatus(status);
    if (body.containsKey("notes")) {
      existing.setNotes(
          body.get("notes") == null ? null : clip(String.valueOf(body.get("notes")), 500));
    }
    if (body.get("nextServiceDate") != null) {
      existing.setNextServiceDate(
          LocalDate.parse(String.valueOf(body.get("nextServiceDate")).substring(0, 10)));
    }
    existing = recurringServiceRepository.save(existing);
    return Map.of("ok", true, "service", serialize(existing));
  }

  private void assertAnyRecurring(UserPrincipal principal) {
    SubscriptionService.EntitlementState state =
        subscriptionService.resolveEntitlement(principal.getId(), null);
    JsonNode config = homecareConfigService.getMergedConfig();
    boolean cleaning =
        config.path("features").path("recurring_cleaning").path("enabled").asBoolean(true)
            && (state.isPro
                || config.path("features").path("recurring_cleaning").path("free").asBoolean(false));
    boolean landscaping =
        config.path("features").path("recurring_landscaping").path("enabled").asBoolean(true)
            && (state.isPro
                || config
                    .path("features")
                    .path("recurring_landscaping")
                    .path("free")
                    .asBoolean(false));
    if (!cleaning && !landscaping) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "HomeCare Pro is required for this feature.",
          "PRO_SUBSCRIPTION_REQUIRED");
    }
  }

  private Map<String, Object> serialize(RecurringServiceEntity row) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", row.getId());
    m.put("ownerUserId", row.getOwnerUserId());
    m.put("propertyId", row.getPropertyId());
    m.put("serviceType", row.getServiceType());
    m.put("recurrence", row.getRecurrence());
    m.put("preferredDay", row.getPreferredDay());
    m.put("preferredTimeWindow", row.getPreferredTimeWindow());
    m.put("startDate", row.getStartDate());
    m.put("status", row.getStatus());
    m.put("nextServiceDate", row.getNextServiceDate());
    m.put("assignedContractorUserId", row.getAssignedContractorUserId());
    m.put("notes", row.getNotes());
    m.put("metadata", row.getMetadata());
    m.put("createdAt", row.getCreatedAt());
    m.put("updatedAt", row.getUpdatedAt());
    return m;
  }

  private static String clip(String s, int max) {
    if (!StringUtils.hasText(s)) {
      return s;
    }
    return s.length() <= max ? s : s.substring(0, max);
  }
}
