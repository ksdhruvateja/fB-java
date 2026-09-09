package com.fixbridge.dispatch.service;

import com.fixbridge.job.dto.request.AssignContractorRequest;
import com.fixbridge.job.dto.request.InviteContractorRequest;
import com.fixbridge.job.dto.response.ManagedJobDto;
import com.fixbridge.job.entity.JobInvitationEntity;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.notification.entity.NotificationEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.job.mapper.ManagedJobMapper;
import com.fixbridge.job.repository.JobInvitationRepository;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.notification.repository.NotificationRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.time.OffsetDateTime;
import java.util.Comparator;
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

import com.fixbridge.admin.service.AuditService;
import com.fixbridge.compliance.service.ContractorComplianceService;
@Service
public class AdminOpsService {

  private static final Set<String> PRE_INVITE =
      Set.of(
          "draft",
          "ai_review_complete",
          "awaiting_service_payment",
          "paid_for_dispatch",
          "awaiting_contractor");

  private static final Set<String> SKIP_ACCEPT_TRANSITION =
      Set.of(
          "awaiting_bid",
          "bid_received",
          "proposal_sent",
          "awaiting_customer_approval",
          "approved",
          "scheduled",
          "work_started",
          "work_completed",
          "payout_pending",
          "paid_out",
          "closed");

  private static final Set<String> BLOCKED_COMPLIANCE =
      Set.of("suspended", "rejected", "blocked");

  private final ManagedJobRepository managedJobRepository;
  private final JobInvitationRepository jobInvitationRepository;
  private final UserRepository userRepository;
  private final NotificationRepository notificationRepository;
  private final ManagedJobMapper managedJobMapper;
  private final WorkQueueClassifier workQueueClassifier;
  private final ContractorComplianceService complianceService;
  private final AuditService auditService;

  public AdminOpsService(
      ManagedJobRepository managedJobRepository,
      JobInvitationRepository jobInvitationRepository,
      UserRepository userRepository,
      NotificationRepository notificationRepository,
      ManagedJobMapper managedJobMapper,
      WorkQueueClassifier workQueueClassifier,
      ContractorComplianceService complianceService,
      AuditService auditService) {
    this.managedJobRepository = managedJobRepository;
    this.jobInvitationRepository = jobInvitationRepository;
    this.userRepository = userRepository;
    this.notificationRepository = notificationRepository;
    this.managedJobMapper = managedJobMapper;
    this.workQueueClassifier = workQueueClassifier;
    this.complianceService = complianceService;
    this.auditService = auditService;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> verify() {
    SecurityUtils.requireAdminRole();
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> workQueue() {
    SecurityUtils.requireAdminRole();
    List<ManagedJobEntity> jobs =
        managedJobRepository.findForWorkQueue().stream()
            .sorted(workQueueComparator())
            .limit(500)
            .collect(Collectors.toList());

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("sections", workQueueClassifier.buildSections(jobs));
    body.put("catalog", WorkQueueClassifier.WORK_QUEUE_SECTIONS);
    body.put("endpoint", "GET /api/admin/work-queue");
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> listManagedJobs() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    SecurityUtils.requireAdminRole();
    List<ManagedJobDto> jobs =
        managedJobRepository.findAllByOrderByCreatedAtDesc().stream()
            .map(j -> managedJobMapper.toDto(j, principal))
            .collect(Collectors.toList());
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("jobs", jobs);
    return body;
  }

  @Transactional
  public Map<String, Object> invite(Long jobId, InviteContractorRequest request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    SecurityUtils.requireAdminRole();
    if (jobId == null || jobId <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid job.");
    }
    Long contractorUserId = request != null ? request.getContractorUserId() : null;
    if (contractorUserId == null || contractorUserId <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Select a contractor to invite.");
    }

    ManagedJobEntity job =
        managedJobRepository
            .findById(jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
    UserEntity contractor = requireEligibleContractor(contractorUserId);
    complianceService.assertDispatchEligible(contractorUserId, job);

    String requestType =
        request != null && "site_visit".equalsIgnoreCase(blank(request.getRequestType()))
            ? "site_visit"
            : "remote_quote";

    JobInvitationEntity invitation =
        jobInvitationRepository
            .findByJobIdAndContractorUserId(jobId, contractorUserId)
            .orElseGet(JobInvitationEntity::new);
    invitation.setJobId(jobId);
    invitation.setContractorUserId(contractorUserId);
    invitation.setStatus("invited");
    invitation.setExpectedNetLow(job.getEstimatedContractorNetLow());
    invitation.setExpectedNetHigh(job.getEstimatedContractorNetHigh());
    invitation.setMessage(request != null ? blankToNull(request.getMessage()) : null);
    invitation.setInvitedBy(principal.getId());
    invitation.setRequestType(requestType);
    invitation.setSiteVisitWindow(
        request != null ? blankToNull(request.getSiteVisitWindow()) : null);
    invitation.setRespondedAt(null);
    jobInvitationRepository.save(invitation);

    if (request != null && StringUtils.hasText(request.getRequestType())) {
      job.setQuoteRequestMode(requestType);
    }

    if (PRE_INVITE.contains(normalizeStatus(job.getStatus()))) {
      job.setStatus("contractor_invited");
    }
    ManagedJobEntity saved = managedJobRepository.save(job);

    try {
      createInvitationNotification(contractorUserId, saved);
    } catch (Exception ignored) {
      /* non-fatal */
    }

    auditService.write(
        principal.getId(),
        "job_invite",
        "managed_job",
        jobId,
        Map.of("contractorUserId", contractorUserId, "requestType", requestType));

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("job", managedJobMapper.toDto(saved, principal));
    body.put(
        "contractor",
        Map.of(
            "id", contractor.getId(),
            "name", contractor.getName() != null ? contractor.getName() : "",
            "email", contractor.getEmail() != null ? contractor.getEmail() : "",
            "trade", contractor.getTrade() != null ? contractor.getTrade() : ""));
    return body;
  }

  @Transactional
  public Map<String, Object> assign(Long jobId, AssignContractorRequest request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    SecurityUtils.requireAdminRole();
    if (jobId == null || jobId <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid job.");
    }
    Long contractorUserId = request != null ? request.getContractorUserId() : null;
    if (contractorUserId == null || contractorUserId <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Select a contractor to assign.");
    }

    ManagedJobEntity job =
        managedJobRepository
            .findById(jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
    UserEntity contractor = requireEligibleContractor(contractorUserId);
    complianceService.assertDispatchEligible(contractorUserId, job);

    JobInvitationEntity invitation =
        jobInvitationRepository
            .findByJobIdAndContractorUserId(jobId, contractorUserId)
            .orElseGet(JobInvitationEntity::new);
    invitation.setJobId(jobId);
    invitation.setContractorUserId(contractorUserId);
    invitation.setStatus("accepted");
    invitation.setExpectedNetLow(job.getEstimatedContractorNetLow());
    invitation.setExpectedNetHigh(job.getEstimatedContractorNetHigh());
    if (invitation.getInvitedBy() == null) {
      invitation.setInvitedBy(principal.getId());
    }
    if (invitation.getRespondedAt() == null) {
      invitation.setRespondedAt(OffsetDateTime.now());
    }
    jobInvitationRepository.save(invitation);

    job.setAssignedContractorUserId(contractorUserId);

    if (request != null && request.getEmployeeId() != null && request.getEmployeeId() > 0) {
      job.setAssignedEmployeeId(request.getEmployeeId());
    } else if (request != null && Boolean.TRUE.equals(request.getClearEmployee())) {
      job.setAssignedEmployeeId(null);
    }

    String current = normalizeStatus(job.getStatus());
    if (!SKIP_ACCEPT_TRANSITION.contains(current)) {
      job.setStatus("awaiting_bid");
    } else if ("contractor_invited".equals(current) || "contractor_accepted".equals(current)) {
      job.setStatus("awaiting_bid");
    }

    ManagedJobEntity saved = managedJobRepository.save(job);

    auditService.write(
        principal.getId(),
        "job_assign",
        "managed_job",
        jobId,
        Map.of("contractorUserId", contractorUserId));

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("job", managedJobMapper.toDto(saved, principal));
    body.put(
        "contractor",
        Map.of(
            "id", contractor.getId(),
            "name", contractor.getName() != null ? contractor.getName() : "",
            "email", contractor.getEmail() != null ? contractor.getEmail() : ""));
    return body;
  }

  private UserEntity requireEligibleContractor(Long contractorUserId) {
    UserEntity contractor =
        userRepository
            .findById(contractorUserId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Contractor not found."));
    if (!"contractor".equals(contractor.getRole())) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Contractor not found.");
    }
    if (contractor.isBlocked()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "This contractor account is blocked.");
    }
    String compliance =
        String.valueOf(contractor.getComplianceStatus() == null ? "draft" : contractor.getComplianceStatus())
            .toLowerCase(Locale.ROOT);
    if (BLOCKED_COMPLIANCE.contains(compliance)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Contractor is suspended or rejected.");
    }
    return contractor;
  }

  private void createInvitationNotification(Long contractorUserId, ManagedJobEntity job) {
    NotificationEntity n = new NotificationEntity();
    n.setUserId(contractorUserId);
    n.setUserRole("contractor");
    n.setJobId(job.getId());
    n.setType("job_invitation");
    n.setTitle("Job invitation");
    String booking =
        StringUtils.hasText(job.getBookingId()) ? job.getBookingId() : "FB-" + job.getId();
    n.setMessage("You've been invited to " + booking + ".");
    n.setEntityType("job");
    n.setEntityId(job.getId());
    notificationRepository.save(n);
  }

  private static Comparator<ManagedJobEntity> workQueueComparator() {
    return Comparator
        .comparingInt(AdminOpsService::priorityRank)
        .thenComparing(
            ManagedJobEntity::getUpdatedAt, Comparator.nullsLast(Comparator.reverseOrder()));
  }

  private static int priorityRank(ManagedJobEntity j) {
    String tier =
        j.getPriorityTier() == null ? "standard" : j.getPriorityTier().toLowerCase(Locale.ROOT);
    return switch (tier) {
      case "emergency" -> 0;
      case "homecare_pro_high" -> 1;
      case "homecare_pro" -> 2;
      default -> 3;
    };
  }

  private static String normalizeStatus(String status) {
    return status == null ? "" : status.toLowerCase(Locale.ROOT);
  }

  private static String blank(String value) {
    return value == null ? "" : value.trim();
  }

  private static String blankToNull(String value) {
    if (!StringUtils.hasText(value)) {
      return null;
    }
    return value.trim();
  }
}
