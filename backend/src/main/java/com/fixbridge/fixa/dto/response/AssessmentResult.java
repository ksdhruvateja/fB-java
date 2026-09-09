package com.fixbridge.fixa.dto.response;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Structured assessment payload with DIY safety GREEN / YELLOW / RED. */
public class AssessmentResult {

  public enum Safety {
    GREEN,
    YELLOW,
    RED
  }

  private String category;
  private String summary;
  private String urgency;
  private double confidence;
  private boolean professionalRequired;
  private boolean safeDiyAllowed;
  private Safety safety = Safety.YELLOW;
  private List<String> immediateSafetySteps = new ArrayList<>();
  private List<String> visualFindings = new ArrayList<>();
  private List<String> diySteps = new ArrayList<>();
  private List<String> stopConditions = new ArrayList<>();
  private String disclaimer;
  private String model;
  private String source;
  private JsonNode structured;

  public static AssessmentResult fromStructured(JsonNode node, String model) {
    AssessmentResult result = new AssessmentResult();
    if (node == null || !node.isObject()) {
      result.setSafety(Safety.RED);
      result.setProfessionalRequired(true);
      result.setSafeDiyAllowed(false);
      return result;
    }
    result.setStructured(node);
    result.setCategory(node.path("category").asText(null));
    result.setSummary(node.path("summary").asText(null));
    result.setUrgency(node.path("urgency").asText("medium"));
    result.setConfidence(node.path("confidence").asDouble(0.65));
    result.setProfessionalRequired(node.path("professional_required").asBoolean(true));
    result.setSafeDiyAllowed(node.path("safe_diy_allowed").asBoolean(false));
    result.setImmediateSafetySteps(toList(node.path("immediate_safety_steps")));
    result.setVisualFindings(toList(node.path("visual_findings")));
    result.setDiySteps(toList(node.path("diy_steps")));
    result.setStopConditions(toList(node.path("stop_conditions")));
    result.setDisclaimer(node.path("disclaimer").asText(null));
    result.setModel(model);
    result.setSafety(resolveSafety(node));
    return result;
  }

  public static Safety resolveSafety(JsonNode node) {
    if (node == null) {
      return Safety.RED;
    }
    String risk = node.path("diy_risk_level").asText("").trim().toLowerCase(Locale.ROOT);
    if ("red".equals(risk) || !node.path("safe_diy_allowed").asBoolean(true)) {
      if ("red".equals(risk) || node.path("diy_difficulty").asText("").equalsIgnoreCase("blocked")) {
        return Safety.RED;
      }
      if (node.path("professional_required").asBoolean(false)) {
        return Safety.YELLOW;
      }
    }
    if ("yellow".equals(risk)) {
      return Safety.YELLOW;
    }
    if ("green".equals(risk) || node.path("safe_diy_allowed").asBoolean(false)) {
      return Safety.GREEN;
    }
    return node.path("professional_required").asBoolean(true) ? Safety.YELLOW : Safety.GREEN;
  }

  public Map<String, Object> toMap() {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("category", category);
    out.put("summary", summary);
    out.put("urgency", urgency);
    out.put("confidence", confidence);
    out.put("professionalRequired", professionalRequired);
    out.put("safeDiyAllowed", safeDiyAllowed);
    out.put("safety", safety == null ? null : safety.name());
    out.put("immediateSafetySteps", immediateSafetySteps);
    out.put("visualFindings", visualFindings);
    out.put("diySteps", diySteps);
    out.put("stopConditions", stopConditions);
    out.put("disclaimer", disclaimer);
    out.put("model", model);
    out.put("source", source);
    return out;
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

  public String getCategory() {
    return category;
  }

  public void setCategory(String category) {
    this.category = category;
  }

  public String getSummary() {
    return summary;
  }

  public void setSummary(String summary) {
    this.summary = summary;
  }

  public String getUrgency() {
    return urgency;
  }

  public void setUrgency(String urgency) {
    this.urgency = urgency;
  }

  public double getConfidence() {
    return confidence;
  }

  public void setConfidence(double confidence) {
    this.confidence = confidence;
  }

  public boolean isProfessionalRequired() {
    return professionalRequired;
  }

  public void setProfessionalRequired(boolean professionalRequired) {
    this.professionalRequired = professionalRequired;
  }

  public boolean isSafeDiyAllowed() {
    return safeDiyAllowed;
  }

  public void setSafeDiyAllowed(boolean safeDiyAllowed) {
    this.safeDiyAllowed = safeDiyAllowed;
  }

  public Safety getSafety() {
    return safety;
  }

  public void setSafety(Safety safety) {
    this.safety = safety;
  }

  public List<String> getImmediateSafetySteps() {
    return immediateSafetySteps;
  }

  public void setImmediateSafetySteps(List<String> immediateSafetySteps) {
    this.immediateSafetySteps = immediateSafetySteps;
  }

  public List<String> getVisualFindings() {
    return visualFindings;
  }

  public void setVisualFindings(List<String> visualFindings) {
    this.visualFindings = visualFindings;
  }

  public List<String> getDiySteps() {
    return diySteps;
  }

  public void setDiySteps(List<String> diySteps) {
    this.diySteps = diySteps;
  }

  public List<String> getStopConditions() {
    return stopConditions;
  }

  public void setStopConditions(List<String> stopConditions) {
    this.stopConditions = stopConditions;
  }

  public String getDisclaimer() {
    return disclaimer;
  }

  public void setDisclaimer(String disclaimer) {
    this.disclaimer = disclaimer;
  }

  public String getModel() {
    return model;
  }

  public void setModel(String model) {
    this.model = model;
  }

  public String getSource() {
    return source;
  }

  public void setSource(String source) {
    this.source = source;
  }

  public JsonNode getStructured() {
    return structured;
  }

  public void setStructured(JsonNode structured) {
    this.structured = structured;
  }
}
