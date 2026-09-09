package com.fixbridge.fixa.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.fixbridge.fixa.dto.response.AssessmentResult;
import com.fixbridge.fixa.provider.common.AiCompletionResult;
import com.fixbridge.fixa.provider.common.AiProvider;
import com.fixbridge.fixa.provider.experientiallabs.ExplabsProvider;
import com.fixbridge.fixa.router.AiProviderRouter;
@Service
public class FixaService {

  public static final String HOMEOWNER_AI_ERROR =
      "We couldn't complete the assessment right now. Please try again.";
  public static final String CHAT_ERROR =
      "We couldn't complete that reply right now. Please try again.";

  private static final String STRUCTURED_PROMPT =
      """
      You are an experienced home-repair technician guiding a homeowner remotely. Inspect any attached photo carefully.
      Return ONLY valid JSON with this exact schema (no prices, no dollar amounts, no markdown):
      {
        "category": "plumbing|electrical|hvac|painting|roofing|flooring|carpentry|snow_removal|landscaping|cleaning|others",
        "summary": "1-2 short sentences naming the visible system and likely issue",
        "urgency": "low|medium|high|emergency",
        "confidence": 0.0,
        "recommended_trade": "licensed_plumber|electrician|hvac_tech|painter|roofer|flooring_tech|carpenter|handyman",
        "professional_required": true,
        "safe_diy_allowed": false,
        "immediate_safety_steps": ["step"],
        "visual_findings": ["Observed: exact thing visible"],
        "observed_evidence": ["Observed: only what is actually visible"],
        "likely_causes": ["Likely: probable cause"],
        "needs_confirmation": ["Needs confirmation: what to check next"],
        "estimated_labor_hours_min": 1,
        "estimated_labor_hours_max": 3,
        "estimated_time": "20-40 minutes",
        "complexity": "low|medium|high",
        "service_type": "diagnostic|minor_repair|standard_repair|major_repair|replacement|installation|maintenance|emergency",
        "service_subcategory": "specific subtype",
        "problem_classification": "short label",
        "questions_needed": [],
        "diy_difficulty": "easy|moderate|hard|blocked",
        "tools_required": ["named tool"],
        "materials_needed": ["named material or none"],
        "preparation_steps": ["what to have ready"],
        "diy_guide_steps": [],
        "completion_checks": ["how to confirm the issue is gone"],
        "diy_steps": ["one-line title of each guide step"],
        "stop_conditions": ["when to call a pro"],
        "disclaimer": "AI-assisted assessment, not a professional diagnosis."
      }
      Rules:
      - Never invent prices or cost ranges.
      - Do not invent damage that is not visible or reasonably implied.
      - Set safe_diy_allowed=false for gas, major electrical, flooding, sewage, fire/smoke/CO, or structural risks.
      """;

  private static final Pattern DIY_BLOCK =
      Pattern.compile(
          "gas\\s*leak|natural\\s*gas|high\\s*voltage|main\\s*panel|flood|sewage|sewer\\s*backup|fire|smoke|carbon\\s*monoxide|\\bCO\\b|structural|load[- ]bearing|foundation|asbestos|lead\\s*paint",
          Pattern.CASE_INSENSITIVE);

  private final AiProviderRouter aiProviderRouter;
  private final ObjectMapper objectMapper;

  public FixaService(AiProviderRouter aiProviderRouter, ObjectMapper objectMapper) {
    this.aiProviderRouter = aiProviderRouter;
    this.objectMapper = objectMapper;
  }

  /** Public Fixera / Fixa status payload matching Express getFixaPublicStatus(). */
  public Map<String, Object> status() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("assistant", "Fixera");
    AiProvider active = aiProviderRouter.resolve();
    body.put("configured", aiProviderRouter.isConfigured());
    body.put("provider", active.getId());
    body.put("model", active.status().getOrDefault("model", ExplabsProvider.MODEL));
    body.put("providers", aiProviderRouter.status().get("providers"));
    return body;
  }

  public Map<String, Object> assessRepair(
      String category, String description, String imageDataUrl, String locationContext) {
    if (!aiProviderRouter.isConfigured()) {
      return assessmentError(HOMEOWNER_AI_ERROR);
    }

    String cat = clamp(category, 80);
    String desc = clamp(description, 4000);
    boolean hasImage = imageDataUrl != null && imageDataUrl.startsWith("data:");
    if (!StringUtils.hasText(cat) || (!StringUtils.hasText(desc) && !hasImage)) {
      return assessmentError("category and either a description or a photo are required.");
    }
    if (hasImage && imageDataUrl.length() > 6_000_000) {
      return assessmentError("Image is too large.");
    }

    List<Map<String, Object>> messages = new ArrayList<>();
    messages.add(Map.of("role", "system", "content", STRUCTURED_PROMPT));

    StringBuilder userText = new StringBuilder();
    userText.append("Category: ").append(cat).append('\n');
    userText
        .append("Description: ")
        .append(
            StringUtils.hasText(desc)
                ? desc
                : "No written description provided. Analyze the attached photo and infer the repair issue.")
        .append('\n');
    if (StringUtils.hasText(locationContext)) {
      userText.append("Location context:\n").append(clamp(locationContext, 2000)).append('\n');
    }

    if (hasImage && imageDataUrl.length() <= 1_500_000) {
      List<Map<String, Object>> content = new ArrayList<>();
      content.add(Map.of("type", "text", "text", userText.toString()));
      content.add(
          Map.of(
              "type",
              "image_url",
              "image_url",
              Map.of("url", imageDataUrl)));
      Map<String, Object> userMsg = new LinkedHashMap<>();
      userMsg.put("role", "user");
      userMsg.put("content", content);
      messages.add(userMsg);
    } else {
      if (hasImage) {
        userText.append(
            "\n(Note: the uploaded photo could not be sent to the model. Do not claim you inspected a photo.)");
      }
      messages.add(Map.of("role", "user", "content", userText.toString()));
    }

    AiCompletionResult completion = aiProviderRouter.complete(messages, 0.2, 2500, true);
    if (!completion.ok()) {
      return assessmentError(HOMEOWNER_AI_ERROR);
    }

    JsonNode assessment = parseAssessment(completion.text(), cat, desc);
    if (assessment == null) {
      return assessmentError(HOMEOWNER_AI_ERROR);
    }
    assessment = applyDiySafetyRules(assessment, desc);
    AssessmentResult structuredResult = AssessmentResult.fromStructured(assessment, completion.model());
    structuredResult.setSource(aiProviderRouter.resolve().getId());

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("assessment", toLegacyUiAssessment(assessment));
    body.put("source", "fixera");
    body.put("assistant", "Fixera");
    body.put("model", completion.model());
    body.put("structured", assessment);
    body.put("assessmentResult", structuredResult.toMap());
    body.put("safety", structuredResult.getSafety().name());
    return body;
  }

  public Map<String, Object> chat(
      List<Map<String, String>> messages, String riskLevel, JsonNode assessment) {
    if (!aiProviderRouter.isConfigured()) {
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("reply", CHAT_ERROR);
      body.put("source", "fallback");
      body.put("assistant", "Fixera");
      body.put("riskLevel", riskLevel == null ? "green" : riskLevel);
      return body;
    }

    String risk = riskLevel == null ? "green" : riskLevel.toLowerCase(Locale.ROOT);
    String systemPrompt =
        switch (risk) {
          case "red" ->
              "You are Fixera. Refuse DIY steps. Tell the homeowner to stop and hire a licensed professional or call emergency services if needed.";
          case "yellow" ->
              "You are Fixera. Keep DIY guidance cautious. Prefer stopping and booking a professional when unsure.";
          default ->
              "You are Fixera, a FixBridge home-repair assistant. Give clear, safe DIY guidance. Never invent prices. Escalate to a professional for gas, electrical panel, flooding, or structural risks.";
        };

    List<Map<String, Object>> apiMessages = new ArrayList<>();
    apiMessages.add(Map.of("role", "system", "content", systemPrompt));
    if (assessment != null && !assessment.isNull()) {
      apiMessages.add(
          Map.of(
              "role",
              "system",
              "content",
              "Prior assessment JSON (do not invent prices): " + assessment.toString()));
    }
    for (Map<String, String> m : messages) {
      if (m == null) {
        continue;
      }
      String role = m.get("role");
      String content = m.get("content");
      if (("user".equals(role) || "assistant".equals(role)) && StringUtils.hasText(content)) {
        apiMessages.add(Map.of("role", role, "content", clamp(content, 4000)));
      }
    }

    AiCompletionResult completion = aiProviderRouter.complete(apiMessages, 0.4, 1200, false);
    Map<String, Object> body = new LinkedHashMap<>();
    if (!completion.ok() || !StringUtils.hasText(completion.text())) {
      body.put("reply", null);
      body.put("source", "error");
      body.put("assistant", "Fixera");
      body.put("error", CHAT_ERROR);
      body.put("riskLevel", risk);
      return body;
    }
    body.put("reply", completion.text().trim());
    body.put("source", "experiential-labs");
    body.put("assistant", "Fixera");
    body.put("riskLevel", risk);
    return body;
  }

  public JsonNode structuredFromResult(Map<String, Object> result) {
    Object structured = result.get("structured");
    if (structured instanceof JsonNode node) {
      return node;
    }
    Object assessment = result.get("assessment");
    if (assessment instanceof JsonNode node) {
      return node;
    }
    if (assessment instanceof Map<?, ?> map) {
      return objectMapper.valueToTree(map);
    }
    return null;
  }

  private Map<String, Object> assessmentError(String message) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("assessment", null);
    body.put("source", "error");
    body.put("assistant", "Fixera");
    body.put("error", message);
    return body;
  }

  private JsonNode parseAssessment(String text, String fallbackCategory, String description) {
    if (!StringUtils.hasText(text)) {
      return null;
    }
    String cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
    }
    try {
      JsonNode root = objectMapper.readTree(cleaned);
      if (!root.isObject()) {
        return null;
      }
      ObjectNode assessment = (ObjectNode) root;
      if (!assessment.hasNonNull("summary") && assessment.has("overview")) {
        assessment.put("summary", assessment.path("overview").asText());
      }
      if (!assessment.hasNonNull("summary") && assessment.has("diagnosis")) {
        assessment.put("summary", assessment.path("diagnosis").asText());
      }
      if (!StringUtils.hasText(assessment.path("summary").asText(null))) {
        return null;
      }
      if (!assessment.hasNonNull("category")) {
        assessment.put("category", StringUtils.hasText(fallbackCategory) ? fallbackCategory.toLowerCase(Locale.ROOT) : "others");
      }
      normalizeUrgency(assessment);
      if (!assessment.has("confidence") || !assessment.get("confidence").isNumber()) {
        assessment.put("confidence", 0.65);
      }
      ensureArray(assessment, "immediate_safety_steps");
      ensureArray(assessment, "visual_findings");
      ensureArray(assessment, "observed_evidence");
      ensureArray(assessment, "likely_causes");
      ensureArray(assessment, "needs_confirmation");
      ensureArray(assessment, "tools_required");
      ensureArray(assessment, "materials_needed");
      ensureArray(assessment, "diy_steps");
      ensureArray(assessment, "diy_guide_steps");
      ensureArray(assessment, "stop_conditions");
      ensureArray(assessment, "preparation_steps");
      ensureArray(assessment, "completion_checks");
      ensureArray(assessment, "questions_needed");
      if (!assessment.has("estimated_labor_hours_min")) {
        assessment.put("estimated_labor_hours_min", 1);
      }
      if (!assessment.has("estimated_labor_hours_max")) {
        assessment.put("estimated_labor_hours_max", 3);
      }
      if (!assessment.hasNonNull("disclaimer")) {
        assessment.put("disclaimer", "AI-assisted assessment, not a professional diagnosis.");
      }
      assessment.remove("estimatedCost");
      assessment.remove("estimated_cost");
      return assessment;
    } catch (Exception e) {
      return null;
    }
  }

  private ObjectNode applyDiySafetyRules(JsonNode assessment, String description) {
    ObjectNode node = assessment.deepCopy();
    String text =
        (node.path("summary").asText("")
                + " "
                + (description == null ? "" : description)
                + " "
                + node.path("visual_findings").toString())
            .toLowerCase(Locale.ROOT);
    boolean blocked = DIY_BLOCK.matcher(text).find();
    if (blocked) {
      node.put("safe_diy_allowed", false);
      node.put("professional_required", true);
      node.put("diy_difficulty", "blocked");
      node.put("diy_risk_level", "red");
      if (node.path("diy_guide_steps").isArray()) {
        ((ArrayNode) node.get("diy_guide_steps")).removeAll();
      }
    } else if (node.path("safe_diy_allowed").asBoolean(false)) {
      node.put("diy_risk_level", "green");
    } else {
      node.put("diy_risk_level", node.path("professional_required").asBoolean(true) ? "yellow" : "green");
    }
    return node;
  }

  private Map<String, Object> toLegacyUiAssessment(JsonNode a) {
    Map<String, Object> mapped = new LinkedHashMap<>();
    mapped.put("overview", a.path("summary").asText(null));
    mapped.put("imageObservations", toList(a.path("visual_findings")));
    mapped.put("diagnosis", a.path("summary").asText(null));
    mapped.put("likelyRootCause", "");
    mapped.put("professionalSteps", List.of());
    mapped.put("partsNeeded", toList(a.path("materials_needed")));
    mapped.put("workScope", List.of());
    mapped.put("toolsRequired", toList(a.path("tools_required")));
    mapped.put("diySteps", toList(a.path("diy_steps")));
    mapped.put("diyGuideImages", List.of());
    mapped.put("suggestions", toList(a.path("immediate_safety_steps")));
    mapped.put("estimatedCost", "");
    mapped.put(
        "estimatedDuration",
        a.path("estimated_labor_hours_min").asInt(1)
            + "-"
            + a.path("estimated_labor_hours_max").asInt(3)
            + " hours");
    mapped.put("urgency", a.path("urgency").asText(null));
    mapped.put("safetyNotes", String.join(" ", toList(a.path("immediate_safety_steps"))));
    mapped.put("professionalRecommended", a.path("professional_required").asBoolean(true));
    // Spread structured fields for clients that read snake_case keys
    a.fields().forEachRemaining(e -> mapped.put(e.getKey(), objectMapper.convertValue(e.getValue(), Object.class)));
    return mapped;
  }

  private static void normalizeUrgency(ObjectNode assessment) {
    String urgency = assessment.path("urgency").asText("medium").toLowerCase(Locale.ROOT);
    if (urgency.contains("emerg")) {
      assessment.put("urgency", "emergency");
    } else if (urgency.contains("high")) {
      assessment.put("urgency", "high");
    } else if (urgency.contains("low")) {
      assessment.put("urgency", "low");
    } else {
      assessment.put("urgency", "medium");
    }
  }

  private static void ensureArray(ObjectNode node, String field) {
    if (!node.has(field) || !node.get(field).isArray()) {
      node.putArray(field);
    }
  }

  private static List<String> toList(JsonNode node) {
    List<String> out = new ArrayList<>();
    if (node != null && node.isArray()) {
      for (JsonNode n : node) {
        if (n.isTextual()) {
          out.add(n.asText());
        }
      }
    }
    return out;
  }

  private static String clamp(String value, int max) {
    if (value == null) {
      return "";
    }
    String trimmed = value.trim();
    return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
  }
}
