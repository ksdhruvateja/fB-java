package com.fixbridge.dispatch.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.job.entity.ManagedJobEntity;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class WorkQueueClassifierTest {

  private final WorkQueueClassifier classifier = new WorkQueueClassifier();
  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void classifiesDraftAsNewRequests() {
    ManagedJobEntity job = new ManagedJobEntity();
    job.setStatus("draft");
    assertEquals("new_requests", classifier.classify(job));
  }

  @Test
  void overdueInviteGoesToAttention() {
    ManagedJobEntity job = new ManagedJobEntity();
    job.setStatus("contractor_invited");
    job.setInviteDeadlineAt(OffsetDateTime.now().minusHours(1));
    assertEquals("attention_required", classifier.classify(job));
  }

  @Test
  void urgentAssessmentGoesToAttention() {
    ManagedJobEntity job = new ManagedJobEntity();
    job.setStatus("scheduled");
    ObjectNode assessment = objectMapper.createObjectNode();
    assessment.put("urgency", "emergency");
    job.setAiAssessment(assessment);
    assertEquals("attention_required", classifier.classify(job));
  }

  @Test
  void terminalStatusesExcluded() {
    ManagedJobEntity job = new ManagedJobEntity();
    job.setStatus("closed");
    assertNull(classifier.classify(job));
  }

  @Test
  void buildSectionsBucketsJobs() {
    ManagedJobEntity a = new ManagedJobEntity();
    a.setId(1L);
    a.setStatus("draft");
    ManagedJobEntity b = new ManagedJobEntity();
    b.setId(2L);
    b.setStatus("bid_received");

    List<Map<String, Object>> sections = classifier.buildSections(List.of(a, b));
    Map<String, Object> newReq =
        sections.stream().filter(s -> "new_requests".equals(s.get("id"))).findFirst().orElseThrow();
    Map<String, Object> pricing =
        sections.stream()
            .filter(s -> "needs_admin_pricing".equals(s.get("id")))
            .findFirst()
            .orElseThrow();
    assertEquals(1, newReq.get("count"));
    assertEquals(List.of(1L), newReq.get("jobIds"));
    assertEquals(1, pricing.get("count"));
    assertTrue(WorkQueueClassifier.WORK_QUEUE_SECTIONS.size() >= 10);
  }
}
