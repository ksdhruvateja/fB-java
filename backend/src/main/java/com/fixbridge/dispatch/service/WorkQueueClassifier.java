package com.fixbridge.dispatch.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fixbridge.job.entity.ManagedJobEntity;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Port of api/work-queue.js — each job belongs to exactly one primary queue bucket.
 */
@Component
public class WorkQueueClassifier {

  public static final List<Map<String, String>> WORK_QUEUE_SECTIONS =
      List.of(
          section("new_requests", "New Requests"),
          section("waiting_contractor_quote", "Waiting Contractor Quote"),
          section("needs_admin_pricing", "Needs Admin Pricing"),
          section("quote_sent", "Quote Sent"),
          section("homeowner_accepted", "Homeowner Accepted"),
          section("ready_to_dispatch", "Ready to Dispatch"),
          section("active", "Active Jobs"),
          section("payment_pending", "Payment Pending"),
          section("payout_ready", "Payout Ready"),
          section("attention_required", "Attention Required"));

  private static final Set<String> TERMINAL =
      Set.of("closed", "canceled", "cancelled", "refunded", "paid_out");

  private static Map<String, String> section(String id, String label) {
    Map<String, String> m = new LinkedHashMap<>();
    m.put("id", id);
    m.put("label", label);
    return m;
  }

  public String classify(ManagedJobEntity row) {
    if (row == null) {
      return null;
    }
    String status = String.valueOf(row.getStatus() == null ? "" : row.getStatus()).toLowerCase(Locale.ROOT);
    String wqs =
        String.valueOf(row.getWorkQueueStatus() == null ? "" : row.getWorkQueueStatus())
            .toUpperCase(Locale.ROOT);

    if (TERMINAL.contains(status)) {
      return null;
    }

    boolean inviteOverdue =
        row.getInviteDeadlineAt() != null
            && row.getInviteDeadlineAt().isBefore(OffsetDateTime.now())
            && Set.of("awaiting_contractor", "contractor_invited", "awaiting_bid").contains(status);

    if (inviteOverdue
        || (isUrgent(row)
            && !Set.of("paid_out", "closed", "payout_pending", "admin_review_pending")
                .contains(status))) {
      return "attention_required";
    }

    if (Set.of("draft", "ai_review_complete", "awaiting_service_payment").contains(status)) {
      return "new_requests";
    }
    if ("paid_for_dispatch".equals(status)
        || "awaiting_contractor".equals(status)
        || "PAID_NEEDS_REVIEW".equals(wqs)) {
      return "new_requests";
    }
    if (Set.of("contractor_invited", "awaiting_bid", "contractor_accepted").contains(status)) {
      return "waiting_contractor_quote";
    }
    if ("bid_received".equals(status)) {
      return "needs_admin_pricing";
    }
    if (Set.of("proposal_sent", "awaiting_customer_approval").contains(status)) {
      return "quote_sent";
    }
    if ("approved".equals(status)) {
      return "homeowner_accepted";
    }
    if ("scheduled".equals(status)) {
      return "ready_to_dispatch";
    }
    if (Set.of("contractor_en_route", "work_started", "change_order_pending", "diagnosing")
        .contains(status)) {
      return "active";
    }
    if (Set.of("work_completed", "customer_review_pending").contains(status)) {
      return "payment_pending";
    }
    if (Set.of("admin_review_pending", "payout_pending").contains(status)) {
      return "payout_ready";
    }
    return "attention_required";
  }

  public List<Map<String, Object>> buildSections(List<ManagedJobEntity> jobs) {
    Map<String, List<ManagedJobEntity>> buckets = new LinkedHashMap<>();
    for (Map<String, String> s : WORK_QUEUE_SECTIONS) {
      buckets.put(s.get("id"), new ArrayList<>());
    }
    if (jobs != null) {
      for (ManagedJobEntity job : jobs) {
        String section = classify(job);
        if (section != null && buckets.containsKey(section)) {
          buckets.get(section).add(job);
        }
      }
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, String> s : WORK_QUEUE_SECTIONS) {
      List<ManagedJobEntity> sectionJobs = buckets.get(s.get("id"));
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("id", s.get("id"));
      item.put("label", s.get("label"));
      item.put("count", sectionJobs.size());
      item.put(
          "jobIds",
          sectionJobs.stream().map(ManagedJobEntity::getId).toList());
      out.add(item);
    }
    return out;
  }

  private boolean isUrgent(ManagedJobEntity row) {
    JsonNode a = row.getAiAssessment();
    if (a == null || a.isNull()) {
      return false;
    }
    JsonNode urgencyNode = a.get("urgency");
    if (urgencyNode == null || urgencyNode.isNull()) {
      return false;
    }
    String u = urgencyNode.asText("").toLowerCase(Locale.ROOT);
    return u.contains("emerg") || "critical".equals(u);
  }
}
