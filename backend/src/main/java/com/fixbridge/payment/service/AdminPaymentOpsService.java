package com.fixbridge.payment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.payment.entity.FinancialLedgerEventEntity;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.payment.entity.PaymentEntity;
import com.fixbridge.payment.entity.RefundEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.payment.stripe.common.StripeService;
import com.fixbridge.payment.repository.FinancialLedgerEventRepository;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.payment.repository.PaymentRepository;
import com.fixbridge.payment.repository.RefundRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import com.fixbridge.common.util.MoneyUtil;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.fixbridge.admin.service.AuditService;
@Service
public class AdminPaymentOpsService {

  private final PaymentRepository paymentRepository;
  private final RefundRepository refundRepository;
  private final FinancialLedgerEventRepository financialLedgerEventRepository;
  private final ManagedJobRepository managedJobRepository;
  private final StripeService stripeService;
  private final ObjectMapper objectMapper;
  private final AuditService auditService;

  public AdminPaymentOpsService(
      PaymentRepository paymentRepository,
      RefundRepository refundRepository,
      FinancialLedgerEventRepository financialLedgerEventRepository,
      ManagedJobRepository managedJobRepository,
      StripeService stripeService,
      ObjectMapper objectMapper,
      AuditService auditService) {
    this.paymentRepository = paymentRepository;
    this.refundRepository = refundRepository;
    this.financialLedgerEventRepository = financialLedgerEventRepository;
    this.managedJobRepository = managedJobRepository;
    this.stripeService = stripeService;
    this.objectMapper = objectMapper;
    this.auditService = auditService;
  }

  @Transactional
  public Map<String, Object> refundPayment(Long paymentId, Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    PaymentEntity payment =
        paymentRepository
            .findById(paymentId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Payment not found."));

    Map<String, Object> bodyIn = request != null ? request : Map.of();
    BigDecimal amount =
        bodyIn.get("amount") != null
            ? MoneyUtil.dollars(new BigDecimal(String.valueOf(bodyIn.get("amount"))))
            : MoneyUtil.dollars(payment.getAmount());
    String reason =
        bodyIn.get("reason") != null
            ? String.valueOf(bodyIn.get("reason")).trim()
            : "admin_refund";
    if (reason.length() > 500) {
      reason = reason.substring(0, 500);
    }

    String idempotencyKey =
        bodyIn.get("idempotencyKey") != null
            ? String.valueOf(bodyIn.get("idempotencyKey")).trim()
            : (bodyIn.get("refundRequestId") != null
                ? String.valueOf(bodyIn.get("refundRequestId")).trim()
                : "refund-"
                    + paymentId
                    + "-"
                    + MoneyUtil.dollarsToCents(amount)
                    + "-"
                    + reason.substring(0, Math.min(40, reason.length())));

    var existing = refundRepository.findFirstByIdempotencyKey(idempotencyKey);
    if (existing.isPresent()) {
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("ok", true);
      body.put("alreadyRefunded", true);
      body.put("refund", serializeRefund(existing.get()));
      body.put("simulated", existing.get().getSimulated());
      return body;
    }

    boolean simulate =
        !stripeService.isConfigured() || !StringUtils.hasText(payment.getStripePaymentIntent());
    String stripeRefundId;
    if (!simulate) {
      stripeRefundId =
          stripeService.createRefund(
              payment.getStripePaymentIntent(), MoneyUtil.dollarsToCents(amount));
    } else {
      stripeRefundId = "sim_re_" + System.currentTimeMillis();
    }

    RefundEntity refund = new RefundEntity();
    refund.setPaymentId(paymentId);
    refund.setJobId(payment.getJobId());
    refund.setAmount(amount);
    refund.setReason(reason);
    refund.setStatus("succeeded");
    refund.setSimulated(simulate);
    refund.setCreatedBy(principal.getId());
    refund.setStripeRefundId(stripeRefundId);
    refund.setIdempotencyKey(idempotencyKey);
    refund.setLedgerNote("Admin refund " + (simulate ? "(simulated) " : "") + amount);
    refund = refundRepository.save(refund);

    payment.setStatus("refunded");
    paymentRepository.save(payment);

    FinancialLedgerEventEntity ledger = new FinancialLedgerEventEntity();
    ledger.setEventType("refund_succeeded");
    ledger.setJobId(payment.getJobId());
    ledger.setPaymentId(paymentId);
    ledger.setAmountCents((int) MoneyUtil.dollarsToCents(amount));
    ledger.setStripeObjectId(stripeRefundId);
    ledger.setCreatedBy(principal.getId());
    ObjectNode meta = objectMapper.createObjectNode();
    meta.put("reason", reason);
    meta.put("simulate", simulate);
    meta.put("ledgerNote", refund.getLedgerNote());
    ledger.setMetadata(meta);
    financialLedgerEventRepository.save(ledger);

    if (payment.getJobId() != null) {
      managedJobRepository
          .findById(payment.getJobId())
          .ifPresent(
              job -> {
                job.setStatus("refunded");
                job.setUpdatedAt(OffsetDateTime.now());
                managedJobRepository.save(job);
              });
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("refund", serializeRefund(refund));
    body.put("simulated", simulate);
    auditService.write(
        principal.getId(),
        "payment_refund",
        "payment",
        paymentId,
        Map.of(
            "amount", amount,
            "reason", reason,
            "simulated", simulate,
            "jobId", payment.getJobId() == null ? "" : payment.getJobId()));
    return body;
  }

  @Transactional
  public Map<String, Object> createManualPayment(Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    if (request == null || request.get("amount") == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "amount is required.");
    }
    BigDecimal amount = MoneyUtil.dollars(new BigDecimal(String.valueOf(request.get("amount"))));
    Long jobId = null;
    if (request.get("jobId") != null) {
      try {
        jobId = Long.valueOf(String.valueOf(request.get("jobId")));
      } catch (NumberFormatException e) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid jobId.");
      }
    }
    if (jobId != null) {
      managedJobRepository
          .findById(jobId)
          .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
    }

    String method =
        request.get("method") != null ? String.valueOf(request.get("method")) : "manual";
    String reference =
        request.get("reference") != null ? String.valueOf(request.get("reference")) : null;
    String notes = request.get("notes") != null ? String.valueOf(request.get("notes")) : null;
    String date = request.get("date") != null ? String.valueOf(request.get("date")) : null;

    ObjectNode meta = objectMapper.createObjectNode();
    meta.put("method", method);
    if (reference != null) {
      meta.put("reference", reference);
    }
    if (notes != null) {
      meta.put("notes", notes);
    }
    if (date != null) {
      meta.put("date", date);
    }
    meta.put("source", "admin_manual");

    PaymentEntity payment = new PaymentEntity();
    payment.setJobId(jobId);
    payment.setUserId(principal.getId());
    payment.setPaymentType("manual");
    payment.setAmount(amount);
    payment.setCurrency("usd");
    payment.setStatus("succeeded");
    payment.setProvider("manual");
    payment.setSimulated(true);
    payment.setMeta(meta);
    payment = paymentRepository.save(payment);
    payment.setPublicId("TXN-" + String.format(Locale.ROOT, "%05d", payment.getId()));
    // Also support invoice_manual labeling when requested.
    if ("invoice_manual".equalsIgnoreCase(String.valueOf(request.get("paymentType")))) {
      payment.setPaymentType("invoice_manual");
    }
    payment = paymentRepository.save(payment);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("payment", serializePayment(payment));
    return body;
  }

  private Map<String, Object> serializeRefund(RefundEntity r) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", r.getId());
    m.put("paymentId", r.getPaymentId());
    m.put("jobId", r.getJobId());
    m.put("amount", r.getAmount() != null ? r.getAmount().doubleValue() : null);
    m.put("reason", r.getReason());
    m.put("status", r.getStatus());
    m.put("stripeRefundId", r.getStripeRefundId());
    m.put("simulated", r.getSimulated());
    m.put("createdBy", r.getCreatedBy());
    m.put("idempotencyKey", r.getIdempotencyKey());
    m.put("ledgerNote", r.getLedgerNote());
    m.put("createdAt", r.getCreatedAt());
    return m;
  }

  private Map<String, Object> serializePayment(PaymentEntity p) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", p.getId());
    m.put("jobId", p.getJobId());
    m.put("userId", p.getUserId());
    m.put("paymentType", p.getPaymentType());
    m.put("amount", p.getAmount() != null ? p.getAmount().doubleValue() : null);
    m.put("currency", p.getCurrency());
    m.put("status", p.getStatus());
    m.put("provider", p.getProvider());
    m.put("simulated", p.getSimulated());
    m.put("publicId", p.getPublicId());
    m.put("meta", p.getMeta());
    m.put("createdAt", p.getCreatedAt());
    return m;
  }
}
