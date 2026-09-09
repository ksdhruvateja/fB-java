package com.fixbridge.compliance.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fixbridge.compliance.entity.ContractorComplianceDocumentEntity;
import com.fixbridge.compliance.entity.ContractorComplianceEventEntity;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.compliance.repository.ContractorComplianceDocumentRepository;
import com.fixbridge.compliance.repository.ContractorComplianceEventRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.compliance.enums.ComplianceConstants;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class ContractorComplianceService {

  private static final int EXPIRY_WARN_DAYS = 30;

  private final ContractorComplianceDocumentRepository documentRepository;
  private final ContractorComplianceEventRepository eventRepository;
  private final UserRepository userRepository;
  private final ObjectMapper objectMapper;

  public ContractorComplianceService(
      ContractorComplianceDocumentRepository documentRepository,
      ContractorComplianceEventRepository eventRepository,
      UserRepository userRepository,
      ObjectMapper objectMapper) {
    this.documentRepository = documentRepository;
    this.eventRepository = eventRepository;
    this.userRepository = userRepository;
    this.objectMapper = objectMapper;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> getSummary(Long contractorUserId) {
    return getSummary(contractorUserId, null);
  }

  @Transactional
  public Map<String, Object> getSummary(Long contractorUserId, ManagedJobEntity job) {
    UserEntity user = requireContractor(contractorUserId);
    List<ContractorComplianceDocumentEntity> docs = ensureDocuments(user);
    return buildSummary(user, docs, job);
  }

  /** Throws 409 CONTRACTOR_NOT_DISPATCH_ELIGIBLE when contractor cannot be invited/assigned. */
  @Transactional
  public void assertDispatchEligible(Long contractorUserId, ManagedJobEntity job) {
    Map<String, Object> summary = getSummary(contractorUserId, job);
    String tier = resolveTier(job);
    boolean eligible =
        ComplianceConstants.LEVEL_2.equals(tier)
            ? Boolean.TRUE.equals(summary.get("level2Eligible"))
            : Boolean.TRUE.equals(summary.get("level1Eligible"));
    if (eligible) {
      return;
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> tierEval =
        (Map<String, Object>)
            summary.get(ComplianceConstants.LEVEL_2.equals(tier) ? "level2" : "level1");
    Map<String, Object> details = new LinkedHashMap<>();
    details.put("tier", tier);
    details.put(
        "missingRequirements",
        tierEval != null && tierEval.get("missingRequirements") != null
            ? tierEval.get("missingRequirements")
            : summary.getOrDefault("missingRequirements", List.of()));
    details.put("complianceStatus", summary.get("complianceStatus"));
    details.put(
        "overallStatus",
        tierEval != null ? tierEval.get("overallStatus") : summary.get("overallComplianceStatus"));
    details.put("overallLabel", tierEval != null ? tierEval.get("label") : summary.get("overallLabel"));
    details.put(
        "blockingItems", tierEval != null ? tierEval.getOrDefault("blockingItems", List.of()) : List.of());
    details.put(
        "reviewItems", tierEval != null ? tierEval.getOrDefault("reviewItems", List.of()) : List.of());
    details.put("applicationStatus", summary.get("applicationStatus"));
    details.put("dispatchEligible", false);
    details.put("level1Eligible", summary.get("level1Eligible"));
    details.put("level2Eligible", summary.get("level2Eligible"));
    String message =
        ComplianceConstants.LEVEL_2.equals(tier)
            ? "Contractor is not eligible for Level 2 (managed/facility/emergency) dispatch."
            : "Contractor is not eligible for live dispatch.";
    throw new ApiException(
        HttpStatus.CONFLICT, message, "CONTRACTOR_NOT_DISPATCH_ELIGIBLE", true, details);
  }

  @Transactional
  public Map<String, Object> uploadDocument(
      Long contractorUserId,
      String documentType,
      String fileName,
      String fileData,
      LocalDate issueDate,
      LocalDate expirationDate,
      boolean uploadLater,
      Long actorUserId) {
    String type = normalizeType(documentType);
    if (!ComplianceConstants.DOCUMENT_TYPES.containsKey(type)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unknown document type.");
    }
    UserEntity user = requireContractor(contractorUserId);
    Map<String, String> applicability = computeApplicability(user, ComplianceConstants.LEVEL_1);

    if (uploadLater && !StringUtils.hasText(fileData)) {
      ContractorComplianceDocumentEntity cur =
          documentRepository
              .findByContractorUserIdAndDocumentTypeAndCurrentTrue(contractorUserId, type)
              .orElse(null);
      if (cur != null) {
        cur.setUploadLater(true);
        cur.setStatus(ComplianceConstants.MISSING);
        documentRepository.save(cur);
      } else {
        ContractorComplianceDocumentEntity row = newDoc(contractorUserId, type, applicability.get(type));
        row.setUploadLater(true);
        row.setStatus(ComplianceConstants.MISSING);
        documentRepository.save(row);
      }
      recordEvent(contractorUserId, type, "CONTRACTOR_DOCUMENT_UPLOAD_LATER", actorUserId, null);
      return Map.of("ok", true, "summary", recalculate(contractorUserId));
    }

    if (!StringUtils.hasText(fileData)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "File is required.");
    }

    ContractorComplianceDocumentEntity cur =
        documentRepository
            .findByContractorUserIdAndDocumentTypeAndCurrentTrue(contractorUserId, type)
            .orElse(null);
    int version = 1;
    if (cur != null) {
      version = (cur.getVersion() == null ? 1 : cur.getVersion()) + 1;
      cur.setCurrent(false);
      documentRepository.save(cur);
    }

    ContractorComplianceDocumentEntity inserted = newDoc(contractorUserId, type, applicability.get(type));
    inserted.setStatus(ComplianceConstants.UNDER_REVIEW);
    inserted.setFileName(fileName);
    inserted.setFileData(fileData);
    inserted.setIssueDate(issueDate);
    inserted.setExpirationDate(expirationDate);
    inserted.setUploadLater(false);
    inserted.setUploadedAt(OffsetDateTime.now());
    inserted.setCurrent(true);
    inserted.setVersion(version);
    documentRepository.save(inserted);

    upsertLegacy(user, type, fileName, fileData, expirationDate);
    if ("draft".equalsIgnoreCase(String.valueOf(user.getComplianceStatus()))) {
      user.setComplianceStatus("under_review");
      userRepository.save(user);
    }

    recordEvent(
        contractorUserId,
        type,
        "CONTRACTOR_DOCUMENT_UPLOADED",
        actorUserId,
        Map.of("fileName", fileName == null ? "" : fileName, "version", version));
    return Map.of("ok", true, "summary", recalculate(contractorUserId));
  }

  @Transactional
  public Map<String, Object> verifyDocument(
      Long contractorUserId,
      String documentType,
      Long adminUserId,
      String notes,
      LocalDate expirationDate,
      LocalDate issueDate,
      String policyCarrier,
      String policyNumber) {
    String type = normalizeType(documentType);
    ContractorComplianceDocumentEntity cur =
        documentRepository
            .findByContractorUserIdAndDocumentTypeAndCurrentTrue(contractorUserId, type)
            .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "No uploaded document to verify."));
    if (!StringUtils.hasText(cur.getFileData())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "No uploaded document to verify.");
    }
    cur.setStatus(ComplianceConstants.VERIFIED);
    cur.setVerifiedAt(OffsetDateTime.now());
    cur.setVerifiedBy(adminUserId);
    cur.setRejectedAt(null);
    cur.setRejectedBy(null);
    cur.setRejectionReason(null);
    if (StringUtils.hasText(notes)) {
      cur.setNotes(notes);
    }
    if (expirationDate != null) {
      cur.setExpirationDate(expirationDate);
    }
    if (issueDate != null) {
      cur.setIssueDate(issueDate);
    }
    if (StringUtils.hasText(policyCarrier)) {
      cur.setPolicyCarrier(policyCarrier);
    }
    if (StringUtils.hasText(policyNumber)) {
      cur.setPolicyNumber(policyNumber);
    }
    documentRepository.save(cur);
    recordEvent(contractorUserId, type, "CONTRACTOR_DOCUMENT_VERIFIED", adminUserId, Map.of("notes", notes == null ? "" : notes));
    return Map.of("ok", true, "summary", recalculate(contractorUserId));
  }

  @Transactional
  public Map<String, Object> rejectDocument(
      Long contractorUserId, String documentType, Long adminUserId, String reason) {
    if (!StringUtils.hasText(reason)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Rejection reason is required.");
    }
    String type = normalizeType(documentType);
    ContractorComplianceDocumentEntity cur =
        documentRepository
            .findByContractorUserIdAndDocumentTypeAndCurrentTrue(contractorUserId, type)
            .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Document not found."));
    cur.setStatus(ComplianceConstants.REJECTED);
    cur.setRejectedAt(OffsetDateTime.now());
    cur.setRejectedBy(adminUserId);
    cur.setRejectionReason(reason.trim());
    cur.setVerifiedAt(null);
    cur.setVerifiedBy(null);
    documentRepository.save(cur);
    recordEvent(
        contractorUserId, type, "CONTRACTOR_DOCUMENT_REJECTED", adminUserId, Map.of("reason", reason.trim()));
    return Map.of("ok", true, "summary", recalculate(contractorUserId));
  }

  @Transactional(readOnly = true)
  public Map<String, Object> getDocumentFile(Long contractorUserId, String documentType, Integer version) {
    String type = normalizeType(documentType);
    ContractorComplianceDocumentEntity row;
    if (version != null) {
      row =
          documentRepository
              .findByContractorUserIdAndDocumentTypeAndVersion(contractorUserId, type, version)
              .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Document not found."));
    } else {
      row =
          documentRepository
              .findByContractorUserIdAndDocumentTypeAndCurrentTrue(contractorUserId, type)
              .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Document not found."));
    }
    if (!StringUtils.hasText(row.getFileData())) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Document not found.");
    }
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("fileName", row.getFileName());
    body.put("fileData", row.getFileData());
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> getHistory(Long contractorUserId, String documentType) {
    String type = normalizeType(documentType);
    List<Map<String, Object>> history =
        documentRepository
            .findByContractorUserIdAndDocumentTypeOrderByVersionDescCreatedAtDesc(contractorUserId, type)
            .stream()
            .map(this::historyRow)
            .collect(Collectors.toList());
    return Map.of("ok", true, "history", history);
  }

  @Transactional
  public Map<String, Object> recalculate(Long contractorUserId) {
    UserEntity user = requireContractor(contractorUserId);
    List<ContractorComplianceDocumentEntity> docs = ensureDocuments(user);
    Map<String, String> applicability = computeApplicability(user, ComplianceConstants.LEVEL_1);
    for (ContractorComplianceDocumentEntity row : docs) {
      String app = applicability.getOrDefault(row.getDocumentType(), ComplianceConstants.OPTIONAL);
      String next = deriveStatus(row, app);
      if (!Objects.equals(row.getApplicability(), app) || !Objects.equals(row.getStatus(), next)) {
        row.setApplicability(app);
        row.setStatus(next);
        documentRepository.save(row);
      }
    }
    docs = documentRepository.findByContractorUserIdAndCurrentTrueOrderByDocumentTypeAsc(contractorUserId);
    Map<String, Object> summary = buildSummary(user, docs, null);
    boolean prev = Boolean.TRUE.equals(user.getDispatchEligible());
    user.setDispatchEligible(Boolean.TRUE.equals(summary.get("dispatchEligible")));
    user.setLevel1Eligible(Boolean.TRUE.equals(summary.get("level1Eligible")));
    user.setLevel2Eligible(Boolean.TRUE.equals(summary.get("level2Eligible")));
    user.setOverallComplianceStatus(String.valueOf(summary.getOrDefault("overallComplianceStatus", "RED")));
    userRepository.save(user);
    if (prev != Boolean.TRUE.equals(user.getDispatchEligible())) {
      recordEvent(
          contractorUserId,
          null,
          "CONTRACTOR_DISPATCH_ELIGIBILITY_CHANGED",
          null,
          Map.of("from", prev, "to", user.getDispatchEligible()));
    }
    return summary;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> dispatchChecklist(Long contractorUserId, String jobTier) {
    ManagedJobEntity fake = null;
    if (StringUtils.hasText(jobTier)) {
      fake = new ManagedJobEntity();
      fake.setPriorityTier(jobTier);
    }
    Map<String, Object> summary = getSummary(contractorUserId, fake);
    String tier = resolveTier(fake);
    boolean eligible =
        ComplianceConstants.LEVEL_2.equals(tier)
            ? Boolean.TRUE.equals(summary.get("level2Eligible"))
            : Boolean.TRUE.equals(summary.get("level1Eligible"));
    @SuppressWarnings("unchecked")
    Map<String, Object> tierEval =
        (Map<String, Object>)
            summary.get(ComplianceConstants.LEVEL_2.equals(tier) ? "level2" : "level1");
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("eligible", eligible);
    body.put("code", eligible ? null : "CONTRACTOR_NOT_DISPATCH_ELIGIBLE");
    body.put("tier", tier);
    body.put("missingRequirements", summary.getOrDefault("missingRequirements", List.of()));
    body.put("overallStatus", summary.get("overallComplianceStatus"));
    body.put("blockingItems", tierEval != null ? tierEval.getOrDefault("blockingItems", List.of()) : List.of());
    body.put("reviewItems", tierEval != null ? tierEval.getOrDefault("reviewItems", List.of()) : List.of());
    body.put("summary", summary);
    return body;
  }

  private Map<String, Object> buildSummary(
      UserEntity user, List<ContractorComplianceDocumentEntity> docs, ManagedJobEntity job) {
    Map<String, Object> level1 = evaluateTier(user, docs, ComplianceConstants.LEVEL_1);
    Map<String, Object> level2 = evaluateTier(user, docs, ComplianceConstants.LEVEL_2);
    boolean level1Eligible = Boolean.TRUE.equals(level1.get("eligible"));
    boolean level2Eligible = Boolean.TRUE.equals(level2.get("eligible"));
    String jobTier = resolveTier(job);
    boolean dispatchEligible =
        ComplianceConstants.LEVEL_2.equals(jobTier) ? level2Eligible : level1Eligible;

    List<Map<String, Object>> documents = new ArrayList<>();
    Map<String, String> app = computeApplicability(user, ComplianceConstants.LEVEL_1);
    Map<String, ContractorComplianceDocumentEntity> byType =
        docs.stream()
            .collect(Collectors.toMap(ContractorComplianceDocumentEntity::getDocumentType, d -> d, (a, b) -> a));
    List<Map<String, Object>> expiryWarnings = new ArrayList<>();
    for (String type : ComplianceConstants.DOCUMENT_TYPE_CODES) {
      Map<String, Object> serialized =
          serializeDoc(byType.get(type), app.getOrDefault(type, ComplianceConstants.OPTIONAL), type);
      documents.add(serialized);
      Integer days = daysUntil(byType.get(type) != null ? byType.get(type).getExpirationDate() : null);
      if (days != null && days >= 0 && days <= EXPIRY_WARN_DAYS
          && ComplianceConstants.VERIFIED.equals(serialized.get("status"))) {
        Map<String, Object> warn = new LinkedHashMap<>();
        warn.put("documentType", type);
        warn.put("label", ComplianceConstants.DOCUMENT_TYPES.get(type).get("label"));
        warn.put("expirationDate", serialized.get("expirationDate"));
        warn.put("daysUntilExpiry", days);
        warn.put("severity", days <= 7 ? "critical" : "warning");
        expiryWarnings.add(warn);
      }
    }

    String overall =
        !level1Eligible
            ? ComplianceConstants.RED
            : (!expiryWarnings.isEmpty() || Boolean.TRUE.equals(level1.get("needsReview"))
                ? ComplianceConstants.YELLOW
                : ComplianceConstants.GREEN);

    Map<String, Object> summary = new LinkedHashMap<>();
    summary.put("contractorUserId", user.getId());
    summary.put("complianceStatus", user.getComplianceStatus());
    summary.put("applicationStatus", user.getComplianceStatus());
    summary.put("dispatchEligible", dispatchEligible);
    summary.put("level1Eligible", level1Eligible);
    summary.put("level2Eligible", level2Eligible);
    summary.put("overallComplianceStatus", overall);
    summary.put("overallLabel", overall);
    summary.put("missingRequirements", level1.getOrDefault("missingRequirements", List.of()));
    summary.put("documents", documents);
    summary.put("level1", level1);
    summary.put("level2", level2);
    summary.put("matrix", level1.get("matrix"));
    summary.put("expiryWarnings", expiryWarnings);
    summary.put("certificateHolder", ComplianceConstants.COI_CERTIFICATE_HOLDER);
    summary.put("legalNoticeAddress", ComplianceConstants.COI_LEGAL_NOTICE_ADDRESS);
    return summary;
  }

  private Map<String, Object> evaluateTier(
      UserEntity user, List<ContractorComplianceDocumentEntity> docs, String tier) {
    Map<String, String> applicability = computeApplicability(user, tier);
    Map<String, ContractorComplianceDocumentEntity> byType =
        docs.stream()
            .collect(Collectors.toMap(ContractorComplianceDocumentEntity::getDocumentType, d -> d, (a, b) -> a));

    List<String> missing = new ArrayList<>();
    List<Map<String, Object>> blocking = new ArrayList<>();
    List<Map<String, Object>> review = new ArrayList<>();
    List<Map<String, Object>> matrix = new ArrayList<>();
    boolean needsReview = false;

    for (String type : ComplianceConstants.DOCUMENT_TYPE_CODES) {
      String app = applicability.getOrDefault(type, ComplianceConstants.OPTIONAL);
      Map<String, Object> doc = serializeDoc(byType.get(type), app, type);
      String status = String.valueOf(doc.get("status"));
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("documentType", type);
      row.put("label", ComplianceConstants.DOCUMENT_TYPES.get(type).get("label"));
      row.put("applicability", app);
      row.put("status", status);
      matrix.add(row);

      if (ComplianceConstants.REQUIRED.equals(app)) {
        if (ComplianceConstants.BLOCKING.contains(status)) {
          missing.add(type);
          blocking.add(row);
        } else if (ComplianceConstants.REVIEW.contains(status)) {
          needsReview = true;
          review.add(row);
        }
      }
    }

    boolean eligible = missing.isEmpty() && review.isEmpty();
    String overall =
        !missing.isEmpty()
            ? ComplianceConstants.RED
            : (needsReview ? ComplianceConstants.YELLOW : ComplianceConstants.GREEN);

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("tier", tier);
    out.put("eligible", eligible);
    out.put("overallStatus", overall);
    out.put("label", overall);
    out.put("missingRequirements", missing);
    out.put("blockingItems", blocking);
    out.put("reviewItems", review);
    out.put("needsReview", needsReview);
    out.put("matrix", matrix);
    return out;
  }

  private Map<String, String> computeApplicability(UserEntity user, String tier) {
    JsonNode app = parseApplication(user);
    boolean gl = "yes".equalsIgnoreCase(text(app, "generalLiability"));
    String size = text(app, "companySize").toLowerCase(Locale.ROOT);
    boolean solo =
        text(app, "businessType").toLowerCase(Locale.ROOT).contains("sole")
            || size.equals("0")
            || size.equals("solo")
            || size.equals("1")
            || size.contains("solo")
            || size.contains("just me");
    boolean employees =
        (!solo && isFiniteNumber(size) && Double.parseDouble(size) > 1)
            || "yes".equalsIgnoreCase(text(app, "workersComp"));
    boolean commercialAuto =
        "yes".equalsIgnoreCase(text(app, "commercialAuto"))
            || "yes".equalsIgnoreCase(text(app, "usesCommercialVehicles"));
    boolean requireAi =
        "1".equals(System.getenv("REQUIRE_FIXBRIDGE_ADDITIONAL_INSURED"))
            || "true".equalsIgnoreCase(System.getenv("REQUIRE_FIXBRIDGE_ADDITIONAL_INSURED"));

    Map<String, String> map = new LinkedHashMap<>();
    map.put("W9", ComplianceConstants.REQUIRED);
    map.put("TRADE_LICENSE", ComplianceConstants.REQUIRED);
    map.put(
        "GENERAL_LIABILITY_COI",
        gl ? ComplianceConstants.REQUIRED : ComplianceConstants.NOT_APPLICABLE);
    map.put(
        "AI_ONGOING_OPS",
        gl
            ? (requireAi ? ComplianceConstants.REQUIRED : ComplianceConstants.OPTIONAL)
            : ComplianceConstants.NOT_APPLICABLE);
    map.put(
        "AI_COMPLETED_OPS",
        gl ? ComplianceConstants.REQUIRED : ComplianceConstants.NOT_APPLICABLE);
    map.put(
        "PRIMARY_NON_CONTRIBUTORY",
        gl ? ComplianceConstants.REQUIRED : ComplianceConstants.NOT_APPLICABLE);
    map.put(
        "GL_WAIVER_SUBROGATION",
        gl ? ComplianceConstants.REQUIRED : ComplianceConstants.NOT_APPLICABLE);
    if ("yes".equalsIgnoreCase(text(app, "workersComp")) || employees) {
      map.put("WORKERS_COMP", ComplianceConstants.REQUIRED);
    } else if (solo) {
      map.put("WORKERS_COMP", ComplianceConstants.NOT_APPLICABLE);
    } else {
      map.put("WORKERS_COMP", ComplianceConstants.OPTIONAL);
    }
    map.put(
        "WC_WAIVER_SUBROGATION",
        ComplianceConstants.REQUIRED.equals(map.get("WORKERS_COMP"))
            ? ComplianceConstants.OPTIONAL
            : ComplianceConstants.NOT_APPLICABLE);
    map.put(
        "SOLO_OWNER_ACK",
        solo && ComplianceConstants.NOT_APPLICABLE.equals(map.get("WORKERS_COMP"))
            ? ComplianceConstants.REQUIRED
            : ComplianceConstants.NOT_APPLICABLE);
    map.put(
        "COMMERCIAL_AUTO",
        commercialAuto ? ComplianceConstants.REQUIRED : ComplianceConstants.OPTIONAL);
    map.put(
        "UMBRELLA_EXCESS",
        ComplianceConstants.LEVEL_2.equals(tier)
            ? ComplianceConstants.REQUIRED
            : ComplianceConstants.NOT_APPLICABLE);

    // Baseline required set when application is empty (new contractors).
    if (!StringUtils.hasText(user.getContractorApplication())) {
      map.put("W9", ComplianceConstants.REQUIRED);
      map.put("TRADE_LICENSE", ComplianceConstants.REQUIRED);
      map.put("GENERAL_LIABILITY_COI", ComplianceConstants.REQUIRED);
    }

    if (ComplianceConstants.LEVEL_2.equals(tier) && gl) {
      map.put("PRIMARY_NON_CONTRIBUTORY", ComplianceConstants.REQUIRED);
      map.put("GL_WAIVER_SUBROGATION", ComplianceConstants.REQUIRED);
      map.put("AI_COMPLETED_OPS", ComplianceConstants.REQUIRED);
      map.put("UMBRELLA_EXCESS", ComplianceConstants.REQUIRED);
    }
    return map;
  }

  private List<ContractorComplianceDocumentEntity> ensureDocuments(UserEntity user) {
    Long id = user.getId();
    Map<String, String> applicability = computeApplicability(user, ComplianceConstants.LEVEL_1);
    Map<String, String[]> legacy =
        Map.of(
            "W9", new String[] {user.getW9DocumentName(), user.getW9DocumentData()},
            "TRADE_LICENSE", new String[] {user.getLicenseDocumentName(), user.getLicenseDocumentData()},
            "GENERAL_LIABILITY_COI",
                new String[] {user.getInsuranceDocumentName(), user.getInsuranceDocumentData()});

    for (String type : ComplianceConstants.DOCUMENT_TYPE_CODES) {
      if (documentRepository.findByContractorUserIdAndDocumentTypeAndCurrentTrue(id, type).isPresent()) {
        continue;
      }
      ContractorComplianceDocumentEntity row = newDoc(id, type, applicability.get(type));
      String[] leg = legacy.get(type);
      if (leg != null && StringUtils.hasText(leg[1])) {
        row.setFileName(leg[0]);
        row.setFileData(leg[1]);
        row.setUploadedAt(OffsetDateTime.now());
        if ("approved".equalsIgnoreCase(String.valueOf(user.getComplianceStatus()))) {
          row.setStatus(ComplianceConstants.VERIFIED);
          row.setVerifiedAt(OffsetDateTime.now());
        } else {
          row.setStatus(ComplianceConstants.UNDER_REVIEW);
        }
        if ("TRADE_LICENSE".equals(type) && user.getLicenseExpiresAt() != null) {
          row.setExpirationDate(user.getLicenseExpiresAt());
        }
        if ("GENERAL_LIABILITY_COI".equals(type) && user.getInsuranceExpiresAt() != null) {
          row.setExpirationDate(user.getInsuranceExpiresAt());
        }
      } else if (ComplianceConstants.NOT_APPLICABLE.equals(applicability.get(type))) {
        row.setStatus(ComplianceConstants.NOT_APPLICABLE);
      } else {
        row.setStatus(ComplianceConstants.MISSING);
      }
      documentRepository.save(row);
    }
    return documentRepository.findByContractorUserIdAndCurrentTrueOrderByDocumentTypeAsc(id);
  }

  private void upsertLegacy(
      UserEntity user, String type, String fileName, String fileData, LocalDate expirationDate) {
    switch (type) {
      case "W9" -> {
        user.setW9DocumentName(fileName);
        user.setW9DocumentData(fileData);
      }
      case "TRADE_LICENSE" -> {
        user.setLicenseDocumentName(fileName);
        user.setLicenseDocumentData(fileData);
        if (expirationDate != null) {
          user.setLicenseExpiresAt(expirationDate);
        }
      }
      case "GENERAL_LIABILITY_COI" -> {
        user.setInsuranceDocumentName(fileName);
        user.setInsuranceDocumentData(fileData);
        if (expirationDate != null) {
          user.setInsuranceExpiresAt(expirationDate);
        }
      }
      default -> {
        return;
      }
    }
    userRepository.save(user);
  }

  private Map<String, Object> serializeDoc(
      ContractorComplianceDocumentEntity row, String applicability, String type) {
    Map<String, Object> meta = ComplianceConstants.DOCUMENT_TYPES.get(type);
    String status = deriveStatus(row, applicability);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("documentType", type);
    out.put("label", meta != null ? meta.get("label") : type);
    out.put("applicability", applicability);
    out.put("status", status);
    out.put("uploadLater", row != null && Boolean.TRUE.equals(row.getUploadLater()));
    out.put("fileName", row != null ? row.getFileName() : null);
    out.put("hasFile", row != null && StringUtils.hasText(row.getFileData()));
    out.put("issueDate", row != null && row.getIssueDate() != null ? row.getIssueDate().toString() : null);
    out.put(
        "expirationDate",
        row != null && row.getExpirationDate() != null ? row.getExpirationDate().toString() : null);
    out.put("daysUntilExpiry", daysUntil(row != null ? row.getExpirationDate() : null));
    out.put("policyCarrier", row != null ? row.getPolicyCarrier() : null);
    out.put("policyNumber", row != null ? row.getPolicyNumber() : null);
    out.put("uploadedAt", row != null ? row.getUploadedAt() : null);
    out.put("verifiedAt", row != null ? row.getVerifiedAt() : null);
    out.put("verifiedBy", row != null ? row.getVerifiedBy() : null);
    out.put("rejectionReason", row != null ? row.getRejectionReason() : null);
    out.put("notes", row != null ? row.getNotes() : null);
    out.put("version", row != null && row.getVersion() != null ? row.getVersion() : 1);
    out.put("id", row != null ? row.getId() : null);
    return out;
  }

  private String deriveStatus(ContractorComplianceDocumentEntity row, String applicability) {
    if (ComplianceConstants.NOT_APPLICABLE.equals(applicability)) {
      return ComplianceConstants.NOT_APPLICABLE;
    }
    if (row == null) {
      return ComplianceConstants.MISSING;
    }
    if (Boolean.TRUE.equals(row.getUploadLater()) && !StringUtils.hasText(row.getFileData())) {
      return ComplianceConstants.MISSING;
    }
    if (ComplianceConstants.REJECTED.equals(row.getStatus())) {
      return ComplianceConstants.REJECTED;
    }
    if (ComplianceConstants.VERIFIED.equals(row.getStatus())) {
      if (isExpired(row.getExpirationDate())) {
        return ComplianceConstants.EXPIRED;
      }
      return ComplianceConstants.VERIFIED;
    }
    if (StringUtils.hasText(row.getFileData())) {
      if (isExpired(row.getExpirationDate())) {
        return ComplianceConstants.EXPIRED;
      }
      if (ComplianceConstants.UNDER_REVIEW.equals(row.getStatus())
          || ComplianceConstants.UPLOADED.equals(row.getStatus())) {
        return row.getStatus();
      }
      return ComplianceConstants.UNDER_REVIEW;
    }
    return ComplianceConstants.MISSING;
  }

  private Map<String, Object> historyRow(ContractorComplianceDocumentEntity row) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", row.getId());
    out.put("documentType", row.getDocumentType());
    out.put("status", row.getStatus());
    out.put("fileName", row.getFileName());
    out.put("issueDate", row.getIssueDate());
    out.put("expirationDate", row.getExpirationDate());
    out.put("uploadedAt", row.getUploadedAt());
    out.put("verifiedAt", row.getVerifiedAt());
    out.put("verifiedBy", row.getVerifiedBy());
    out.put("rejectedAt", row.getRejectedAt());
    out.put("rejectedBy", row.getRejectedBy());
    out.put("rejectionReason", row.getRejectionReason());
    out.put("version", row.getVersion());
    out.put("isCurrent", row.getCurrent());
    out.put("notes", row.getNotes());
    out.put("createdAt", row.getCreatedAt());
    return out;
  }

  private void recordEvent(
      Long contractorUserId, String documentType, String action, Long actorUserId, Map<String, ?> metadata) {
    ContractorComplianceEventEntity event = new ContractorComplianceEventEntity();
    event.setContractorUserId(contractorUserId);
    event.setDocumentType(documentType);
    event.setAction(action);
    event.setActorUserId(actorUserId);
    if (metadata != null) {
      try {
        event.setMetadata(objectMapper.writeValueAsString(metadata));
      } catch (Exception ignored) {
        event.setMetadata(String.valueOf(metadata));
      }
    }
    eventRepository.save(event);
  }

  private ContractorComplianceDocumentEntity newDoc(Long contractorUserId, String type, String applicability) {
    ContractorComplianceDocumentEntity row = new ContractorComplianceDocumentEntity();
    row.setContractorUserId(contractorUserId);
    row.setDocumentType(type);
    row.setApplicability(applicability != null ? applicability : ComplianceConstants.OPTIONAL);
    row.setStatus(ComplianceConstants.MISSING);
    row.setCurrent(true);
    row.setVersion(1);
    return row;
  }

  private UserEntity requireContractor(Long contractorUserId) {
    UserEntity user =
        userRepository
            .findById(contractorUserId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Contractor not found."));
    if (!"contractor".equals(user.getRole())) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Contractor not found.");
    }
    return user;
  }

  public static String resolveTier(ManagedJobEntity job) {
    if (job == null) {
      return ComplianceConstants.LEVEL_1;
    }
    String priority =
        job.getPriorityTier() == null ? "standard" : job.getPriorityTier().toLowerCase(Locale.ROOT);
    if (List.of("emergency", "homecare_pro", "homecare_pro_high", "facility", "managed").contains(priority)) {
      return ComplianceConstants.LEVEL_2;
    }
    String mode = job.getJobMode() == null ? "" : job.getJobMode().toLowerCase(Locale.ROOT);
    if ("facility".equals(mode) || "emergency".equals(mode)) {
      return ComplianceConstants.LEVEL_2;
    }
    return ComplianceConstants.LEVEL_1;
  }

  private JsonNode parseApplication(UserEntity user) {
    if (!StringUtils.hasText(user.getContractorApplication())) {
      return objectMapper.createObjectNode();
    }
    try {
      return objectMapper.readTree(user.getContractorApplication());
    } catch (Exception e) {
      return objectMapper.createObjectNode();
    }
  }

  private static String normalizeType(String type) {
    return String.valueOf(type == null ? "" : type).trim().toUpperCase(Locale.ROOT);
  }

  private static boolean isExpired(LocalDate date) {
    return date != null && date.isBefore(LocalDate.now());
  }

  private static Integer daysUntil(LocalDate date) {
    if (date == null) {
      return null;
    }
    return (int) ChronoUnit.DAYS.between(LocalDate.now(), date);
  }

  private static String text(JsonNode node, String field) {
    if (node == null || !node.has(field) || node.get(field).isNull()) {
      return "";
    }
    return node.get(field).asText("").trim();
  }

  private static double parseDouble(String value) {
    try {
      return Double.parseDouble(value);
    } catch (Exception e) {
      return Double.NaN;
    }
  }

  private static boolean isFiniteNumber(String value) {
    double v = parseDouble(value);
    return !Double.isNaN(v) && !Double.isInfinite(v);
  }
}
