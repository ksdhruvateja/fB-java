package com.fixbridge.dispute.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.payout.entity.ContractorPayoutEntity;
import com.fixbridge.dispute.entity.DisputeEntity;
import com.fixbridge.dispute.entity.DisputeEventEntity;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.payment.entity.PaymentEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.payout.repository.ContractorPayoutRepository;
import com.fixbridge.dispute.repository.DisputeEventRepository;
import com.fixbridge.dispute.repository.DisputeRepository;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.payment.repository.PaymentRepository;
import com.fixbridge.security.authorization.ManagedJobAccess;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.fixbridge.notification.service.NotificationService;
@Service
public class DisputeOpsService {

  private static final Map<String, String> CATEGORIES =
      Map.of(
          "work_incomplete", "Work incomplete",
          "problem_still_exists", "Problem still exists",
          "new_damage", "New damage",
          "incorrect_work", "Incorrect work",
          "billing_concern", "Billing concern",
          "contractor_conduct", "Contractor conduct",
          "other", "Other");

  private static final Set<String> COMPLETED_JOB_STATUSES =
      Set.of(
          "work_completed",
          "customer_review_pending",
          "admin_review_pending",
          "payout_pending",
          "paid_out",
          "closed",
          "completed",
          "disputed");

  private final DisputeRepository disputeRepository;
  private final DisputeEventRepository disputeEventRepository;
  private final ManagedJobRepository managedJobRepository;
  private final PaymentRepository paymentRepository;
  private final ContractorPayoutRepository contractorPayoutRepository;
  private final NotificationService notificationService;
  private final ObjectMapper objectMapper;

  public DisputeOpsService(
      DisputeRepository disputeRepository,
      DisputeEventRepository disputeEventRepository,
      ManagedJobRepository managedJobRepository,
      PaymentRepository paymentRepository,
      ContractorPayoutRepository contractorPayoutRepository,
      NotificationService notificationService,
      ObjectMapper objectMapper) {
    this.disputeRepository = disputeRepository;
    this.disputeEventRepository = disputeEventRepository;
    this.managedJobRepository = managedJobRepository;
    this.paymentRepository = paymentRepository;
    this.contractorPayoutRepository = contractorPayoutRepository;
    this.notificationService = notificationService;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public Map<String, Object> reportProblem(Long jobId, Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job =
        managedJobRepository
            .findById(jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
    boolean allowed =
        ManagedJobAccess.isAdminRole(principal)
            || ManagedJobAccess.isHomeownerOwner(principal, job.getHomeownerUserId());
    if (!allowed) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }
    if (!COMPLETED_JOB_STATUSES.contains(String.valueOf(job.getStatus()).toLowerCase(Locale.ROOT))) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Disputes can only be opened for completed or in-review jobs.",
          "job_not_completed");
    }

    Map<String, Object> bodyIn = request != null ? request : Map.of();
    String description =
        bodyIn.get("description") != null ? String.valueOf(bodyIn.get("description")).trim() : "";
    if (!StringUtils.hasText(description)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Please describe the problem.");
    }

    var existing =
        disputeRepository.findFirstByJobIdAndStatusNotInOrderByCreatedAtDesc(
            jobId, List.of("resolved", "closed"));
    if (existing.isPresent()) {
      throw new ApiException(HttpStatus.CONFLICT, "A dispute is already open for this job.", "dispute_already_open");
    }

    String categoryRaw =
        bodyIn.get("category") != null
            ? String.valueOf(bodyIn.get("category")).trim().toLowerCase(Locale.ROOT)
            : "other";
    String category = CATEGORIES.containsKey(categoryRaw) ? categoryRaw : "other";

    PaymentEntity payment =
        paymentRepository.findByJobIdAndStatusIn(jobId, List.of("succeeded")).stream()
            .findFirst()
            .orElse(null);

    DisputeEntity dispute = new DisputeEntity();
    dispute.setJobId(jobId);
    dispute.setPaymentId(payment != null ? payment.getId() : null);
    dispute.setAmount(payment != null ? payment.getAmount() : null);
    dispute.setCategory(category);
    dispute.setDescription(truncate(description, 5000));
    dispute.setReason(
        truncate(
            bodyIn.get("reason") != null
                ? String.valueOf(bodyIn.get("reason"))
                : CATEGORIES.get(category),
            500));
    dispute.setPreferredResolution(
        bodyIn.get("preferredResolution") != null
            ? truncate(String.valueOf(bodyIn.get("preferredResolution")), 500)
            : null);
    dispute.setStatus("open");
    dispute.setOpenedByUserId(principal.getId());
    dispute.setOpenedByRole(principal.getRole());
    dispute.setHomeownerUserId(job.getHomeownerUserId());
    dispute.setContractorUserId(job.getAssignedContractorUserId());
    ObjectNode meta = objectMapper.createObjectNode();
    meta.put("category", category);
    meta.put("description", dispute.getDescription());
    if (dispute.getPreferredResolution() != null) {
      meta.put("preferredResolution", dispute.getPreferredResolution());
    }
    dispute.setMeta(meta);
    dispute = disputeRepository.save(dispute);

    boolean alreadyPaid = holdPayouts(jobId, "Dispute opened: " + CATEGORIES.get(category));

    ObjectNode after = objectMapper.createObjectNode();
    after.put("status", "open");
    after.put("category", category);
    after.put("payoutHeld", !alreadyPaid);
    after.put("contractorAlreadyPaid", alreadyPaid);
    logEvent(dispute.getId(), principal, "dispute_opened", dispute.getDescription(), null, after);

    if (!"disputed".equalsIgnoreCase(job.getStatus())) {
      job.setStatus("disputed");
      job.setUpdatedAt(OffsetDateTime.now());
      managedJobRepository.save(job);
    }

    if (job.getHomeownerUserId() != null) {
      notificationService.create(
          job.getHomeownerUserId(),
          "homeowner",
          jobId,
          "dispute_update",
          "We received your report",
          "Our team is reviewing your service concern.",
          "dispute",
          dispute.getId(),
          "/homeowner?job=" + jobId,
          null);
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    Map<String, Object> dto = serialize(dispute);
    dto.put(
        "payoutState",
        Map.of(
            "alreadyPaid", alreadyPaid,
            "held", !alreadyPaid,
            "latestStatus",
            contractorPayoutRepository
                .findByJobId(jobId)
                .map(ContractorPayoutEntity::getStatus)
                .orElse(null)));
    body.put("dispute", dto);
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> getJobDispute(Long jobId) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job =
        managedJobRepository
            .findById(jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found."));
    boolean allowed =
        ManagedJobAccess.isAdminRole(principal)
            || ManagedJobAccess.isHomeownerOwner(principal, job.getHomeownerUserId());
    if (!allowed) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }
    DisputeEntity dispute =
        disputeRepository.findByJobIdOrderByCreatedAtDesc(jobId).stream().findFirst().orElse(null);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("dispute", dispute == null ? null : serialize(dispute));
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> listAdminDisputes(String status) {
    List<DisputeEntity> rows = disputeRepository.findTop200ByOrderByCreatedAtDesc();
    String statusFilter =
        StringUtils.hasText(status) ? status.trim().toLowerCase(Locale.ROOT) : null;
    List<Map<String, Object>> disputes =
        rows.stream()
            .filter(
                d -> {
                  String s = String.valueOf(d.getStatus() == null ? "" : d.getStatus()).toLowerCase(Locale.ROOT);
                  if (statusFilter != null) {
                    return statusFilter.equals(s);
                  }
                  return !"closed".equals(s);
                })
            .map(this::serialize)
            .collect(Collectors.toList());
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("disputes", disputes);
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> getAdminDispute(Long id) {
    DisputeEntity dispute =
        disputeRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Dispute not found."));
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("dispute", serialize(dispute));
    body.put(
        "events",
        disputeEventRepository.findByDisputeIdOrderByCreatedAtAsc(id).stream()
            .map(this::serializeEvent)
            .collect(Collectors.toList()));
    return body;
  }

  @Transactional
  public Map<String, Object> adminAction(Long id, Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    DisputeEntity dispute =
        disputeRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Dispute not found."));
    Map<String, Object> bodyIn = request != null ? request : Map.of();
    String action =
        bodyIn.get("action") != null
            ? String.valueOf(bodyIn.get("action")).trim().toLowerCase(Locale.ROOT)
            : "resolve";
    String reason =
        bodyIn.get("reason") != null ? String.valueOf(bodyIn.get("reason")).trim() : null;
    String beforeStatus = dispute.getStatus();

    if ("resolve".equals(action)
        || "close_dispute".equals(action)
        || "close".equals(action)
        || "resolved".equals(action)) {
      String next =
          bodyIn.get("status") != null
              ? String.valueOf(bodyIn.get("status")).trim().toLowerCase(Locale.ROOT)
              : ("close".equals(action) || "close_dispute".equals(action) ? "closed" : "resolved");
      if (!Set.of("resolved", "closed").contains(next)) {
        next = "resolved";
      }
      dispute.setStatus(next);
    } else if ("set_status".equals(action) && bodyIn.get("status") != null) {
      dispute.setStatus(String.valueOf(bodyIn.get("status")).trim().toLowerCase(Locale.ROOT));
    } else if (bodyIn.get("status") != null) {
      dispute.setStatus(String.valueOf(bodyIn.get("status")).trim().toLowerCase(Locale.ROOT));
    }
    dispute = disputeRepository.save(dispute);

    ObjectNode before = objectMapper.createObjectNode().put("status", beforeStatus);
    ObjectNode after = objectMapper.createObjectNode().put("status", dispute.getStatus());
    logEvent(dispute.getId(), principal, action, reason, before, after);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("dispute", serialize(dispute));
    return body;
  }

  private boolean holdPayouts(Long jobId, String holdReason) {
    return contractorPayoutRepository
        .findByJobId(jobId)
        .map(
            payout -> {
              boolean alreadyPaid =
                  "paid".equalsIgnoreCase(payout.getStatus())
                      || "processing".equalsIgnoreCase(payout.getStatus())
                      || StringUtils.hasText(payout.getStripeTransferId());
              if (!alreadyPaid) {
                payout.setStatus("on_hold");
                payout.setHoldReason(holdReason);
                payout.setHeldAt(OffsetDateTime.now());
                contractorPayoutRepository.save(payout);
              }
              return alreadyPaid;
            })
        .orElse(false);
  }

  private void logEvent(
      Long disputeId,
      UserPrincipal principal,
      String action,
      String reason,
      ObjectNode before,
      ObjectNode after) {
    DisputeEventEntity event = new DisputeEventEntity();
    event.setDisputeId(disputeId);
    event.setActorUserId(principal.getId());
    event.setActorRole(principal.getRole());
    event.setAction(action);
    event.setReason(reason);
    event.setBeforeState(before);
    event.setAfterState(after);
    disputeEventRepository.save(event);
  }

  private Map<String, Object> serialize(DisputeEntity d) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", d.getId());
    m.put("jobId", d.getJobId());
    m.put("paymentId", d.getPaymentId());
    m.put("amount", d.getAmount() != null ? d.getAmount().doubleValue() : null);
    m.put("category", d.getCategory());
    m.put("reason", d.getReason());
    m.put("description", d.getDescription());
    m.put("preferredResolution", d.getPreferredResolution());
    m.put("status", d.getStatus());
    m.put("openedByUserId", d.getOpenedByUserId());
    m.put("openedByRole", d.getOpenedByRole());
    m.put("homeownerUserId", d.getHomeownerUserId());
    m.put("contractorUserId", d.getContractorUserId());
    m.put("assignedEmployeeId", d.getAssignedEmployeeId());
    m.put("stripeDisputeId", d.getStripeDisputeId());
    m.put("meta", d.getMeta());
    m.put("createdAt", d.getCreatedAt());
    m.put("updatedAt", d.getUpdatedAt());
    return m;
  }

  private Map<String, Object> serializeEvent(DisputeEventEntity e) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", e.getId());
    m.put("disputeId", e.getDisputeId());
    m.put("actorUserId", e.getActorUserId());
    m.put("actorRole", e.getActorRole());
    m.put("action", e.getAction());
    m.put("reason", e.getReason());
    m.put("beforeState", e.getBeforeState());
    m.put("afterState", e.getAfterState());
    m.put("createdAt", e.getCreatedAt());
    return m;
  }

  private static String truncate(String value, int max) {
    if (value == null) {
      return null;
    }
    return value.length() <= max ? value : value.substring(0, max);
  }
}
