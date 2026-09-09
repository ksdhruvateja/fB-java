package com.fixbridge.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.admin.entity.PricingRulesEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.admin.repository.PricingRulesRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.authorization.RbacPermissions;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fixbridge.subscription.service.HomecareConfigService;
@Service
public class PricingRulesService {

  private final HomecareConfigService homecareConfigService;
  private final PricingRulesRepository pricingRulesRepository;
  private final UserRepository userRepository;
  private final AuditService auditService;
  private final ObjectMapper objectMapper;

  public PricingRulesService(
      HomecareConfigService homecareConfigService,
      PricingRulesRepository pricingRulesRepository,
      UserRepository userRepository,
      AuditService auditService,
      ObjectMapper objectMapper) {
    this.homecareConfigService = homecareConfigService;
    this.pricingRulesRepository = pricingRulesRepository;
    this.userRepository = userRepository;
    this.auditService = auditService;
    this.objectMapper = objectMapper;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> getRules() {
    SecurityUtils.requireAdminRole();
    requirePermission(SecurityUtils.requirePrincipal(), "pricing.view");
    PricingRulesEntity row = homecareConfigService.ensurePricingRules();
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("rules", row.getRules());
    body.put("updatedAt", row.getUpdatedAt() != null ? row.getUpdatedAt().toString() : null);
    return body;
  }

  @Transactional
  public Map<String, Object> putRules(Map<String, Object> body) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    SecurityUtils.requireAdminRole();
    requirePermission(principal, "pricing.edit");
    requireWrite(principal);

    PricingRulesEntity row = homecareConfigService.ensurePricingRules();
    ObjectNode current =
        row.getRules() != null && row.getRules().isObject()
            ? (ObjectNode) row.getRules().deepCopy()
            : objectMapper.createObjectNode();
    Object incoming =
        body != null && body.containsKey("rules") ? body.get("rules") : body;
    if (incoming != null) {
      JsonNode patch = objectMapper.valueToTree(incoming);
      if (patch.isObject()) {
        mergeObject(current, (ObjectNode) patch);
      }
    }
    row.setRules(current);
    pricingRulesRepository.save(row);
    auditService.write(principal.getId(), "pricing_rules_update", "pricing_rules", "default", current);

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("ok", true);
    response.put("rules", current);
    response.put("updatedAt", row.getUpdatedAt() != null ? row.getUpdatedAt().toString() : null);
    return response;
  }

  private void mergeObject(ObjectNode target, ObjectNode patch) {
    Iterator<String> fields = patch.fieldNames();
    while (fields.hasNext()) {
      String field = fields.next();
      JsonNode value = patch.get(field);
      if (value != null && value.isObject() && target.has(field) && target.get(field).isObject()) {
        mergeObject((ObjectNode) target.get(field), (ObjectNode) value);
      } else {
        target.set(field, value);
      }
    }
  }

  private void requirePermission(UserPrincipal principal, String permission) {
    UserEntity admin =
        userRepository
            .findById(principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "Admin required."));
    if (!RbacPermissions.userHasPermission(
        admin.getRole(), admin.getAdminRolePreset(), admin.getAdminAccessLevel(), permission)) {
      throw new ApiException(
          HttpStatus.FORBIDDEN, "Missing permission: " + permission, "FORBIDDEN_PERMISSION");
    }
  }

  private void requireWrite(UserPrincipal principal) {
    UserEntity admin =
        userRepository
            .findById(principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "Admin required."));
    String level =
        RbacPermissions.presetToAccessLevel(
            RbacPermissions.resolveAdminPreset(
                admin.getRole(), admin.getAdminRolePreset(), admin.getAdminAccessLevel()));
    if ("read".equals(level)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Read-only admin cannot edit pricing.");
    }
  }
}
