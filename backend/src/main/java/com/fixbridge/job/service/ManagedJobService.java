package com.fixbridge.job.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.auth.dto.response.UserDto;
import com.fixbridge.job.dto.request.CancelJobRequest;
import com.fixbridge.job.dto.request.HomeownerUpdateRequest;
import com.fixbridge.job.dto.request.ManagedJobCreateRequest;
import com.fixbridge.job.dto.response.ManagedJobDto;
import com.fixbridge.job.dto.request.PublicJobRequest;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.payment.entity.PaymentEntity;
import com.fixbridge.property.entity.PropertyEntity;
import com.fixbridge.quote.entity.ProposalEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.integration.highlevel.HighLevelClient;
import com.fixbridge.job.mapper.ManagedJobMapper;
import com.fixbridge.auth.mapper.UserMapper;
import com.fixbridge.job.repository.JobInvitationRepository;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.payment.repository.PaymentRepository;
import com.fixbridge.property.repository.PropertyRepository;
import com.fixbridge.quote.repository.ProposalRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.jwt.JwtService;
import com.fixbridge.security.authorization.ManagedJobAccess;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.fixbridge.payment.service.CheckoutPricingService;
import com.fixbridge.payout.service.PayoutOpsService;
@Service
public class ManagedJobService {

  private static final Set<String> HOMEOWNER_CANCELABLE_STATUSES = Set.of(
      "draft",
      "ai_review_complete",
      "awaiting_service_payment",
      "paid_for_dispatch",
      "awaiting_contractor",
      "contractor_invited",
      "contractor_accepted",
      "matching",
      "bids_open",
      "awaiting_bid",
      "diagnosing",
      "bid_received",
      "proposal_sent",
      "awaiting_customer_approval",
      "approved",
      "scheduled",
      "contractor_en_route",
      "work_started",
      "change_order_pending");

  private static final Set<String> LOCKED_FOR_HOMEOWNER_EDIT = Set.of(
      "work_started",
      "change_order_pending",
      "work_completed",
      "customer_review_pending",
      "admin_review_pending",
      "payout_pending",
      "paid_out",
      "closed",
      "canceled",
      "refunded",
      "disputed");

  private static final Map<String, String> CANCELLATION_REASON_LABELS = Map.of(
      "resolved", "Problem resolved / no longer need service",
      "schedule_conflict", "Schedule no longer works",
      "other_provider", "Found another provider",
      "price", "Price / quote is too high",
      "change_request", "Need to change the service request",
      "provider_issue", "Provider issue",
      "created_by_mistake", "Created by mistake",
      "other", "Other");

  private final ManagedJobRepository managedJobRepository;
  private final JobInvitationRepository jobInvitationRepository;
  private final PropertyRepository propertyRepository;
  private final UserRepository userRepository;
  private final ProposalRepository proposalRepository;
  private final PaymentRepository paymentRepository;
  private final ManagedJobMapper managedJobMapper;
  private final UserMapper userMapper;
  private final JwtService jwtService;
  private final PasswordEncoder passwordEncoder;
  private final ObjectMapper objectMapper;
  private final CheckoutPricingService checkoutPricingService;
  private final PayoutOpsService payoutOpsService;
  private final HighLevelClient highLevelClient;
  private final SecureRandom secureRandom = new SecureRandom();

  public ManagedJobService(
      ManagedJobRepository managedJobRepository,
      JobInvitationRepository jobInvitationRepository,
      PropertyRepository propertyRepository,
      UserRepository userRepository,
      ProposalRepository proposalRepository,
      PaymentRepository paymentRepository,
      ManagedJobMapper managedJobMapper,
      UserMapper userMapper,
      JwtService jwtService,
      PasswordEncoder passwordEncoder,
      ObjectMapper objectMapper,
      CheckoutPricingService checkoutPricingService,
      PayoutOpsService payoutOpsService,
      HighLevelClient highLevelClient) {
    this.managedJobRepository = managedJobRepository;
    this.jobInvitationRepository = jobInvitationRepository;
    this.propertyRepository = propertyRepository;
    this.userRepository = userRepository;
    this.proposalRepository = proposalRepository;
    this.paymentRepository = paymentRepository;
    this.managedJobMapper = managedJobMapper;
    this.userMapper = userMapper;
    this.jwtService = jwtService;
    this.passwordEncoder = passwordEncoder;
    this.objectMapper = objectMapper;
    this.checkoutPricingService = checkoutPricingService;
    this.payoutOpsService = payoutOpsService;
    this.highLevelClient = highLevelClient;
  }

  @Transactional
  public ManagedJobDto create(ManagedJobCreateRequest request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    if (!"homeowner".equals(principal.getRole()) && !"admin".equals(principal.getRole())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Homeowners can report issues.");
    }
    if (request == null
        || (!StringUtils.hasText(request.getDescription()) && !StringUtils.hasText(request.getTitle()))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Please describe the issue.");
    }

    String fullAddress = blank(request.getFullAddress());
    String cityStateZip = blank(request.getCityStateZip());
    String streetAddress = blank(request.getStreetAddress());
    String city = blank(request.getCity());
    String state = blank(request.getState());
    String zip = blank(request.getZip());
    String country = StringUtils.hasText(request.getCountry()) ? request.getCountry().trim() : "US";
    Long propertyId = request.getPropertyId();

    if (propertyId != null) {
      PropertyEntity property =
          propertyRepository
              .findByIdAndOwnerUserId(propertyId, principal.getId())
              .orElse(null);
      if (property != null) {
        fullAddress =
            joinNonBlank(
                property.getAddressLine1(),
                property.getAddressLine2(),
                property.getCity(),
                property.getState(),
                property.getZip(),
                property.getCountry());
        cityStateZip = joinNonBlank(property.getCity(), property.getState(), property.getZip());
        streetAddress = blank(property.getAddressLine1());
        city = blank(property.getCity());
        state = blank(property.getState());
        zip = blank(property.getZip());
        country = property.getCountry() != null ? property.getCountry() : "US";
      }
    } else {
      if (!StringUtils.hasText(fullAddress)) {
        fullAddress = joinNonBlank(streetAddress, city, state, zip, country);
      }
      if (!StringUtils.hasText(cityStateZip)) {
        cityStateZip = joinNonBlank(city, state, zip);
      }
    }

    String category = StringUtils.hasText(request.getCategory()) ? request.getCategory().trim() : "Others";
    ManagedJobEntity job = new ManagedJobEntity();
    job.setHomeownerUserId(principal.getId());
    job.setPropertyId(propertyId);
    job.setStatus("draft");
    job.setJobMode("managed");
    job.setCategory(category);
    job.setServiceSubcategory(blankToNull(request.getServiceSubcategory()));
    job.setTitle(
        StringUtils.hasText(request.getTitle())
            ? request.getTitle().trim()
            : category + " issue");
    job.setDescription(request.getDescription() != null ? request.getDescription() : "");
    job.setMediaDataUrl(blankToNull(request.getMediaDataUrl()));
    job.setMediaType(blankToNull(request.getMediaType()));
    job.setPreferredDate(blankToNull(request.getPreferredDate()));
    job.setPreferredTimeSlot(blankToNull(request.getPreferredTimeSlot()));
    job.setServiceTiming(
        StringUtils.hasText(request.getServiceTiming()) ? request.getServiceTiming().trim() : "weekday");
    job.setCityStateZip(StringUtils.hasText(cityStateZip) ? cityStateZip : "TBD");
    job.setFullAddress(StringUtils.hasText(fullAddress) ? fullAddress : "TBD");
    job.setStreetAddress(blankToNull(streetAddress));
    job.setCity(blankToNull(city));
    job.setState(blankToNull(state));
    job.setZip(blankToNull(zip));
    job.setCountry(country);
    job.setContactName(
        StringUtils.hasText(request.getContactName())
            ? request.getContactName().trim()
            : (principal.getEmail() != null ? principal.getEmail() : "Customer"));
    job.setContactPhone(request.getContactPhone() != null ? request.getContactPhone() : "");
    job.setPartnerCode(blankToNull(request.getPartnerCode()));
    job.setReferralSource(blankToNull(request.getReferralSource()));
    job.setReferringName(blankToNull(request.getReferringName()));
    job.setReferringCompany(blankToNull(request.getReferringCompany()));
    job.setReferringEmail(blankToNull(request.getReferringEmail()));
    job.setReferringPhone(blankToNull(request.getReferringPhone()));
    job.setCustomerPartnerStatusConsent(Boolean.TRUE.equals(request.getCustomerPartnerStatusConsent()));
    if (Boolean.TRUE.equals(request.getCustomerPartnerStatusConsent())) {
      job.setConsentTimestamp(OffsetDateTime.now());
    }
    job.setConsentVersion(
        StringUtils.hasText(request.getConsentVersion()) ? request.getConsentVersion() : "1.0");
    job.setPropertyPurpose(blankToNull(request.getPropertyPurpose()));
    job.setTransactionStage(blankToNull(request.getTransactionStage()));
    job.setListingDeadline(blankToNull(request.getListingDeadline()));
    job.setClosingDeadline(blankToNull(request.getClosingDeadline()));
    job.setInspectionReportUrl(blankToNull(request.getInspectionReportUrl()));
    job.setListingReferenceUrl(blankToNull(request.getListingReferenceUrl()));
    job.setPropertyOpportunityNotes(blankToNull(request.getPropertyOpportunityNotes()));
    job.setPriorityTier("standard");
    if (StringUtils.hasText(request.getDiscountCode())) {
      job.setDiscountCode(request.getDiscountCode().trim().toUpperCase(Locale.ROOT));
    }
    if (StringUtils.hasText(request.getPartnerCode())) {
      job.setPartnerCode(request.getPartnerCode().trim().toUpperCase(Locale.ROOT));
      job.setReferralStatus("referral_received");
    }

    ManagedJobEntity saved = managedJobRepository.save(job);
    saved.setBookingId(formatBookingId(saved.getId(), saved.getCreatedAt()));
    saved = managedJobRepository.save(saved);
    return managedJobMapper.toDto(saved, principal);
  }

  @Transactional(readOnly = true)
  public List<ManagedJobDto> listMine() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    List<ManagedJobEntity> rows;
    if ("homeowner".equals(principal.getRole())) {
      rows = managedJobRepository.findByHomeownerUserIdOrderByCreatedAtDesc(principal.getId());
    } else if ("contractor".equals(principal.getRole())) {
      rows = managedJobRepository.findAssignedToContractor(principal.getId());
    } else {
      rows = Collections.emptyList();
    }
    return rows.stream()
        .map(j -> enrichFinance(managedJobMapper.toDto(j, principal), j))
        .collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public ManagedJobDto getById(Long id) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job = requireReadable(id, principal);
    return enrichFinance(managedJobMapper.toDto(job, principal), job);
  }

  @Transactional
  public ManagedJobDto homeownerUpdate(Long id, HomeownerUpdateRequest request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job = requireMutable(id, principal, false);
    if (LOCKED_FOR_HOMEOWNER_EDIT.contains(String.valueOf(job.getStatus()).toLowerCase(Locale.ROOT))) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "This request can no longer be edited. Contact FixBridge support if you need changes.");
    }
    if (request == null) {
      return managedJobMapper.toDto(job, principal);
    }
    if (request.getServiceTiming() != null) {
      job.setServiceTiming(truncate(request.getServiceTiming(), 40));
    }
    if (request.getPreferredDate() != null) {
      job.setPreferredDate(
          StringUtils.hasText(request.getPreferredDate())
              ? truncate(request.getPreferredDate(), 32)
              : null);
    }
    if (request.getPreferredTimeSlot() != null) {
      job.setPreferredTimeSlot(truncate(request.getPreferredTimeSlot(), 40));
    }
    if (request.getDescription() != null) {
      job.setDescription(truncate(request.getDescription(), 4000));
    }
    if (request.getContactPhone() != null) {
      job.setContactPhone(truncate(request.getContactPhone(), 40));
    }
    if (request.getTitle() != null) {
      job.setTitle(truncate(request.getTitle(), 200));
    }
    return managedJobMapper.toDto(managedJobRepository.save(job), principal);
  }

  @Transactional
  public Map<String, Object> cancel(Long id, CancelJobRequest request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    if (id == null || id <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid job id.");
    }
    ManagedJobEntity job =
        managedJobRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));

    boolean isOwner = principal.getId() != null && principal.getId().equals(job.getHomeownerUserId());
    boolean isAdmin = ManagedJobAccess.isAdminRole(principal);
    if (!isOwner && !isAdmin) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);

    if ("canceled".equalsIgnoreCase(job.getStatus())) {
      body.put("alreadyCancelled", true);
      body.put("job", managedJobMapper.toDto(job, principal));
      return body;
    }

    if (!HOMEOWNER_CANCELABLE_STATUSES.contains(String.valueOf(job.getStatus()).toLowerCase(Locale.ROOT))) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "This service can no longer be cancelled online. Contact FixBridge support for help.");
    }

    ParsedCancellation parsed = normalizeCancellation(request);
    job.setStatus("canceled");
    job.setCancellationReason(parsed.cancellationReason);
    job.setCancellationReasonCode(parsed.reasonCode);
    job.setCancellationDetails(parsed.details);
    job.setCancelledAt(OffsetDateTime.now());
    job.setCancelledBy(isAdmin ? "admin" : "homeowner");
    ManagedJobEntity saved = managedJobRepository.save(job);
    trackJobStatusEvent(saved, "canceled");
    body.put("job", managedJobMapper.toDto(saved, principal));
    return body;
  }

  @Transactional
  public Map<String, Object> deleteJob(Long id) {
    CancelJobRequest request = new CancelJobRequest();
    request.setReasonCode("created_by_mistake");
    request.setCancellationReasonCode("created_by_mistake");
    return cancel(id, request);
  }

  @Transactional
  public Map<String, Object> requestProfessional(Long id, Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job =
        managedJobRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
    boolean allowed =
        ManagedJobAccess.isAdminRole(principal)
            || ManagedJobAccess.isHomeownerOwner(principal, job.getHomeownerUserId());
    if (!allowed) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }

    String status = String.valueOf(job.getStatus()).toLowerCase(Locale.ROOT);
    boolean assessmentFailed = "failed".equalsIgnoreCase(job.getAssessmentStatus());
    boolean professionalAllowed =
        Set.of("ai_review_complete", "awaiting_service_payment").contains(status)
            || (assessmentFailed && "draft".equals(status));
    if (!professionalAllowed) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "Professional dispatch is not available for this job status.");
    }

    Map<String, Object> bodyIn = request != null ? request : Map.of();
    if (bodyIn.get("serviceTiming") != null) {
      job.setServiceTiming(truncate(String.valueOf(bodyIn.get("serviceTiming")), 40));
    }
    if (bodyIn.get("preferredDate") != null) {
      String pd = String.valueOf(bodyIn.get("preferredDate")).trim();
      job.setPreferredDate(StringUtils.hasText(pd) ? truncate(pd, 32) : null);
    }
    if (bodyIn.get("preferredTimeSlot") != null) {
      job.setPreferredTimeSlot(truncate(String.valueOf(bodyIn.get("preferredTimeSlot")), 40));
    }
    if (bodyIn.get("propertyPurpose") != null) {
      job.setPropertyPurpose(truncate(String.valueOf(bodyIn.get("propertyPurpose")), 80));
    }
    if (bodyIn.get("transactionStage") != null) {
      job.setTransactionStage(truncate(String.valueOf(bodyIn.get("transactionStage")), 80));
    }
    job.setJobMode("managed");
    if ("ai_review_complete".equals(status) || (assessmentFailed && "draft".equals(status))) {
      job.setStatus("awaiting_service_payment");
    }
    job.setUpdatedAt(OffsetDateTime.now());
    ManagedJobEntity saved = managedJobRepository.save(job);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("job", enrichFinance(managedJobMapper.toDto(saved, principal), saved));
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> dispatchPricing(Long id) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job = requireJobForHomeownerOrAdmin(id, principal);
    JsonNode breakdown = checkoutPricingService.buildCheckoutBreakdown(job);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("breakdown", breakdown);
    body.put("snapshot", breakdown);
    return body;
  }

  @Transactional
  public Map<String, Object> complete(Long id, Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job =
        managedJobRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found."));
    boolean isContractor =
        principal.getId() != null
            && principal.getId().equals(job.getAssignedContractorUserId());
    boolean isAdmin = ManagedJobAccess.isAdminRole(principal);
    if (!isContractor && !isAdmin) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }

    Map<String, Object> bodyIn = request != null ? request : Map.of();
    Map<String, Object> report = new LinkedHashMap<>();
    report.put("summary", bodyIn.get("summary") != null ? bodyIn.get("summary") : "");
    report.put("materialsUsed", bodyIn.get("materialsUsed") != null ? bodyIn.get("materialsUsed") : "");
    report.put("beforePhotoUrl", bodyIn.get("beforePhotoUrl"));
    report.put("afterPhotoUrl", bodyIn.get("afterPhotoUrl"));
    report.put("equipmentLabelPhotoUrl", bodyIn.get("equipmentLabelPhotoUrl"));
    report.put("warranty", bodyIn.get("warranty") != null ? bodyIn.get("warranty") : "");
    report.put("healthUpdate", bodyIn.get("healthUpdate"));
    report.put("completedAt", OffsetDateTime.now().toString());
    report.put(
        "completedBy",
        Map.of(
            "userId",
            principal.getId(),
            "role",
            isAdmin ? "admin" : "contractor",
            "at",
            OffsetDateTime.now().toString()));
    job.setCompletionReport(objectMapper.valueToTree(report));
    job.setStatus("work_completed");
    job.setUpdatedAt(OffsetDateTime.now());
    managedJobRepository.save(job);
    trackJobStatusEvent(job, "work_completed");
    job.setStatus("customer_review_pending");
    job.setUpdatedAt(OffsetDateTime.now());
    ManagedJobEntity saved = managedJobRepository.save(job);
    trackJobStatusEvent(saved, "customer_review_pending");

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("job", enrichFinance(managedJobMapper.toDto(saved, principal), saved));
    return body;
  }

  @Transactional
  public Map<String, Object> confirmCompletion(Long id, Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job =
        managedJobRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found."));
    boolean allowed =
        ManagedJobAccess.isAdminRole(principal)
            || ManagedJobAccess.isHomeownerOwner(principal, job.getHomeownerUserId());
    if (!allowed) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }

    job.setCustomerConfirmedAt(OffsetDateTime.now());
    if (hasSucceededRetailPayment(id)) {
      job.setStatus("admin_review_pending");
      managedJobRepository.save(job);
      trackJobStatusEvent(job, "admin_review_pending");
      job.setStatus("payout_pending");
      managedJobRepository.save(job);
      trackJobStatusEvent(job, "payout_pending");
      try {
        payoutOpsService.ensurePayoutForJob(id, "pending_approval", principal.getId());
      } catch (Exception ignored) {
        // non-fatal
      }
    } else {
      managedJobRepository.save(job);
    }

    ManagedJobEntity saved = managedJobRepository.findById(id).orElse(job);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("job", enrichFinance(managedJobMapper.toDto(saved, principal), saved));
    body.put("review", null);
    return body;
  }

  private boolean hasSucceededRetailPayment(Long jobId) {
    Set<String> paidStatuses = Set.of("succeeded", "paid", "authorized");
    Set<String> retailTypes =
        Set.of("retail_payment", "invoice_payment", "invoice_manual", "final_payment", "manual");
    return paymentRepository.findByJobIdOrderByCreatedAtDesc(jobId).stream()
        .anyMatch(
            p ->
                paidStatuses.contains(
                        String.valueOf(p.getStatus() == null ? "" : p.getStatus()).toLowerCase(Locale.ROOT))
                    && retailTypes.contains(
                        String.valueOf(p.getPaymentType() == null ? "" : p.getPaymentType())
                            .toLowerCase(Locale.ROOT)));
  }

  private ManagedJobDto enrichFinance(ManagedJobDto dto, ManagedJobEntity job) {
    if (dto == null || job == null) {
      return dto;
    }
    BigDecimal quoted = BigDecimal.ZERO;
    if (job.getActiveProposalId() != null) {
      quoted =
          proposalRepository
              .findById(job.getActiveProposalId())
              .map(ProposalEntity::getRetailAmount)
              .orElse(BigDecimal.ZERO);
    } else {
      quoted =
          proposalRepository
              .findFirstByJobIdOrderByCreatedAtDesc(job.getId())
              .map(ProposalEntity::getRetailAmount)
              .orElse(BigDecimal.ZERO);
    }
    if (quoted == null) {
      quoted = BigDecimal.ZERO;
    }

    BigDecimal paid =
        paymentRepository
            .findByJobIdAndStatusIn(job.getId(), List.of("succeeded", "paid", "authorized"))
            .stream()
            .map(PaymentEntity::getAmount)
            .filter(a -> a != null)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal outstanding = quoted.subtract(paid).max(BigDecimal.ZERO);

    dto.setQuotedAmount(quoted.doubleValue());
    dto.setPaidAmount(paid.doubleValue());
    dto.setOutstandingAmount(outstanding.doubleValue());
    return dto;
  }

  private ManagedJobEntity requireJobForHomeownerOrAdmin(Long id, UserPrincipal principal) {
    ManagedJobEntity job =
        managedJobRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
    boolean allowed =
        ManagedJobAccess.isAdminRole(principal)
            || ManagedJobAccess.isHomeownerOwner(principal, job.getHomeownerUserId());
    if (!allowed) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }
    return job;
  }

  @Transactional
  public Map<String, Object> createPublicJob(PublicJobRequest request) {
    if (request == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Name and email are required to start your assessment.");
    }
    String email = request.getEmail() != null ? request.getEmail().trim().toLowerCase(Locale.ROOT) : "";
    String name = request.getContactName() != null ? request.getContactName().trim() : "";
    String phone = request.getContactPhone() != null ? request.getContactPhone().trim() : "";
    String streetAddress =
        StringUtils.hasText(request.getAddressLine1())
            ? request.getAddressLine1().trim()
            : (request.getStreetAddress() != null ? request.getStreetAddress().trim() : "");
    String addressLine2 = request.getAddressLine2() != null ? request.getAddressLine2().trim() : "";
    String city = request.getCity() != null ? request.getCity().trim() : "";
    String state = request.getState() != null ? request.getState().trim() : "";
    String zip = request.getZip() != null ? request.getZip().trim() : "";
    String country = StringUtils.hasText(request.getCountry()) ? request.getCountry().trim() : "US";
    String category = StringUtils.hasText(request.getCategory()) ? request.getCategory().trim() : "Other";
    String description = request.getDescription() != null ? request.getDescription().trim() : "";
    String title =
        StringUtils.hasText(request.getTitle()) ? request.getTitle().trim() : category + " issue";

    if (!StringUtils.hasText(email) || !StringUtils.hasText(name)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Name and email are required to start your assessment.");
    }
    if (!Boolean.TRUE.equals(request.getAcceptedTerms())) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "You must agree to the FixBridge Terms of Service and Privacy Policy.",
          "CONSENT_REQUIRED");
    }

    if (userRepository.existsByRoleAndEmailIgnoreCase("homeowner", email)) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "An account with this email already exists. Please sign in to continue your request.",
          "ACCOUNT_EXISTS");
    }

    byte[] tempBytes = new byte[32];
    secureRandom.nextBytes(tempBytes);
    String tempPassword = Base64.getUrlEncoder().withoutPadding().encodeToString(tempBytes);

    String fullAddress = joinNonBlank(streetAddress, addressLine2, city, state, zip, country);
    if (!StringUtils.hasText(fullAddress)) {
      fullAddress = "TBD";
    }
    String cityStateZip = joinNonBlank(city, state, zip);
    if (!StringUtils.hasText(cityStateZip)) {
      cityStateZip = "TBD";
    }

    UserEntity user = new UserEntity();
    user.setRole("homeowner");
    user.setName(name);
    user.setEmail(email);
    user.setPassword(passwordEncoder.encode(tempPassword));
    user.setPhone(StringUtils.hasText(phone) ? phone : null);
    user.setAddress("TBD".equals(fullAddress) ? null : fullAddress);
    user.setComplianceStatus("approved");
    user.setAdmin(false);
    user.setBlocked(false);
    user.setSignupMethod("email");
    final UserEntity savedUser = userRepository.save(user);

    Long propertyId = null;
    if (StringUtils.hasText(streetAddress) || StringUtils.hasText(city) || StringUtils.hasText(zip)) {
      final Long ownerId = savedUser.getId();
      propertyId =
          propertyRepository
              .findFirstByOwnerUserIdAndAddressLine1IgnoreCase(ownerId, streetAddress)
              .map(PropertyEntity::getId)
              .orElseGet(
                  () -> {
                    PropertyEntity prop = new PropertyEntity();
                    prop.setOwnerUserId(ownerId);
                    prop.setLabel("Home");
                    prop.setAddressLine1(StringUtils.hasText(streetAddress) ? streetAddress : "TBD");
                    prop.setAddressLine2(StringUtils.hasText(addressLine2) ? addressLine2 : null);
                    prop.setCity(blankToNull(city));
                    prop.setState(blankToNull(state));
                    prop.setZip(blankToNull(zip));
                    prop.setCountry(country);
                    prop.setStreetAddress(StringUtils.hasText(streetAddress) ? streetAddress : null);
                    return propertyRepository.save(prop).getId();
                  });
    }

    ManagedJobEntity job = new ManagedJobEntity();
    job.setHomeownerUserId(savedUser.getId());
    job.setPropertyId(propertyId);
    job.setStatus("draft");
    job.setJobMode("managed");
    job.setCategory(category);
    job.setTitle(title);
    job.setDescription(description);
    job.setMediaDataUrl(blankToNull(request.getMediaDataUrl()));
    job.setMediaType(blankToNull(request.getMediaType()));
    job.setCityStateZip(cityStateZip);
    job.setFullAddress(fullAddress);
    job.setContactName(name);
    job.setContactPhone(phone);
    job.setServiceTiming(
        StringUtils.hasText(request.getServiceTiming()) ? request.getServiceTiming().trim() : "weekday");
    job.setStreetAddress(blankToNull(streetAddress));
    job.setCity(blankToNull(city));
    job.setState(blankToNull(state));
    job.setZip(blankToNull(zip));
    job.setCountry(country);
    job.setAssessmentStatus("pending");
    if (StringUtils.hasText(request.getPartnerCode())) {
      job.setPartnerCode(request.getPartnerCode().trim().toUpperCase(Locale.ROOT));
      job.setReferralStatus("referral_received");
    }
    if (StringUtils.hasText(request.getDiscountCode())) {
      job.setDiscountCode(request.getDiscountCode().trim().toUpperCase(Locale.ROOT));
    }

    ManagedJobEntity saved = managedJobRepository.save(job);
    saved.setBookingId(formatBookingId(saved.getId(), saved.getCreatedAt()));
    saved = managedJobRepository.save(saved);

    UserDto userDto = userMapper.toDto(savedUser);
    UserPrincipal principal =
        new UserPrincipal(
            savedUser.getId(),
            savedUser.getRole(),
            savedUser.getEmail(),
            false,
            JwtService.AUTH_STAGE_COMPLETE);
    String token = jwtService.createToken(principal);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("token", token);
    body.put("user", userDto);
    body.put("job", managedJobMapper.toDto(saved, principal));
    return body;
  }

  private ManagedJobEntity requireReadable(Long id, UserPrincipal principal) {
    ManagedJobEntity job =
        managedJobRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found."));
    List<Long> invited = jobInvitationRepository.findContractorIdsByJobId(job.getId());
    if (!ManagedJobAccess.canReadManagedJob(job, principal, invited)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }
    return job;
  }

  private ManagedJobEntity requireMutable(Long id, UserPrincipal principal, boolean contractorMayMutate) {
    ManagedJobEntity job =
        managedJobRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
    if (!ManagedJobAccess.canMutateManagedJob(job, principal, contractorMayMutate)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }
    return job;
  }

  private ParsedCancellation normalizeCancellation(CancelJobRequest request) {
    String reasonCode = "";
    if (request != null) {
      if (StringUtils.hasText(request.getReasonCode())) {
        reasonCode = request.getReasonCode().trim();
      } else if (StringUtils.hasText(request.getCancellationReasonCode())) {
        reasonCode = request.getCancellationReasonCode().trim();
      }
    }
    if (!CANCELLATION_REASON_LABELS.containsKey(reasonCode)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Please select a valid cancellation reason.");
    }
    String reasonLabel =
        request != null && StringUtils.hasText(request.getReasonLabel())
            ? request.getReasonLabel().trim()
            : CANCELLATION_REASON_LABELS.get(reasonCode);
    Map<String, Object> details = new HashMap<>();
    if (request != null && request.getDetails() != null) {
      details.putAll(request.getDetails());
    }
    String notes =
        request != null && request.getNotes() != null
            ? request.getNotes().trim()
            : "";
    if (notes.length() > 2000) {
      notes = notes.substring(0, 2000);
    }
    if (StringUtils.hasText(notes)) {
      details.put("notes", notes);
    }
    ObjectNode detailsNode = objectMapper.valueToTree(details);
    String cancellationReason =
        StringUtils.hasText(notes) ? reasonLabel + " — " + notes : reasonLabel;
    return new ParsedCancellation(reasonCode, cancellationReason, detailsNode);
  }

  public static String formatBookingId(Long id, OffsetDateTime createdAt) {
    OffsetDateTime date = createdAt != null ? createdAt : OffsetDateTime.now(ZoneOffset.UTC);
    String stamp = date.toLocalDate().toString().replace("-", "");
    String suffix = String.valueOf(id);
    if (suffix.length() > 6) {
      suffix = suffix.substring(suffix.length() - 6);
    }
    suffix = String.format("%6s", suffix).replace(' ', '0');
    return "FB-" + stamp + "-" + suffix;
  }

  private void trackJobStatusEvent(ManagedJobEntity job, String status) {
    try {
      Map<String, Object> props = new LinkedHashMap<>();
      props.put("jobId", job.getId());
      props.put("bookingId", job.getBookingId());
      props.put("status", status);
      props.put("homeownerUserId", job.getHomeownerUserId());
      props.put("contractorUserId", job.getAssignedContractorUserId());
      highLevelClient.trackEvent("managed_job_status", props);
    } catch (Exception ignored) {
      // non-fatal CRM hook
    }
  }

  private static String joinNonBlank(String... parts) {
    StringBuilder sb = new StringBuilder();
    for (String part : parts) {
      if (StringUtils.hasText(part)) {
        if (!sb.isEmpty()) {
          sb.append(", ");
        }
        sb.append(part.trim());
      }
    }
    return sb.toString();
  }

  private static String blank(String value) {
    return value == null ? "" : value.trim();
  }

  private static String blankToNull(String value) {
    return StringUtils.hasText(value) ? value.trim() : null;
  }

  private static String truncate(String value, int max) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
  }

  private record ParsedCancellation(String reasonCode, String cancellationReason, ObjectNode details) {}
}
