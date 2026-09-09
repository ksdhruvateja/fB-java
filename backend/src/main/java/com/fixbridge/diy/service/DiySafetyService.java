package com.fixbridge.diy.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.diy.entity.DiySafetyEventEntity;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.diy.repository.DiySafetyEventRepository;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.security.authorization.ManagedJobAccess;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class DiySafetyService {

  private static final Set<String> FEEDBACK_RATINGS = Set.of("helpful", "not_helpful", "unsafe");
  private static final Set<String> INCIDENT_TYPES =
      Set.of(
          "safety_concern",
          "injury",
          "property_damage",
          "gas_event",
          "electrical_event",
          "fire_smoke",
          "water_damage",
          "biohazard",
          "other_serious");

  private final DiySafetyEventRepository diySafetyEventRepository;
  private final ManagedJobRepository managedJobRepository;
  private final ObjectMapper objectMapper;

  public DiySafetyService(
      DiySafetyEventRepository diySafetyEventRepository,
      ManagedJobRepository managedJobRepository,
      ObjectMapper objectMapper) {
    this.diySafetyEventRepository = diySafetyEventRepository;
    this.managedJobRepository = managedJobRepository;
    this.objectMapper = objectMapper;
  }

  /** Records DIY session start (consent / guided DIY begin). */
  @Transactional
  public Map<String, Object> start(Map<String, Object> body, HttpServletRequest request) {
    UserPrincipal principal = requireHomeownerOrAdmin();
    Long jobId = parseJobId(body);
    if (jobId != null) {
      assertJobAccess(jobId, principal);
    }
    DiySafetyEventEntity event =
        record(
            principal.getId(),
            jobId,
            "diy_session_start",
            body != null ? stringVal(body.get("riskLevel")) : null,
            null,
            null,
            null,
            null,
            meta(body, "source", "diy_start"),
            request);
    Map<String, Object> resp = new LinkedHashMap<>();
    resp.put("ok", true);
    resp.put("eventId", event.getId());
    resp.put("createdAt", event.getCreatedAt());
    resp.put("message", "DIY safety session started.");
    return resp;
  }

  @Transactional
  public Map<String, Object> feedback(Map<String, Object> body, HttpServletRequest request) {
    UserPrincipal principal = requireHomeownerOrAdmin();
    String rating =
        body == null ? "" : clamp(stringVal(body.get("rating")), 40).toLowerCase(Locale.ROOT);
    if (!FEEDBACK_RATINGS.contains(rating)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid feedback rating.");
    }
    Long jobId = parseJobId(body);
    if (jobId != null) {
      ManagedJobEntity job = assertJobAccess(jobId, principal);
      if ("unsafe".equals(rating)) {
        job.setDiyRiskLevel("yellow");
        managedJobRepository.save(job);
      }
    }
    ObjectNode metadata = objectMapper.createObjectNode();
    if (body != null) {
      if (body.get("messageIndex") != null) {
        metadata.putPOJO("messageIndex", body.get("messageIndex"));
      }
      String excerpt = clamp(stringVal(body.get("chatExcerpt")), 500);
      if (StringUtils.hasText(excerpt)) {
        metadata.put("chatExcerpt", excerpt);
      }
    }
    String eventType = "unsafe".equals(rating) ? "unsafe_feedback" : "ai_feedback";
    DiySafetyEventEntity event =
        record(
            principal.getId(),
            jobId,
            eventType,
            body != null ? stringVal(body.get("riskLevel")) : null,
            null,
            rating,
            null,
            body != null ? clamp(stringVal(body.get("message")), 4000) : null,
            metadata,
            request);
    Map<String, Object> resp = new LinkedHashMap<>();
    resp.put("ok", true);
    resp.put("eventId", event.getId());
    resp.put("createdAt", event.getCreatedAt());
    return resp;
  }

  @Transactional
  public Map<String, Object> stop(Map<String, Object> body, HttpServletRequest request) {
    UserPrincipal principal = requireHomeownerOrAdmin();
    Long jobId = parseJobId(body);
    if (jobId == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "jobId is required.");
    }
    ManagedJobEntity job = assertJobAccess(jobId, principal);
    ObjectNode metadata = objectMapper.createObjectNode();
    metadata.put("source", "stop_diy_button");
    record(
        principal.getId(),
        jobId,
        "professional_escalation",
        "yellow",
        job.getDiyRiskLevel(),
        null,
        null,
        null,
        metadata,
        request);
    Map<String, Object> resp = new LinkedHashMap<>();
    resp.put("ok", true);
    resp.put("message", "Professional escalation recorded.");
    return resp;
  }

  @Transactional
  public Map<String, Object> incident(Map<String, Object> body, HttpServletRequest request) {
    UserPrincipal principal = requireHomeownerOrAdmin();
    String incidentType =
        body == null
            ? ""
            : clamp(stringVal(body.get("incidentType")), 60).toLowerCase(Locale.ROOT);
    if (!INCIDENT_TYPES.contains(incidentType)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid incident type.");
    }
    String description = body == null ? "" : clamp(stringVal(body.get("description")), 4000);
    if (!StringUtils.hasText(description)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Description is required.");
    }
    Long jobId = parseJobId(body);
    if (jobId != null) {
      assertJobAccess(jobId, principal);
    }
    ObjectNode metadata = objectMapper.createObjectNode();
    metadata.put("status", "open");
    DiySafetyEventEntity event =
        record(
            principal.getId(),
            jobId,
            "incident_report",
            null,
            null,
            null,
            incidentType,
            description,
            metadata,
            request);
    Map<String, Object> resp = new LinkedHashMap<>();
    resp.put("ok", true);
    resp.put("eventId", event.getId());
    resp.put("createdAt", event.getCreatedAt());
    return resp;
  }

  private DiySafetyEventEntity record(
      Long userId,
      Long jobId,
      String eventType,
      String riskLevel,
      String previousRiskLevel,
      String feedbackRating,
      String incidentType,
      String description,
      ObjectNode metadata,
      HttpServletRequest request) {
    DiySafetyEventEntity event = new DiySafetyEventEntity();
    event.setUserId(userId);
    event.setJobId(jobId);
    event.setEventType(eventType);
    event.setRiskLevel(riskLevel);
    event.setPreviousRiskLevel(previousRiskLevel);
    event.setFeedbackRating(feedbackRating);
    event.setIncidentType(incidentType);
    event.setDescription(description);
    event.setMetadata(metadata);
    if (request != null) {
      String forwarded = request.getHeader("X-Forwarded-For");
      event.setIpAddress(
          StringUtils.hasText(forwarded)
              ? forwarded.split(",")[0].trim()
              : request.getRemoteAddr());
      event.setUserAgent(request.getHeader("User-Agent"));
      event.setSourceRoute(request.getRequestURI());
    }
    return diySafetyEventRepository.save(event);
  }

  private UserPrincipal requireHomeownerOrAdmin() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    if (!"homeowner".equals(principal.getRole()) && !"admin".equals(principal.getRole())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Homeowners only.");
    }
    return principal;
  }

  private ManagedJobEntity assertJobAccess(Long jobId, UserPrincipal principal) {
    ManagedJobEntity job =
        managedJobRepository
            .findById(jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
    if (!ManagedJobAccess.isAdminRole(principal)
        && !ManagedJobAccess.isHomeownerOwner(principal, job.getHomeownerUserId())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }
    return job;
  }

  private static Long parseJobId(Map<String, Object> body) {
    if (body == null || body.get("jobId") == null) {
      return null;
    }
    try {
      return Long.valueOf(String.valueOf(body.get("jobId")));
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private ObjectNode meta(Map<String, Object> body, String key, String defaultValue) {
    ObjectNode metadata = objectMapper.createObjectNode();
    metadata.put(key, body != null && body.get(key) != null ? String.valueOf(body.get(key)) : defaultValue);
    return metadata;
  }

  private static String stringVal(Object value) {
    return value == null ? "" : String.valueOf(value);
  }

  private static String clamp(String value, int max) {
    if (value == null) {
      return "";
    }
    String trimmed = value.trim();
    return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
  }
}
