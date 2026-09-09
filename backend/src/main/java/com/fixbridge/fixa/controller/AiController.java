package com.fixbridge.fixa.controller;

import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.fixa.service.FixaService;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.security.authorization.ManagedJobAccess;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AiController {

  private final FixaService fixaService;
  private final ManagedJobRepository managedJobRepository;

  public AiController(FixaService fixaService, ManagedJobRepository managedJobRepository) {
    this.fixaService = fixaService;
    this.managedJobRepository = managedJobRepository;
  }

  @GetMapping({"/api/ai/status", "/api/fixera/status", "/api/fixa/status"})
  public Map<String, Object> status() {
    return fixaService.status();
  }

  @PostMapping({"/api/fixera/assessment", "/api/fixa/assessment", "/api/ai/assess"})
  public ResponseEntity<Map<String, Object>> assessment(
      @RequestBody(required = false) Map<String, Object> body) {
    SecurityUtils.requirePrincipal();
    String invocationId = firstString(body, "assessmentInvocationId", "invocationId");
    if (!StringUtils.hasText(invocationId)) {
      Map<String, Object> err = new LinkedHashMap<>();
      err.put("ok", false);
      err.put("code", "AI_ASSESSMENT_ACK_REQUIRED");
      err.put("message", "AI assessment acknowledgment is required before continuing.");
      return ResponseEntity.badRequest().body(err);
    }

    String category = firstString(body, "category");
    String description = firstString(body, "description");
    String imageDataUrl = firstString(body, "imageDataUrl");
    String mode = firstString(body, "mode");

    Map<String, Object> result =
        fixaService.assessRepair(category, description, imageDataUrl, null);
    result.put("mode", "detail".equalsIgnoreCase(mode) ? "detail" : "summary");
    if (result.get("assessment") == null && "category and either a description or a photo are required.".equals(result.get("error"))) {
      return ResponseEntity.badRequest().body(result);
    }
    if (result.get("assessment") == null && "Image is too large.".equals(result.get("error"))) {
      return ResponseEntity.badRequest().body(result);
    }
    return ResponseEntity.ok(result);
  }

  @PostMapping({"/api/fixera/chat", "/api/fixa/chat", "/api/ai/chat"})
  public Map<String, Object> chat(@RequestBody(required = false) Map<String, Object> body) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    if (body == null || !(body.get("messages") instanceof List<?> rawMessages) || rawMessages.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "messages array is required.");
    }
    if (rawMessages.size() > 40) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Too many messages in request.");
    }

    List<Map<String, String>> normalized = new ArrayList<>();
    for (Object item : rawMessages) {
      if (!(item instanceof Map<?, ?> m)) {
        continue;
      }
      Object role = m.get("role");
      Object content = m.get("content");
      if (role == null || content == null) {
        continue;
      }
      String roleStr = String.valueOf(role);
      String contentStr = String.valueOf(content);
      if (("user".equals(roleStr) || "assistant".equals(roleStr)) && StringUtils.hasText(contentStr)) {
        Map<String, String> msg = new LinkedHashMap<>();
        msg.put("role", roleStr);
        msg.put(
            "content",
            contentStr.length() > 4000 ? contentStr.substring(0, 4000) : contentStr.trim());
        normalized.add(msg);
      }
    }
    if (normalized.size() > 20) {
      normalized = normalized.subList(normalized.size() - 20, normalized.size());
    }
    if (normalized.stream().noneMatch(m -> "user".equals(m.get("role")))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "At least one user message is required.");
    }

    String riskLevel = "green";
    com.fasterxml.jackson.databind.JsonNode assessment = null;
    if (body.get("jobId") != null && "homeowner".equals(principal.getRole())) {
      Long jobId;
      try {
        jobId = Long.valueOf(String.valueOf(body.get("jobId")));
      } catch (NumberFormatException e) {
        throw new ApiException(HttpStatus.NOT_FOUND, "Job not found.");
      }
      ManagedJobEntity job =
          managedJobRepository
              .findById(jobId)
              .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
      if (!ManagedJobAccess.isHomeownerOwner(principal, job.getHomeownerUserId())) {
        throw new ApiException(HttpStatus.NOT_FOUND, "Job not found.");
      }
      riskLevel = job.getDiyRiskLevel() != null ? job.getDiyRiskLevel() : "green";
      assessment = job.getAiAssessment();
    }

    return fixaService.chat(normalized, riskLevel, assessment);
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
}
