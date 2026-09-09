package com.fixbridge.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.admin.entity.HomeownerAcceptanceEntity;
import com.fixbridge.admin.entity.LegalDocumentVersionEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.admin.repository.HomeownerAcceptanceRepository;
import com.fixbridge.admin.repository.LegalDocumentVersionRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class LegalConsentService {

  private static final List<Map<String, String>> STATIC_DOCS =
      List.of(
          Map.of(
              "key",
              "HOMEOWNER_TERMS",
              "title",
              "FixBridge Terms of Service",
              "version",
              "2026-09-01",
              "route",
              "/legal/terms",
              "acceptanceType",
              "ACCOUNT_TERMS"),
          Map.of(
              "key",
              "PRIVACY_POLICY",
              "title",
              "Privacy Policy",
              "version",
              "2026-09-01",
              "route",
              "/legal/privacy",
              "acceptanceType",
              "PRIVACY_POLICY"),
          Map.of(
              "key",
              "DIY_SAFETY_DISCLAIMER",
              "title",
              "AI / DIY Safety Disclaimer",
              "version",
              "1.1",
              "route",
              "/legal/diy-safety",
              "acceptanceType",
              "DIY_SAFETY"),
          Map.of(
              "key",
              "HOMEOWNER_SERVICE_AGREEMENT",
              "title",
              "Homeowner Platform & Professional Service Agreement",
              "version",
              "1.1",
              "route",
              "/legal/homeowner-service-agreement",
              "acceptanceType",
              "HOMEOWNER_SERVICE_AGREEMENT"));

  private final LegalDocumentVersionRepository legalDocumentVersionRepository;
  private final HomeownerAcceptanceRepository acceptanceRepository;
  private final ObjectMapper objectMapper;

  public LegalConsentService(
      LegalDocumentVersionRepository legalDocumentVersionRepository,
      HomeownerAcceptanceRepository acceptanceRepository,
      ObjectMapper objectMapper) {
    this.legalDocumentVersionRepository = legalDocumentVersionRepository;
    this.acceptanceRepository = acceptanceRepository;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public Map<String, Object> listDocuments() {
    ensureSeedDocuments();
    List<LegalDocumentVersionEntity> current =
        legalDocumentVersionRepository.findByStatusIgnoreCaseOrderByEffectiveDateDesc("current");
    List<Map<String, Object>> documents = new ArrayList<>();
    if (!current.isEmpty()) {
      for (LegalDocumentVersionEntity d : current) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("key", d.getDocumentKey());
        row.put("title", d.getTitle());
        row.put("version", d.getVersion());
        row.put("route", d.getRoute());
        row.put("acceptanceType", acceptanceTypeFor(d.getDocumentKey()));
        row.put("effectiveDate", d.getEffectiveDate());
        documents.add(row);
      }
    } else {
      for (Map<String, String> d : STATIC_DOCS) {
        documents.add(new LinkedHashMap<>(d));
      }
    }
    return Map.of("ok", true, "documents", documents);
  }

  public Map<String, Object> consentStatus() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    if (!"homeowner".equals(principal.getRole()) && !"admin".equals(principal.getRole())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Homeowners only.");
    }
    Long userId = principal.getId();
    boolean diy =
        acceptanceRepository.existsByUserIdAndAcceptanceTypeIgnoreCaseAndAcceptedTrue(
            userId, "DIY_SAFETY");
    boolean terms =
        acceptanceRepository.existsByUserIdAndAcceptanceTypeIgnoreCaseAndAcceptedTrue(
            userId, "ACCOUNT_TERMS");
    boolean privacy =
        acceptanceRepository.existsByUserIdAndAcceptanceTypeIgnoreCaseAndAcceptedTrue(
            userId, "PRIVACY_POLICY");
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("ok", true);
    out.put("diySafetyAccepted", diy);
    out.put("accountTermsAccepted", terms);
    out.put("privacyPolicyAccepted", privacy);
    out.put("marketingConsent", false);
    out.put("marketingEmailOptIn", false);
    out.put("marketingSmsOptIn", false);
    return out;
  }

  @Transactional
  public Map<String, Object> accept(Map<String, Object> body, HttpServletRequest request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    if (!"homeowner".equals(principal.getRole()) && !"admin".equals(principal.getRole())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Homeowners only.");
    }
    List<String> types = new ArrayList<>();
    if (body.get("acceptanceType") != null) {
      types.add(String.valueOf(body.get("acceptanceType")).trim().toUpperCase());
    }
    if (body.get("consents") instanceof Map<?, ?> consents) {
      consents.forEach(
          (k, v) -> {
            if (Boolean.TRUE.equals(v) || "true".equalsIgnoreCase(String.valueOf(v))) {
              types.add(String.valueOf(k).trim().toUpperCase());
            }
          });
    }
    if (body.get("acceptances") instanceof Map<?, ?> acceptances) {
      acceptances.forEach(
          (k, v) -> {
            if (Boolean.TRUE.equals(v) || "true".equalsIgnoreCase(String.valueOf(v))) {
              types.add(String.valueOf(k).trim().toUpperCase());
            }
          });
    }
    if (types.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one acceptanceType is required.");
    }

    List<Map<String, Object>> recorded = new ArrayList<>();
    for (String type : types) {
      if (!StringUtils.hasText(type)) {
        continue;
      }
      Map<String, String> meta = resolveDocMeta(type);
      HomeownerAcceptanceEntity row = new HomeownerAcceptanceEntity();
      row.setUserId(principal.getId());
      row.setAcceptanceType(type);
      row.setDocumentKey(meta.get("key"));
      row.setDocumentVersion(meta.get("version"));
      row.setDocumentTitle(meta.get("title"));
      row.setAccepted(true);
      row.setActionCompleted(true);
      if (body.get("jobId") != null) {
        try {
          row.setJobId(Long.valueOf(String.valueOf(body.get("jobId"))));
        } catch (NumberFormatException ignored) {
          // optional
        }
      }
      if (request != null) {
        String fwd = request.getHeader("X-Forwarded-For");
        row.setIpAddress(
            StringUtils.hasText(fwd) ? fwd.split(",")[0].trim() : request.getRemoteAddr());
        row.setUserAgent(request.getHeader("User-Agent"));
        row.setSourceRoute(request.getRequestURI());
      }
      if (body.get("idempotencyKey") != null) {
        row.setIdempotencyKey(String.valueOf(body.get("idempotencyKey")));
      }
      ObjectNode metadata = objectMapper.createObjectNode();
      metadata.put("source", "consent_accept");
      row.setMetadata(metadata);
      row = acceptanceRepository.save(row);
      Map<String, Object> dto = new LinkedHashMap<>();
      dto.put("id", row.getId());
      dto.put("acceptanceType", row.getAcceptanceType());
      dto.put("documentKey", row.getDocumentKey());
      dto.put("documentVersion", row.getDocumentVersion());
      dto.put("acceptedAt", row.getAcceptedAt());
      recorded.add(dto);
    }
    return Map.of("ok", true, "acceptances", recorded);
  }

  private void ensureSeedDocuments() {
    if (legalDocumentVersionRepository.count() > 0) {
      return;
    }
    for (Map<String, String> d : STATIC_DOCS) {
      LegalDocumentVersionEntity row = new LegalDocumentVersionEntity();
      row.setDocumentKey(d.get("key"));
      row.setTitle(d.get("title"));
      row.setVersion(d.get("version"));
      row.setEffectiveDate(LocalDate.parse("2026-09-01"));
      row.setStatus("current");
      row.setRoute(d.get("route"));
      row.setAudience("public");
      ObjectNode content = objectMapper.createObjectNode();
      content.put("heading", d.get("title"));
      content.putArray("sections");
      row.setContent(content);
      legalDocumentVersionRepository.save(row);
    }
  }

  private Map<String, String> resolveDocMeta(String acceptanceType) {
    for (Map<String, String> d : STATIC_DOCS) {
      if (acceptanceType.equalsIgnoreCase(d.get("acceptanceType"))) {
        return d;
      }
    }
    return Map.of(
        "key", acceptanceType,
        "title", acceptanceType,
        "version", "1.0",
        "route", "/legal",
        "acceptanceType", acceptanceType);
  }

  private String acceptanceTypeFor(String documentKey) {
    for (Map<String, String> d : STATIC_DOCS) {
      if (d.get("key").equalsIgnoreCase(documentKey)) {
        return d.get("acceptanceType");
      }
    }
    return null;
  }
}
