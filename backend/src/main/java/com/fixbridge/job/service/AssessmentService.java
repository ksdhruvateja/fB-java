package com.fixbridge.job.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.job.mapper.ManagedJobMapper;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.security.authorization.ManagedJobAccess;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class AssessmentService {

  public static final Map<String, String> ERROR_MESSAGES =
      Map.of(
          "AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE",
          "We couldn't finish the assessment right now. Please try again in a moment.",
          "AI_ASSESSMENT_FAILED",
          "We couldn't finish the assessment right now. Please try again.",
          "AI_TIMEOUT",
          "The assessment took too long. Try a smaller photo or continue your request.",
          "WORKER_UNAVAILABLE",
          "We're preparing your assessment. Please wait a moment and try again.");

  private final ManagedJobRepository managedJobRepository;
  private final ManagedJobMapper managedJobMapper;
  private final AssessmentWorkerService assessmentWorkerService;

  public AssessmentService(
      ManagedJobRepository managedJobRepository,
      ManagedJobMapper managedJobMapper,
      AssessmentWorkerService assessmentWorkerService) {
    this.managedJobRepository = managedJobRepository;
    this.managedJobMapper = managedJobMapper;
    this.assessmentWorkerService = assessmentWorkerService;
  }

  @Transactional
  public ResponseEntity<Map<String, Object>> startAssessment(Long jobId, Map<String, Object> body) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job =
        managedJobRepository
            .findById(jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
    assertOwnerOrAdmin(job, principal);

    boolean force = Boolean.TRUE.equals(body != null ? body.get("force") : null);
    String currentStatus = resolveAssessmentStatus(job);
    if ("ready".equals(currentStatus) && !force) {
      Map<String, Object> resp = new LinkedHashMap<>();
      resp.put("ok", true);
      resp.put("status", "ready");
      resp.put("assessmentStatus", "ready");
      resp.put("job", managedJobMapper.toDto(job, principal));
      return ResponseEntity.ok(resp);
    }
    if ("processing".equals(currentStatus) && !force) {
      Map<String, Object> resp = new LinkedHashMap<>();
      resp.put("ok", true);
      resp.put("status", "processing");
      resp.put("assessmentStatus", "processing");
      resp.put("jobId", jobId);
      resp.put("message", "Assessment is still processing.");
      return ResponseEntity.status(HttpStatus.ACCEPTED).body(resp);
    }

    String invocationId = firstString(body, "assessmentInvocationId", "invocationId");
    if (!StringUtils.hasText(invocationId)) {
      Map<String, Object> resp = new LinkedHashMap<>();
      resp.put("ok", false);
      resp.put("code", "AI_ASSESSMENT_ACK_REQUIRED");
      resp.put("message", "AI assessment acknowledgment is required before continuing.");
      return ResponseEntity.badRequest().body(resp);
    }

    ManagedJobEntity claimed = claimProcessing(job, force);
    if (claimed == null) {
      Map<String, Object> resp = new LinkedHashMap<>();
      resp.put("ok", true);
      resp.put("status", "processing");
      resp.put("assessmentStatus", "processing");
      resp.put("jobId", jobId);
      resp.put("message", "Assessment is already in progress.");
      return ResponseEntity.status(HttpStatus.ACCEPTED).body(resp);
    }

    assessmentWorkerService.processAsync(jobId, principal.getId());

    Map<String, Object> resp = new LinkedHashMap<>();
    resp.put("ok", true);
    resp.put("status", "processing");
    resp.put("assessmentStatus", "processing");
    resp.put("jobId", jobId);
    resp.put("message", "Assessment started.");
    return ResponseEntity.status(HttpStatus.ACCEPTED).body(resp);
  }

  @Transactional(readOnly = true)
  public Map<String, Object> assessmentStatus(Long jobId) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job =
        managedJobRepository
            .findById(jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
    assertOwnerOrAdmin(job, principal);

    String status = resolveAssessmentStatus(job);
    String errorCode = job.getAssessmentErrorCode();
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("ok", true);
    payload.put("status", status);
    payload.put("assessmentStatus", status);
    payload.put("jobId", jobId);
    payload.put("errorCode", errorCode);
    if ("failed".equals(status)) {
      payload.put(
          "message",
          ERROR_MESSAGES.getOrDefault(
              errorCode, ERROR_MESSAGES.get("AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE")));
    }
    if ("ready".equals(status)) {
      payload.put("job", managedJobMapper.toDto(job, principal));
      if (job.getPricing() != null && !job.getPricing().isNull()) {
        Map<String, Object> pricing = new LinkedHashMap<>();
        pricing.put("showPrice", job.getShowRetailPrice() == null || job.getShowRetailPrice());
        pricing.put("message", textOrNull(job.getPricing().path("message")));
        pricing.put("customerRetailEstimateLow", job.getCustomerRetailEstimateLow());
        pricing.put("customerRetailEstimateHigh", job.getCustomerRetailEstimateHigh());
        pricing.put("disclaimer", textOrNull(job.getPricing().path("disclaimer")));
        payload.put("pricing", pricing);
      }
    }
    return payload;
  }

  private ManagedJobEntity claimProcessing(ManagedJobEntity job, boolean force) {
    String status =
        String.valueOf(job.getAssessmentStatus() == null ? "" : job.getAssessmentStatus())
            .toLowerCase(Locale.ROOT);
    OffsetDateTime started = job.getAssessmentStartedAt();
    boolean stale =
        "processing".equals(status)
            && started != null
            && started.isBefore(OffsetDateTime.now().minusMinutes(12));
    if (!force && "processing".equals(status) && !stale) {
      return null;
    }
    job.setAssessmentStatus("processing");
    job.setAssessmentStartedAt(OffsetDateTime.now());
    job.setAssessmentCompletedAt(null);
    job.setAssessmentErrorCode(null);
    job.setAssessmentAttempts(
        (job.getAssessmentAttempts() == null ? 0 : job.getAssessmentAttempts()) + 1);
    if ("draft".equalsIgnoreCase(job.getStatus())) {
      job.setStatus("assessing");
    }
    return managedJobRepository.save(job);
  }

  public static String resolveAssessmentStatus(ManagedJobEntity job) {
    if (job == null) {
      return "pending";
    }
    String stored =
        job.getAssessmentStatus() == null ? "" : job.getAssessmentStatus().toLowerCase(Locale.ROOT);
    if ("failed".equals(stored)) {
      return "failed";
    }
    JsonNode assessment = job.getAiAssessment();
    boolean hasAssessment =
        assessment != null && !assessment.isNull() && !(assessment.isObject() && assessment.isEmpty());
    if (hasAssessment || "ready".equals(stored)) {
      return "ready";
    }
    if ("processing".equals(stored)) {
      return "processing";
    }
    return stored.isBlank() ? "pending" : stored;
  }

  private static void assertOwnerOrAdmin(ManagedJobEntity job, UserPrincipal principal) {
    if (ManagedJobAccess.isAdminRole(principal)
        || ManagedJobAccess.isHomeownerOwner(principal, job.getHomeownerUserId())) {
      return;
    }
    throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
  }

  private static String firstString(Map<String, Object> body, String... keys) {
    if (body == null) {
      return "";
    }
    for (String key : keys) {
      Object v = body.get(key);
      if (v != null && StringUtils.hasText(String.valueOf(v))) {
        return String.valueOf(v).trim();
      }
    }
    return "";
  }

  private static String textOrNull(JsonNode node) {
    if (node == null || node.isNull() || !node.isTextual()) {
      return null;
    }
    return node.asText();
  }
}
