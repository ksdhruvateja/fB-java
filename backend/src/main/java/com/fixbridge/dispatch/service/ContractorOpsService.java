package com.fixbridge.dispatch.service;

import com.fixbridge.job.dto.request.InvitationRespondRequest;
import com.fixbridge.job.entity.JobInvitationEntity;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.job.mapper.ManagedJobMapper;
import com.fixbridge.job.repository.JobInvitationRepository;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class ContractorOpsService {

  private static final Map<String, Set<String>> CONTRACTOR_STATUS_TRANSITIONS =
      Map.of(
          "awaiting_bid", Set.of("diagnosing"),
          "contractor_accepted", Set.of("diagnosing"),
          "diagnosing", Set.of("work_started"),
          "approved", Set.of("scheduled", "contractor_en_route"),
          "scheduled", Set.of("contractor_en_route", "work_started"),
          "contractor_en_route", Set.of("work_started"),
          "work_started", Set.of("change_order_pending"),
          "change_order_pending", Set.of("work_started"));

  private final JobInvitationRepository jobInvitationRepository;
  private final ManagedJobRepository managedJobRepository;
  private final ManagedJobMapper managedJobMapper;

  public ContractorOpsService(
      JobInvitationRepository jobInvitationRepository,
      ManagedJobRepository managedJobRepository,
      ManagedJobMapper managedJobMapper) {
    this.jobInvitationRepository = jobInvitationRepository;
    this.managedJobRepository = managedJobRepository;
    this.managedJobMapper = managedJobMapper;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> listInvitations() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    SecurityUtils.requireContractorRole();

    List<JobInvitationEntity> invitations =
        jobInvitationRepository.findByContractorUserIdOrderByCreatedAtDesc(principal.getId());
    List<Map<String, Object>> items = new ArrayList<>();
    for (JobInvitationEntity inv : invitations) {
      ManagedJobEntity job = managedJobRepository.findById(inv.getJobId()).orElse(null);
      if (job == null) {
        continue;
      }
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("id", inv.getId());
      row.put("jobId", inv.getJobId());
      row.put("status", inv.getStatus());
      row.put("bookingId", job.getBookingId());
      row.put("category", job.getCategory());
      row.put("title", job.getTitle());
      row.put("description", job.getDescription());
      row.put("mediaDataUrl", job.getMediaDataUrl());
      row.put("mediaType", job.getMediaType());
      row.put("preferredDate", job.getPreferredDate());
      row.put("preferredTimeSlot", job.getPreferredTimeSlot());
      row.put("serviceTiming", job.getServiceTiming());
      row.put("cityStateZip", job.getCityStateZip());
      row.put("jobStatus", job.getStatus());
      row.put("aiAssessment", job.getAiAssessment());
      BigDecimal low =
          inv.getExpectedNetLow() != null
              ? inv.getExpectedNetLow()
              : job.getEstimatedContractorNetLow();
      BigDecimal high =
          inv.getExpectedNetHigh() != null
              ? inv.getExpectedNetHigh()
              : job.getEstimatedContractorNetHigh();
      row.put("expectedNetLow", low);
      row.put("expectedNetHigh", high);
      items.add(row);
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("invitations", items);
    return body;
  }

  @Transactional
  public Map<String, Object> respond(Long invitationId, InvitationRespondRequest request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    SecurityUtils.requireContractorRole();
    String action =
        request != null && request.getAction() != null
            ? request.getAction().trim().toLowerCase(Locale.ROOT)
            : "";
    if (!"accept".equals(action) && !"decline".equals(action)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "action must be accept or decline");
    }

    JobInvitationEntity invitation =
        jobInvitationRepository
            .findByIdAndContractorUserId(invitationId, principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Invitation not found."));

    String status = "accept".equals(action) ? "accepted" : "declined";
    invitation.setStatus(status);
    invitation.setRespondedAt(OffsetDateTime.now());
    jobInvitationRepository.save(invitation);

    if ("accept".equals(action)) {
      ManagedJobEntity job =
          managedJobRepository
              .findById(invitation.getJobId())
              .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
      job.setAssignedContractorUserId(principal.getId());
      job.setStatus("awaiting_bid");
      managedJobRepository.save(job);
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("status", status);
    return body;
  }

  @Transactional
  public Map<String, Object> markTravel(Long jobId) {
    return recordMilestone(jobId, "contractor_dispatched", "contractor_en_route", "Technician en route");
  }

  @Transactional
  public Map<String, Object> markArrived(Long jobId) {
    return recordMilestone(jobId, "technician_arrived", null, "Technician arrived on site");
  }

  @Transactional
  public Map<String, Object> markStarted(Long jobId) {
    return recordMilestone(jobId, "job_started", "work_started", "Job started");
  }

  @Transactional(readOnly = true)
  public Map<String, Object> performance() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    SecurityUtils.requireContractorRole();

    List<ManagedJobEntity> assigned =
        managedJobRepository.findAssignedToContractor(principal.getId());
    long completed =
        assigned.stream()
            .filter(
                j ->
                    Set.of(
                            "work_completed",
                            "customer_review_pending",
                            "admin_review_pending",
                            "payout_pending",
                            "paid_out",
                            "closed")
                        .contains(normalize(j.getStatus())))
            .count();
    long active =
        assigned.stream()
            .filter(
                j ->
                    Set.of(
                            "awaiting_bid",
                            "diagnosing",
                            "approved",
                            "scheduled",
                            "contractor_en_route",
                            "work_started",
                            "change_order_pending")
                        .contains(normalize(j.getStatus())))
            .count();
    long invitations =
        jobInvitationRepository.findByContractorUserIdOrderByCreatedAtDesc(principal.getId()).size();

    Map<String, Object> stats = new LinkedHashMap<>();
    stats.put("assignedJobs", assigned.size());
    stats.put("activeJobs", active);
    stats.put("completedJobs", completed);
    stats.put("invitationCount", invitations);
    stats.put("reviewCount", 0);
    stats.put("averageRating", null);
    stats.put(
        "categoryAverages",
        Map.of(
            "quality", null,
            "communication", null,
            "punctuality", null,
            "cleanliness", null,
            "value", null));

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("reviews", List.of());
    body.put("stats", stats);
    return body;
  }

  private Map<String, Object> recordMilestone(
      Long jobId, String eventType, String toStatus, String note) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    SecurityUtils.requireContractorRole();
    if (jobId == null || jobId <= 0) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Not found.");
    }
    ManagedJobEntity job =
        managedJobRepository
            .findById(jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found."));

    boolean isAssigned =
        principal.getId() != null && principal.getId().equals(job.getAssignedContractorUserId());
    if (!isAssigned && !"admin".equals(principal.getRole())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }

    if (StringUtils.hasText(toStatus)) {
      String current = normalize(job.getStatus());
      Set<String> allowed = CONTRACTOR_STATUS_TRANSITIONS.getOrDefault(current, Set.of());
      boolean isAdmin = "admin".equals(principal.getRole());
      if (!isAdmin && !allowed.contains(toStatus)) {
        throw new ApiException(
            HttpStatus.BAD_REQUEST,
            "Cannot move job from \"" + job.getStatus() + "\" to \"" + toStatus + "\".");
      }
      job.setStatus(toStatus);
      managedJobRepository.save(job);
    }

    // eventType/note retained for parity with Express operational events (not persisted yet)
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("job", managedJobMapper.toDto(job, principal));
    body.put("eventType", eventType);
    if (note != null) {
      body.put("note", note);
    }
    return body;
  }

  private static String normalize(String status) {
    return status == null ? "" : status.toLowerCase(Locale.ROOT);
  }
}
