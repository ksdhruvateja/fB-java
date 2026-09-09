package com.fixbridge.job.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.fixa.service.FixaService;
import com.fixbridge.job.repository.ManagedJobRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class AssessmentWorkerService {

  private static final Logger log = LoggerFactory.getLogger(AssessmentWorkerService.class);

  private final ManagedJobRepository managedJobRepository;
  private final FixaService fixaService;
  private final ObjectMapper objectMapper;

  public AssessmentWorkerService(
      ManagedJobRepository managedJobRepository,
      FixaService fixaService,
      ObjectMapper objectMapper) {
    this.managedJobRepository = managedJobRepository;
    this.fixaService = fixaService;
    this.objectMapper = objectMapper;
  }

  @Async("assessmentExecutor")
  public void processAsync(Long jobId, Long actorUserId) {
    log.info("[assessment] worker started jobId={} actor={}", jobId, actorUserId);
    try {
      runAssessmentJob(jobId);
      log.info("[assessment] complete jobId={}", jobId);
    } catch (Exception e) {
      log.error("[assessment] local processor failed jobId={} error={}", jobId, e.getMessage());
    }
  }

  @Transactional
  public void runAssessmentJob(Long jobId) {
    ManagedJobEntity job = managedJobRepository.findById(jobId).orElse(null);
    if (job == null) {
      log.warn("[assessment] worker job missing jobId={}", jobId);
      return;
    }
    try {
      Map<String, Object> result =
          fixaService.assessRepair(
              job.getCategory(), job.getDescription(), job.getMediaDataUrl(), locationContext(job));
      JsonNode structured = fixaService.structuredFromResult(result);
      if (structured == null || structured.isNull()) {
        fail(job, "AI_ASSESSMENT_FAILED");
        return;
      }

      ObjectNode pricing = objectMapper.createObjectNode();
      pricing.put("message", "Preliminary estimate based on AI assessment.");
      pricing.put("urgency", structured.path("urgency").asText("medium"));
      pricing.put("complexity", structured.path("complexity").asText("medium"));

      int hoursMin = structured.path("estimated_labor_hours_min").asInt(1);
      int hoursMax = structured.path("estimated_labor_hours_max").asInt(3);
      BigDecimal netLow = BigDecimal.valueOf(hoursMin * 75L).setScale(2, RoundingMode.HALF_UP);
      BigDecimal netHigh = BigDecimal.valueOf(hoursMax * 95L).setScale(2, RoundingMode.HALF_UP);
      BigDecimal markup = new BigDecimal("1.35");
      BigDecimal retailLow = netLow.multiply(markup).setScale(2, RoundingMode.HALF_UP);
      BigDecimal retailHigh = netHigh.multiply(markup).setScale(2, RoundingMode.HALF_UP);
      pricing.put("customer_retail_estimate_low", retailLow);
      pricing.put("customer_retail_estimate_high", retailHigh);
      pricing.put("estimated_contractor_net_low", netLow);
      pricing.put("estimated_contractor_net_high", netHigh);
      pricing.put("show_price", true);
      pricing.put(
          "disclaimer",
          "Estimated service range includes coordination, administration, payment handling and subcontracted delivery.");
      String confidence = confidenceLabel(structured.path("confidence").asDouble(0.65));
      pricing.put("estimate_confidence", confidence);

      job.setAiAssessment(structured);
      job.setPricing(pricing);
      job.setShowRetailPrice(true);
      job.setCustomerRetailEstimateLow(retailLow);
      job.setCustomerRetailEstimateHigh(retailHigh);
      job.setEstimatedContractorNetLow(netLow);
      job.setEstimatedContractorNetHigh(netHigh);
      if (StringUtils.hasText(structured.path("category").asText(null))) {
        job.setCategory(structured.path("category").asText());
      }
      if (StringUtils.hasText(structured.path("service_subcategory").asText(null))) {
        job.setServiceSubcategory(structured.path("service_subcategory").asText());
      }
      job.setDiyRiskLevel(structured.path("diy_risk_level").asText("green"));
      job.setEstimateConfidence(confidence);
      job.setAssessmentStatus("ready");
      job.setAssessmentErrorCode(null);
      job.setAssessmentCompletedAt(OffsetDateTime.now());
      if ("draft".equalsIgnoreCase(job.getStatus())
          || "assessing".equalsIgnoreCase(job.getStatus())
          || "ai_review".equalsIgnoreCase(job.getStatus())) {
        job.setStatus("ai_review_complete");
      }
      managedJobRepository.save(job);
    } catch (Exception e) {
      String code =
          e.getMessage() != null && e.getMessage().toLowerCase(Locale.ROOT).contains("timed")
              ? "AI_TIMEOUT"
              : "AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE";
      fail(job, code);
    }
  }

  private void fail(ManagedJobEntity job, String code) {
    job.setAssessmentStatus("failed");
    job.setAssessmentErrorCode(code);
    job.setAssessmentCompletedAt(OffsetDateTime.now());
    managedJobRepository.save(job);
  }

  private static String confidenceLabel(double confidence) {
    if (confidence >= 0.8) {
      return "high";
    }
    if (confidence >= 0.55) {
      return "medium";
    }
    return "low";
  }

  private static String locationContext(ManagedJobEntity job) {
    StringBuilder sb = new StringBuilder();
    if (StringUtils.hasText(job.getCity())) {
      sb.append("City: ").append(job.getCity()).append('\n');
    }
    if (StringUtils.hasText(job.getState())) {
      sb.append("State: ").append(job.getState()).append('\n');
    }
    if (StringUtils.hasText(job.getZip())) {
      sb.append("ZIP: ").append(job.getZip()).append('\n');
    }
    return sb.toString();
  }
}
