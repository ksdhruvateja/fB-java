package com.fixbridge.payout.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.changeorder.entity.ChangeOrderEntity;
import com.fixbridge.payout.entity.ContractorPayoutEntity;
import com.fixbridge.payment.entity.JobTipEntity;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.payout.entity.PayoutAuditLogEntity;
import com.fixbridge.payout.entity.PayoutSettingsEntity;
import com.fixbridge.quote.entity.ProposalEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.changeorder.repository.ChangeOrderRepository;
import com.fixbridge.payout.repository.ContractorPayoutRepository;
import com.fixbridge.payment.repository.JobTipRepository;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.payout.repository.PayoutAuditLogRepository;
import com.fixbridge.payout.repository.PayoutSettingsRepository;
import com.fixbridge.quote.repository.ProposalRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import com.fixbridge.common.util.MoneyUtil;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.fixbridge.admin.service.AuditService;
import com.fixbridge.notification.service.NotificationService;
@Service
public class PayoutOpsService {

  private final ContractorPayoutRepository contractorPayoutRepository;
  private final PayoutSettingsRepository payoutSettingsRepository;
  private final PayoutAuditLogRepository payoutAuditLogRepository;
  private final ManagedJobRepository managedJobRepository;
  private final ProposalRepository proposalRepository;
  private final ChangeOrderRepository changeOrderRepository;
  private final JobTipRepository jobTipRepository;
  private final UserRepository userRepository;
  private final NotificationService notificationService;
  private final ObjectMapper objectMapper;
  private final AuditService auditService;

  public PayoutOpsService(
      ContractorPayoutRepository contractorPayoutRepository,
      PayoutSettingsRepository payoutSettingsRepository,
      PayoutAuditLogRepository payoutAuditLogRepository,
      ManagedJobRepository managedJobRepository,
      ProposalRepository proposalRepository,
      ChangeOrderRepository changeOrderRepository,
      JobTipRepository jobTipRepository,
      UserRepository userRepository,
      NotificationService notificationService,
      ObjectMapper objectMapper,
      AuditService auditService) {
    this.contractorPayoutRepository = contractorPayoutRepository;
    this.payoutSettingsRepository = payoutSettingsRepository;
    this.payoutAuditLogRepository = payoutAuditLogRepository;
    this.managedJobRepository = managedJobRepository;
    this.proposalRepository = proposalRepository;
    this.changeOrderRepository = changeOrderRepository;
    this.jobTipRepository = jobTipRepository;
    this.userRepository = userRepository;
    this.notificationService = notificationService;
    this.objectMapper = objectMapper;
    this.auditService = auditService;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> listAdminPayouts(String status) {
    List<ContractorPayoutEntity> rows;
    if (StringUtils.hasText(status)) {
      rows = contractorPayoutRepository.findByStatusOrderByCreatedAtDesc(status.trim());
    } else {
      rows = contractorPayoutRepository.findTop200ByOrderByCreatedAtDesc();
    }
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("payouts", rows.stream().map(this::toAdminDto).collect(Collectors.toList()));
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> getPayoutSettings() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("settings", toSettingsDto(loadOrCreateSettings()));
    return body;
  }

  @Transactional
  public Map<String, Object> updatePayoutSettings(Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    PayoutSettingsEntity s = loadOrCreateSettings();
    Map<String, Object> bodyIn = request != null ? request : Map.of();
    if (bodyIn.get("instantPayoutEnabled") != null) {
      s.setInstantPayoutEnabled(Boolean.TRUE.equals(bodyIn.get("instantPayoutEnabled")));
    }
    if (bodyIn.get("instantFeeType") != null) {
      s.setInstantFeeType(String.valueOf(bodyIn.get("instantFeeType")));
    }
    if (bodyIn.get("instantFeePercentageBps") != null) {
      s.setInstantFeePercentageBps(asInt(bodyIn.get("instantFeePercentageBps")));
    }
    if (bodyIn.get("instantFeeFixedCents") != null) {
      s.setInstantFeeFixedCents(asInt(bodyIn.get("instantFeeFixedCents")));
    }
    if (bodyIn.get("minimumInstantFeeCents") != null) {
      s.setMinimumInstantFeeCents(asInt(bodyIn.get("minimumInstantFeeCents")));
    }
    if (bodyIn.get("maximumInstantFeeCents") != null) {
      s.setMaximumInstantFeeCents(asInt(bodyIn.get("maximumInstantFeeCents")));
    }
    if (bodyIn.get("minimumInstantPayoutCents") != null) {
      s.setMinimumInstantPayoutCents(asInt(bodyIn.get("minimumInstantPayoutCents")));
    }
    if (bodyIn.get("maximumInstantPayoutCents") != null) {
      s.setMaximumInstantPayoutCents(asInt(bodyIn.get("maximumInstantPayoutCents")));
    }
    if (bodyIn.get("contractorAbsorbsFee") != null) {
      s.setContractorAbsorbsFee(Boolean.TRUE.equals(bodyIn.get("contractorAbsorbsFee")));
    }
    if (bodyIn.get("fixbridgeAbsorbsFee") != null) {
      s.setFixbridgeAbsorbsFee(Boolean.TRUE.equals(bodyIn.get("fixbridgeAbsorbsFee")));
    }
    s.setUpdatedBy(principal.getId());
    payoutSettingsRepository.save(s);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("settings", toSettingsDto(s));
    body.put("message", "Payout settings updated.");
    return body;
  }

  @Transactional
  public Map<String, Object> approvePayout(Long id) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ContractorPayoutEntity payout =
        contractorPayoutRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Payout not found."));

    if (StringUtils.hasText(payout.getStripeTransferId())) {
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("ok", true);
      body.put("alreadyPaid", true);
      body.put("payout", toAdminDto(payout));
      body.put("message", "Payout transfer already exists for this record.");
      return body;
    }

    String prev = payout.getStatus();
    payout.setStatus("approved");
    payout.setApprovedBy(principal.getId());
    payout.setApprovedAt(OffsetDateTime.now());
    payout.setPayoutMethod("standard");

    // Simulate transfer when no real Stripe Connect transfer is available.
    String transferId = "sim_tr_" + payout.getId();
    payout.setStripeTransferId(transferId);
    payout.setStatus("paid");
    payout.setPaidAt(OffsetDateTime.now());
    contractorPayoutRepository.save(payout);

    logAudit(payout.getId(), "approved", prev, "paid", principal.getId(), Map.of("transferId", transferId, "simulated", true));
    auditService.write(
        principal.getId(),
        "payout_approve",
        "payout",
        payout.getId(),
        Map.of("transferId", transferId, "jobId", payout.getJobId() == null ? "" : payout.getJobId()));

    if (payout.getContractorId() != null) {
      notificationService.create(
          payout.getContractorId(),
          "contractor",
          payout.getJobId(),
          "payout_released",
          "Payout released",
          "Your payout for "
              + (payout.getJobRef() != null ? payout.getJobRef() : "Job #" + payout.getJobId())
              + " has been approved.",
          "payout",
          payout.getId(),
          null,
          null);
    }

    ManagedJobEntity job = managedJobRepository.findById(payout.getJobId()).orElse(null);
    if (job != null
        && !List.of("paid_out", "closed", "canceled", "refunded")
            .contains(String.valueOf(job.getStatus()).toLowerCase(Locale.ROOT))) {
      job.setStatus("paid_out");
      job.setUpdatedAt(OffsetDateTime.now());
      managedJobRepository.save(job);
      job.setStatus("closed");
      job.setUpdatedAt(OffsetDateTime.now());
      managedJobRepository.save(job);
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("payout", toAdminDto(payout));
    body.put("transferId", transferId);
    body.put("simulated", true);
    return body;
  }

  @Transactional
  public Map<String, Object> adjustPayout(Long id, Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ContractorPayoutEntity payout =
        contractorPayoutRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Payout not found."));
    if (StringUtils.hasText(payout.getStripeTransferId())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Payout can no longer be adjusted.");
    }

    Map<String, Object> bodyIn = request != null ? request : Map.of();
    int adjustmentsCents;
    if (bodyIn.get("adjustmentsCents") != null) {
      adjustmentsCents = asInt(bodyIn.get("adjustmentsCents"));
    } else if (bodyIn.get("adjustmentAmount") != null) {
      adjustmentsCents =
          (int) MoneyUtil.dollarsToCents(new BigDecimal(String.valueOf(bodyIn.get("adjustmentAmount"))));
    } else {
      adjustmentsCents = 0;
    }

    String reason = bodyIn.get("reason") != null ? String.valueOf(bodyIn.get("reason")).trim() : "";
    if (adjustmentsCents != 0 && !StringUtils.hasText(reason)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Reason is required for nonzero adjustments.");
    }

    int previousAdj = payout.getAdjustmentsCents() != null ? payout.getAdjustmentsCents() : 0;
    int base =
        (payout.getNetAmountCents() != null ? payout.getNetAmountCents() : 0) - previousAdj;
    int net = Math.max(0, base + adjustmentsCents);
    String prevStatus = payout.getStatus();
    payout.setAdjustmentsCents(adjustmentsCents);
    payout.setNetAmountCents(net);
    contractorPayoutRepository.save(payout);

    ObjectNode meta = objectMapper.createObjectNode();
    meta.put("adjustmentsCents", adjustmentsCents);
    meta.put("reason", reason);
    meta.put("previousAdjustmentsCents", previousAdj);
    logAudit(payout.getId(), "adjusted", prevStatus, payout.getStatus(), principal.getId(), meta);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("payout", toAdminDto(payout));
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> listContractorPayouts() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    List<Map<String, Object>> payouts =
        contractorPayoutRepository
            .findByContractorIdOrderByCreatedAtDesc(principal.getId())
            .stream()
            .map(this::toContractorSafeDto)
            .collect(Collectors.toList());
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("payouts", payouts);
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> contractorPayoutAccount() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    UserEntity user =
        userRepository
            .findById(principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found."));
    boolean connected = StringUtils.hasText(user.getStripeAccountId());
    boolean payoutsEnabled = Boolean.TRUE.equals(user.getStripePayoutsEnabled());
    String onboarding =
        StringUtils.hasText(user.getStripeOnboardingStatus())
            ? user.getStripeOnboardingStatus()
            : (connected ? "pending" : "not_connected");
    Map<String, Object> account = new LinkedHashMap<>();
    account.put("connected", connected);
    account.put("stripeAccountId", user.getStripeAccountId());
    account.put("onboardingStatus", onboarding);
    account.put("payoutsEnabled", payoutsEnabled);
    account.put("readyToReceivePayouts", connected && payoutsEnabled);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("account", account);
    return body;
  }

  @Transactional
  public ContractorPayoutEntity ensurePayoutForJob(Long jobId, String initialStatus, Long actorUserId) {
    ManagedJobEntity job =
        managedJobRepository
            .findById(jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
    if (job.getAssignedContractorUserId() == null) {
      return null;
    }

    ProposalEntity proposal =
        proposalRepository.findFirstByJobIdOrderByCreatedAtDesc(jobId).orElse(null);
    BigDecimal tipDollars =
        jobTipRepository
            .findFirstByJobIdAndStatusOrderByCreatedAtDesc(jobId, "paid")
            .map(JobTipEntity::getAmount)
            .orElse(BigDecimal.ZERO);

    BigDecimal coContractorNet = BigDecimal.ZERO;
    BigDecimal coRetail = BigDecimal.ZERO;
    for (ChangeOrderEntity co : changeOrderRepository.findByJobIdOrderByCreatedAtDesc(jobId)) {
      if ("approved".equalsIgnoreCase(co.getStatus())) {
        if (co.getContractorNet() != null) {
          coContractorNet = coContractorNet.add(co.getContractorNet());
        }
        if (co.getRetailAmount() != null) {
          coRetail = coRetail.add(co.getRetailAmount());
        }
      }
    }

    BigDecimal baseRetail =
        proposal != null && proposal.getRetailAmount() != null
            ? proposal.getRetailAmount()
            : (job.getCustomerRetailEstimateHigh() != null
                ? job.getCustomerRetailEstimateHigh()
                : BigDecimal.ZERO);
    BigDecimal baseNet =
        proposal != null && proposal.getContractorNet() != null
            ? proposal.getContractorNet()
            : (job.getEstimatedContractorNetHigh() != null
                ? job.getEstimatedContractorNetHigh()
                : (job.getEstimatedContractorNetLow() != null
                    ? job.getEstimatedContractorNetLow()
                    : BigDecimal.ZERO));

    int retailCents = (int) MoneyUtil.dollarsToCents(baseRetail.add(coRetail));
    int serviceNetCents = (int) MoneyUtil.dollarsToCents(baseNet.add(coContractorNet));
    int tipCents = (int) MoneyUtil.dollarsToCents(tipDollars);
    int platformFee = Math.max(0, retailCents - serviceNetCents);
    int gross = serviceNetCents + tipCents;
    int net = Math.max(0, serviceNetCents + tipCents);

    return contractorPayoutRepository
        .findByJobId(jobId)
        .map(
            existing -> {
              if (!StringUtils.hasText(existing.getStripeTransferId())) {
                int adj = existing.getAdjustmentsCents() != null ? existing.getAdjustmentsCents() : 0;
                existing.setGrossAmountCents(gross);
                existing.setPlatformFeeCents(platformFee);
                existing.setNetAmountCents(Math.max(0, net + adj));
                existing.setServiceAmountCents(retailCents);
                existing.setTipAmountCents(tipCents);
                return contractorPayoutRepository.save(existing);
              }
              return existing;
            })
        .orElseGet(
            () -> {
              String status =
                  StringUtils.hasText(initialStatus)
                      ? initialStatus
                      : (List.of(
                                  "work_completed",
                                  "customer_review_pending",
                                  "admin_review_pending",
                                  "payout_pending")
                              .contains(String.valueOf(job.getStatus()).toLowerCase(Locale.ROOT))
                          ? "pending_approval"
                          : "pending_job_completion");

              String customerLabel =
                  joinLabel(job.getContactName(), job.getCityStateZip(), job.getFullAddress());

              ContractorPayoutEntity payout = new ContractorPayoutEntity();
              payout.setContractorId(job.getAssignedContractorUserId());
              payout.setJobId(jobId);
              payout.setJobRef(
                  job.getBookingId() != null ? job.getBookingId() : "FB-" + jobId);
              payout.setCustomerLabel(customerLabel);
              payout.setCompletionDate(
                  job.getUpdatedAt() != null ? job.getUpdatedAt() : OffsetDateTime.now());
              payout.setGrossAmountCents(gross);
              payout.setPlatformFeeCents(platformFee);
              payout.setAdjustmentsCents(0);
              payout.setNetAmountCents(net);
              payout.setServiceAmountCents(retailCents);
              payout.setTipAmountCents(tipCents);
              payout.setStatus(status);
              ContractorPayoutEntity saved = contractorPayoutRepository.save(payout);
              logAudit(
                  saved.getId(),
                  "created",
                  null,
                  status,
                  actorUserId,
                  Map.of("jobId", jobId, "grossAmountCents", gross));
              notificationService.create(
                  job.getAssignedContractorUserId(),
                  "contractor",
                  jobId,
                  "payout_available",
                  "Payout available",
                  "A payout of $"
                      + MoneyUtil.centsToDollars(net)
                      + " for "
                      + saved.getJobRef()
                      + " is pending admin approval.",
                  "payout",
                  saved.getId(),
                  null,
                  null);
              return saved;
            });
  }

  private PayoutSettingsEntity loadOrCreateSettings() {
    return payoutSettingsRepository
        .findById("default")
        .orElseGet(
            () -> {
              PayoutSettingsEntity created = new PayoutSettingsEntity();
              created.setId("default");
              return payoutSettingsRepository.save(created);
            });
  }

  private void logAudit(
      Long payoutId,
      String action,
      String previousStatus,
      String newStatus,
      Long performedBy,
      Object metadata) {
    PayoutAuditLogEntity log = new PayoutAuditLogEntity();
    log.setPayoutId(payoutId);
    log.setAction(action);
    log.setPreviousStatus(previousStatus);
    log.setNewStatus(newStatus);
    log.setPerformedBy(performedBy);
    if (metadata != null) {
      log.setMetadata(objectMapper.valueToTree(metadata));
    }
    payoutAuditLogRepository.save(log);
  }

  private Map<String, Object> toAdminDto(ContractorPayoutEntity p) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", p.getId());
    m.put("contractorId", p.getContractorId());
    m.put("jobId", p.getJobId());
    m.put("jobRef", p.getJobRef());
    m.put("customerLabel", p.getCustomerLabel());
    m.put("completionDate", p.getCompletionDate());
    m.put("grossAmountCents", p.getGrossAmountCents());
    m.put("platformFeeCents", p.getPlatformFeeCents());
    m.put("instantPayoutFeeCents", p.getInstantPayoutFeeCents());
    m.put("adjustmentsCents", p.getAdjustmentsCents());
    m.put("netAmountCents", p.getNetAmountCents());
    m.put("reserveAmountCents", p.getReserveAmountCents());
    m.put("serviceAmountCents", p.getServiceAmountCents());
    m.put("tipAmountCents", p.getTipAmountCents());
    m.put("payoutMethod", p.getPayoutMethod());
    m.put("stripeTransferId", p.getStripeTransferId());
    m.put("status", p.getStatus());
    m.put("holdReason", p.getHoldReason());
    m.put("heldAt", p.getHeldAt());
    m.put("approvedBy", p.getApprovedBy());
    m.put("approvedAt", p.getApprovedAt());
    m.put("paidAt", p.getPaidAt());
    m.put("createdAt", p.getCreatedAt());
    m.put("updatedAt", p.getUpdatedAt());
    return m;
  }

  private Map<String, Object> toContractorSafeDto(ContractorPayoutEntity p) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", p.getId());
    m.put("jobId", p.getJobId());
    m.put("jobRef", p.getJobRef());
    m.put("customerLabel", p.getCustomerLabel());
    m.put("completionDate", p.getCompletionDate());
    m.put("grossAmountCents", p.getGrossAmountCents());
    m.put("adjustmentsCents", p.getAdjustmentsCents());
    m.put("netAmountCents", p.getNetAmountCents());
    m.put("serviceAmountCents", p.getServiceAmountCents());
    m.put("tipAmountCents", p.getTipAmountCents());
    m.put("payoutMethod", p.getPayoutMethod());
    m.put("status", p.getStatus());
    m.put("paidAt", p.getPaidAt());
    m.put("estimatedPayoutAt", p.getEstimatedPayoutAt());
    m.put("createdAt", p.getCreatedAt());
    return m;
  }

  private Map<String, Object> toSettingsDto(PayoutSettingsEntity s) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", s.getId());
    m.put("instantPayoutEnabled", s.getInstantPayoutEnabled());
    m.put("instantFeeType", s.getInstantFeeType());
    m.put("instantFeePercentageBps", s.getInstantFeePercentageBps());
    m.put("instantFeeFixedCents", s.getInstantFeeFixedCents());
    m.put("minimumInstantFeeCents", s.getMinimumInstantFeeCents());
    m.put("maximumInstantFeeCents", s.getMaximumInstantFeeCents());
    m.put("minimumInstantPayoutCents", s.getMinimumInstantPayoutCents());
    m.put("maximumInstantPayoutCents", s.getMaximumInstantPayoutCents());
    m.put("contractorAbsorbsFee", s.getContractorAbsorbsFee());
    m.put("fixbridgeAbsorbsFee", s.getFixbridgeAbsorbsFee());
    m.put("updatedBy", s.getUpdatedBy());
    m.put("updatedAt", s.getUpdatedAt());
    return m;
  }

  private static String joinLabel(String contact, String cityStateZip, String fullAddress) {
    String left = StringUtils.hasText(contact) ? contact.trim() : null;
    String right =
        StringUtils.hasText(cityStateZip)
            ? cityStateZip.trim()
            : (StringUtils.hasText(fullAddress) ? fullAddress.trim() : null);
    if (left != null && right != null) {
      return left + " · " + right;
    }
    if (left != null) {
      return left;
    }
    if (right != null) {
      return right;
    }
    return "Customer";
  }

  private static int asInt(Object value) {
    if (value == null) {
      return 0;
    }
    if (value instanceof Number n) {
      return n.intValue();
    }
    try {
      return Integer.parseInt(String.valueOf(value).trim());
    } catch (NumberFormatException e) {
      return 0;
    }
  }
}
