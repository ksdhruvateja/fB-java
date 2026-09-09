package com.fixbridge.quote.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.job.entity.BidEntity;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.quote.entity.ProposalEntity;
import com.fixbridge.quote.entity.QuoteRevisionSnapshotEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.job.mapper.ManagedJobMapper;
import com.fixbridge.quote.mapper.ProposalMapper;
import com.fixbridge.job.repository.BidRepository;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.quote.repository.ProposalRepository;
import com.fixbridge.quote.repository.QuoteRevisionSnapshotRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import com.fixbridge.common.util.MoneyUtil;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.fixbridge.notification.service.NotificationService;
@Service
public class AdminQuoteWorkspaceService {

  private static final BigDecimal DEFAULT_MARKUP = new BigDecimal("1.35");
  private static final BigDecimal DEFAULT_SERVICE_CHARGE = new BigDecimal("25.00");

  private final ProposalRepository proposalRepository;
  private final ManagedJobRepository managedJobRepository;
  private final UserRepository userRepository;
  private final BidRepository bidRepository;
  private final QuoteRevisionSnapshotRepository quoteRevisionSnapshotRepository;
  private final ProposalMapper proposalMapper;
  private final ManagedJobMapper managedJobMapper;
  private final NotificationService notificationService;
  private final ObjectMapper objectMapper;

  public AdminQuoteWorkspaceService(
      ProposalRepository proposalRepository,
      ManagedJobRepository managedJobRepository,
      UserRepository userRepository,
      BidRepository bidRepository,
      QuoteRevisionSnapshotRepository quoteRevisionSnapshotRepository,
      ProposalMapper proposalMapper,
      ManagedJobMapper managedJobMapper,
      NotificationService notificationService,
      ObjectMapper objectMapper) {
    this.proposalRepository = proposalRepository;
    this.managedJobRepository = managedJobRepository;
    this.userRepository = userRepository;
    this.bidRepository = bidRepository;
    this.quoteRevisionSnapshotRepository = quoteRevisionSnapshotRepository;
    this.proposalMapper = proposalMapper;
    this.managedJobMapper = managedJobMapper;
    this.notificationService = notificationService;
    this.objectMapper = objectMapper;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> listQuotes(String q, String status) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    String statusFilter =
        StringUtils.hasText(status) ? status.trim().toLowerCase(Locale.ROOT) : null;
    String query = StringUtils.hasText(q) ? q.trim().toLowerCase(Locale.ROOT) : null;

    List<ProposalEntity> rows =
        proposalRepository.findTop100ByOrderByCreatedAtDesc().stream()
            .filter(
                p -> {
                  if (statusFilter != null
                      && !statusFilter.equalsIgnoreCase(
                          String.valueOf(p.getStatus() == null ? "" : p.getStatus()))) {
                    return false;
                  }
                  if (query == null) {
                    return true;
                  }
                  String quoteNumber =
                      p.getQuoteNumber() != null
                          ? p.getQuoteNumber().toLowerCase(Locale.ROOT)
                          : "";
                  String idStr = String.valueOf(p.getId());
                  ManagedJobEntity job =
                      managedJobRepository.findById(p.getJobId()).orElse(null);
                  String title =
                      job != null && job.getTitle() != null
                          ? job.getTitle().toLowerCase(Locale.ROOT)
                          : "";
                  return quoteNumber.contains(query)
                      || idStr.contains(query)
                      || title.contains(query);
                })
            .collect(Collectors.toList());

    List<Map<String, Object>> quotes =
        rows.stream()
            .map(
                p -> {
                  Map<String, Object> dto = proposalMapper.toDto(p, principal);
                  ManagedJobEntity job =
                      managedJobRepository.findById(p.getJobId()).orElse(null);
                  if (job != null) {
                    dto.put("jobTitle", job.getTitle());
                    dto.put("jobStatus", job.getStatus());
                    dto.put("bookingId", job.getBookingId());
                    UserEntity hw =
                        job.getHomeownerUserId() != null
                            ? userRepository.findById(job.getHomeownerUserId()).orElse(null)
                            : null;
                    if (hw != null) {
                      dto.put("homeownerName", hw.getName());
                      dto.put("homeownerEmail", hw.getEmail());
                    }
                  }
                  return dto;
                })
            .collect(Collectors.toList());

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("quotes", quotes);
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> getQuote(String idOrNumber) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ProposalEntity proposal = resolveProposal(idOrNumber);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("quote", proposalMapper.toDto(proposal, principal));
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> quoteBuilder(Long jobId, Long bidId) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job =
        managedJobRepository
            .findById(jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found."));

    BidEntity bid = null;
    if (bidId != null && bidId > 0) {
      bid =
          bidRepository
              .findByIdAndJobId(bidId, jobId)
              .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Bid not found."));
    }

    BigDecimal contractorNet =
        bid != null && bid.getNetTotal() != null ? MoneyUtil.dollars(bid.getNetTotal()) : BigDecimal.ZERO;
    Map<String, Object> preview =
        buildQuotePreview(
            contractorNet,
            bid != null ? bid.getLaborAmount() : null,
            bid != null ? bid.getMaterialsAmount() : null,
            DEFAULT_SERVICE_CHARGE,
            null,
            null);

    BigDecimal aiLow = job.getCustomerRetailEstimateLow();
    BigDecimal aiHigh = job.getCustomerRetailEstimateHigh();
    String marketPosition = marketPosition(contractorNet, aiLow, aiHigh);

    Map<String, Object> aiEstimate = new LinkedHashMap<>();
    aiEstimate.put("low", aiLow != null ? aiLow.doubleValue() : null);
    aiEstimate.put("high", aiHigh != null ? aiHigh.doubleValue() : null);
    aiEstimate.put("confidence", job.getEstimateConfidence());
    aiEstimate.put(
        "contractorNetLow",
        job.getEstimatedContractorNetLow() != null
            ? job.getEstimatedContractorNetLow().doubleValue()
            : null);
    aiEstimate.put(
        "contractorNetHigh",
        job.getEstimatedContractorNetHigh() != null
            ? job.getEstimatedContractorNetHigh().doubleValue()
            : null);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("job", managedJobMapper.toDto(job, principal));
    body.put("bid", bid == null ? null : serializeBid(bid));
    body.put("aiEstimate", aiEstimate);
    body.put("marketPosition", marketPosition);
    body.put("quotePreview", preview);
    return body;
  }

  @Transactional
  public Map<String, Object> createOrUpdateProposal(Long jobId, Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job =
        managedJobRepository
            .findById(jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found."));

    Map<String, Object> bodyIn = request != null ? request : Map.of();
    Long proposalId = asLong(bodyIn.get("proposalId"));
    Long bidId = asLong(bodyIn.get("bidId"));
    boolean publish =
        bodyIn.get("publish") == null
            || Boolean.TRUE.equals(bodyIn.get("publish"))
            || "sent".equalsIgnoreCase(String.valueOf(bodyIn.get("status")));

    BidEntity bid = null;
    if (bidId != null && bidId > 0) {
      bid =
          bidRepository
              .findByIdAndJobId(bidId, jobId)
              .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Bid not found."));
    }

    BigDecimal contractorNet =
        firstMoney(
            bodyIn.get("contractorNet"),
            bodyIn.get("contractorQuoteAmount"),
            bid != null ? bid.getNetTotal() : null);
    if (contractorNet == null) {
      contractorNet = BigDecimal.ZERO;
    }
    BigDecimal serviceCharge =
        firstMoney(bodyIn.get("serviceCharge"), DEFAULT_SERVICE_CHARGE);
    BigDecimal adminDiscount = firstMoney(bodyIn.get("adminDiscount"), BigDecimal.ZERO);

    Map<String, Object> preview =
        buildQuotePreview(
            contractorNet,
            firstMoney(bodyIn.get("labor"), bid != null ? bid.getLaborAmount() : null),
            firstMoney(bodyIn.get("materials"), bid != null ? bid.getMaterialsAmount() : null),
            serviceCharge,
            adminDiscount,
            bodyIn.get("pricingAdjustments"));

    BigDecimal retail =
        firstMoney(bodyIn.get("retailAmount"), (BigDecimal) preview.get("customerQuote"));
    BigDecimal deposit = firstMoney(bodyIn.get("depositAmount"), retail);

    ProposalEntity prop;
    if (proposalId != null && proposalId > 0) {
      prop =
          proposalRepository
              .findById(proposalId)
              .filter(p -> Objects.equals(p.getJobId(), jobId))
              .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Proposal not found."));
      if (prop.getVersionNumber() == null) {
        prop.setVersionNumber(1);
      } else {
        prop.setVersionNumber(prop.getVersionNumber() + 1);
      }
    } else {
      prop = new ProposalEntity();
      prop.setJobId(jobId);
      prop.setCreatedBy(principal.getId());
      prop.setVersionNumber(1);
    }

    prop.setBidId(bid != null ? bid.getId() : bidId);
    prop.setScopeSummary(
        asString(
            bodyIn.get("scopeSummary"),
            job.getDescription() != null ? job.getDescription() : job.getTitle()));
    prop.setRetailAmount(MoneyUtil.dollars(retail));
    prop.setDepositAmount(MoneyUtil.dollars(deposit));
    prop.setTimeline(asString(bodyIn.get("timeline"), bid != null ? bid.getTimeline() : null));
    prop.setWarranty(asString(bodyIn.get("warranty"), bid != null ? bid.getWarranty() : null));
    prop.setExclusions(
        asString(bodyIn.get("exclusions"), bid != null ? bid.getExclusions() : null));
    prop.setContractorNet(MoneyUtil.dollars(contractorNet));
    prop.setContractorQuoteAmount(MoneyUtil.dollars(contractorNet));
    prop.setPlatformGross(
        MoneyUtil.dollars(
            retail.subtract(contractorNet).setScale(2, RoundingMode.HALF_UP)));
    prop.setProcessingCost(
        MoneyUtil.dollars(
            retail
                .multiply(new BigDecimal("0.029"))
                .add(new BigDecimal("0.30"))
                .setScale(2, RoundingMode.HALF_UP)));
    prop.setServiceCharge(MoneyUtil.dollars(serviceCharge));
    prop.setAdminDiscount(MoneyUtil.dollars(adminDiscount));
    if (bodyIn.get("adminDiscountReason") != null) {
      prop.setAdminDiscountReason(String.valueOf(bodyIn.get("adminDiscountReason")));
    }
    if (bodyIn.get("couponCode") != null) {
      prop.setCouponCode(String.valueOf(bodyIn.get("couponCode")));
    }
    prop.setQuoteOptionLabel(asNullableString(bodyIn.get("quoteOptionLabel")));
    prop.setQuoteOptionTitle(asNullableString(bodyIn.get("quoteOptionTitle")));
    prop.setOptionGroup(asNullableString(bodyIn.get("optionGroup")));

    int validHours = 48;
    if (bodyIn.get("quoteValidHours") != null) {
      try {
        validHours = Integer.parseInt(String.valueOf(bodyIn.get("quoteValidHours")));
      } catch (NumberFormatException ignored) {
        validHours = 48;
      }
    }
    prop.setQuoteValidUntil(OffsetDateTime.now().plusHours(Math.max(1, validHours)));

    if (bodyIn.get("lineItems") != null) {
      prop.setLineItems(objectMapper.valueToTree(bodyIn.get("lineItems")));
    } else if (bodyIn.get("customerLineItems") != null) {
      prop.setLineItems(objectMapper.valueToTree(bodyIn.get("customerLineItems")));
    }
    if (bodyIn.get("customerLineItems") != null) {
      prop.setCustomerLineItems(objectMapper.valueToTree(bodyIn.get("customerLineItems")));
    } else {
      prop.setCustomerLineItems(buildDefaultCustomerLineItems(preview));
    }
    if (bodyIn.get("pricingAdjustments") != null) {
      prop.setPricingAdjustments(objectMapper.valueToTree(bodyIn.get("pricingAdjustments")));
    }

    if (publish) {
      prop.setStatus("sent");
      if (prop.getPublishedAt() == null) {
        prop.setPublishedAt(OffsetDateTime.now());
      }
    } else {
      prop.setStatus("draft");
    }

    prop = proposalRepository.save(prop);
    if (prop.getQuoteNumber() == null) {
      prop.setQuoteNumber("FBQ-" + String.format("%05d", prop.getId()));
      prop = proposalRepository.save(prop);
    }

    job.setActiveProposalId(prop.getId());
    if (bid != null && bid.getContractorUserId() != null) {
      job.setAssignedContractorUserId(bid.getContractorUserId());
    }
    if (publish) {
      job.setStatus("proposal_sent");
      managedJobRepository.save(job);
      job.setStatus("awaiting_customer_approval");
    }
    job.setUpdatedAt(OffsetDateTime.now());
    managedJobRepository.save(job);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("proposal", proposalMapper.toDto(prop, principal));
    return body;
  }

  @Transactional
  public Map<String, Object> sendQuote(String idOrNumber) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ProposalEntity prop = resolveProposal(idOrNumber);
    ManagedJobEntity job =
        managedJobRepository
            .findById(prop.getJobId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));

    prop.setStatus("sent");
    if (prop.getPublishedAt() == null) {
      prop.setPublishedAt(OffsetDateTime.now());
    }
    if (prop.getQuoteNumber() == null) {
      prop.setQuoteNumber("FBQ-" + String.format("%05d", prop.getId()));
    }
    if (StringUtils.hasText(prop.getQuoteOptionLabel()) && !StringUtils.hasText(prop.getOptionGroup())) {
      String groupId = "job-" + prop.getJobId() + "-options";
      prop.setOptionGroup(groupId);
    }
    prop = proposalRepository.save(prop);

    snapshotRevision(prop, principal.getId(), "sent_to_homeowner");

    job.setActiveProposalId(prop.getId());
    job.setStatus("awaiting_customer_approval");
    job.setUpdatedAt(OffsetDateTime.now());
    managedJobRepository.save(job);

    int version = prop.getVersionNumber() != null ? prop.getVersionNumber() : 1;
    boolean revised = version > 1;
    if (job.getHomeownerUserId() != null) {
      ObjectNode meta = objectMapper.createObjectNode();
      meta.put("quoteNumber", prop.getQuoteNumber());
      meta.put("versionNumber", version);
      notificationService.create(
          job.getHomeownerUserId(),
          "homeowner",
          job.getId(),
          revised ? "quote_revised" : "quote_ready",
          revised ? "Quote revised" : "Quote ready",
          revised
              ? "An updated quote is ready for review."
              : "Your quote " + prop.getQuoteNumber() + " is ready.",
          "quote",
          prop.getId(),
          "/homeowner?job=" + job.getId(),
          meta);
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("quote", proposalMapper.toDto(prop, principal));
    body.put("message", "Quote " + prop.getQuoteNumber() + " sent.");
    return body;
  }

  private void snapshotRevision(ProposalEntity prop, Long actorUserId, String changeReason) {
    int version = prop.getVersionNumber() != null ? prop.getVersionNumber() : 1;
    if (quoteRevisionSnapshotRepository.existsByProposalIdAndVersionNumber(prop.getId(), version)) {
      return;
    }
    QuoteRevisionSnapshotEntity snap = new QuoteRevisionSnapshotEntity();
    snap.setProposalId(prop.getId());
    snap.setVersionNumber(version);
    snap.setChangeReason(changeReason);
    snap.setDocumentSnapshot(objectMapper.valueToTree(proposalMapper.toDto(prop, null)));
    snap.setCustomerTotal(prop.getRetailAmount());
    snap.setContractorAmount(
        prop.getContractorQuoteAmount() != null
            ? prop.getContractorQuoteAmount()
            : prop.getContractorNet());
    snap.setCreatedBy(actorUserId);
    quoteRevisionSnapshotRepository.save(snap);
  }

  private ProposalEntity resolveProposal(String idOrNumber) {
    if (!StringUtils.hasText(idOrNumber)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Quote id required.");
    }
    String raw = idOrNumber.trim();
    if (raw.matches("\\d+")) {
      return proposalRepository
          .findById(Long.parseLong(raw))
          .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Quote not found."));
    }
    return proposalRepository
        .findByQuoteNumberIgnoreCase(raw)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Quote not found."));
  }

  private Map<String, Object> buildQuotePreview(
      BigDecimal contractorNet,
      BigDecimal labor,
      BigDecimal materials,
      BigDecimal serviceCharge,
      BigDecimal adminDiscount,
      Object adjustmentsRaw) {
    BigDecimal net = MoneyUtil.dollars(contractorNet != null ? contractorNet : BigDecimal.ZERO);
    BigDecimal baseRetail =
        MoneyUtil.dollars(net.multiply(DEFAULT_MARKUP).setScale(2, RoundingMode.HALF_UP));
    BigDecimal adjTotal = BigDecimal.ZERO;
    if (adjustmentsRaw instanceof List<?> list) {
      for (Object item : list) {
        if (item instanceof Map<?, ?> m) {
          Object amt = m.get("amount");
          if (amt != null) {
            try {
              adjTotal = adjTotal.add(new BigDecimal(String.valueOf(amt)));
            } catch (NumberFormatException ignored) {
              // skip
            }
          }
        }
      }
    }
    BigDecimal sc = MoneyUtil.dollars(serviceCharge != null ? serviceCharge : DEFAULT_SERVICE_CHARGE);
    BigDecimal discount = MoneyUtil.dollars(adminDiscount != null ? adminDiscount : BigDecimal.ZERO);
    BigDecimal customerQuote =
        MoneyUtil.dollars(
            baseRetail.add(adjTotal).add(sc).subtract(discount).max(BigDecimal.ZERO));

    Map<String, Object> preview = new LinkedHashMap<>();
    preview.put("contractorNet", net.doubleValue());
    preview.put("baseRetail", baseRetail.doubleValue());
    preview.put("markupMultiplier", DEFAULT_MARKUP.doubleValue());
    preview.put("serviceCharge", sc.doubleValue());
    preview.put("adminDiscount", discount.doubleValue());
    preview.put("pricingAdjustment", adjTotal.doubleValue());
    preview.put("customerQuote", customerQuote);
    preview.put("labor", labor != null ? labor.doubleValue() : null);
    preview.put("materials", materials != null ? materials.doubleValue() : null);
    preview.put("retailAmount", customerQuote.doubleValue());
    return preview;
  }

  private JsonNode buildDefaultCustomerLineItems(Map<String, Object> preview) {
    ArrayNode items = objectMapper.createArrayNode();
    ObjectNode labor = objectMapper.createObjectNode();
    labor.put("label", "Labor & materials");
    BigDecimal amount =
        preview.get("customerQuote") instanceof BigDecimal
            ? (BigDecimal) preview.get("customerQuote")
            : new BigDecimal(String.valueOf(preview.getOrDefault("customerQuote", "0")));
    BigDecimal serviceCharge =
        preview.get("serviceCharge") != null
            ? new BigDecimal(String.valueOf(preview.get("serviceCharge")))
            : DEFAULT_SERVICE_CHARGE;
    labor.put(
        "amount",
        amount.subtract(serviceCharge).max(BigDecimal.ZERO).doubleValue());
    labor.put("visible", true);
    items.add(labor);
    ObjectNode fee = objectMapper.createObjectNode();
    fee.put("label", "Service charge");
    fee.put("amount", serviceCharge.doubleValue());
    fee.put("visible", true);
    items.add(fee);
    return items;
  }

  private static String marketPosition(BigDecimal contractorNet, BigDecimal aiLow, BigDecimal aiHigh) {
    if (aiLow == null || aiHigh == null || contractorNet == null) {
      return "unknown";
    }
    if (contractorNet.compareTo(aiLow) < 0) {
      return "below_range";
    }
    if (contractorNet.compareTo(aiHigh) > 0) {
      return "above_range";
    }
    return "within_range";
  }

  private static Map<String, Object> serializeBid(BidEntity bid) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", bid.getId());
    m.put("jobId", bid.getJobId());
    m.put("contractorUserId", bid.getContractorUserId());
    m.put("netTotal", bid.getNetTotal() != null ? bid.getNetTotal().doubleValue() : null);
    m.put("laborAmount", bid.getLaborAmount() != null ? bid.getLaborAmount().doubleValue() : null);
    m.put(
        "materialsAmount",
        bid.getMaterialsAmount() != null ? bid.getMaterialsAmount().doubleValue() : null);
    m.put("timeline", bid.getTimeline());
    m.put("warranty", bid.getWarranty());
    m.put("exclusions", bid.getExclusions());
    m.put("notes", bid.getNotes());
    m.put("status", bid.getStatus());
    m.put("createdAt", bid.getCreatedAt());
    return m;
  }

  private static Long asLong(Object value) {
    if (value == null) {
      return null;
    }
    try {
      return Long.valueOf(String.valueOf(value));
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private static BigDecimal firstMoney(Object... values) {
    for (Object value : values) {
      if (value == null) {
        continue;
      }
      if (value instanceof BigDecimal bd) {
        return MoneyUtil.dollars(bd);
      }
      if (value instanceof Number n) {
        return MoneyUtil.dollars(BigDecimal.valueOf(n.doubleValue()));
      }
      try {
        return MoneyUtil.dollars(new BigDecimal(String.valueOf(value)));
      } catch (NumberFormatException ignored) {
        // try next
      }
    }
    return null;
  }

  private static String asString(Object value, String fallback) {
    if (value == null) {
      return fallback;
    }
    String s = String.valueOf(value).trim();
    return s.isEmpty() ? fallback : s;
  }

  private static String asNullableString(Object value) {
    if (value == null) {
      return null;
    }
    String s = String.valueOf(value).trim();
    return s.isEmpty() ? null : s;
  }
}
