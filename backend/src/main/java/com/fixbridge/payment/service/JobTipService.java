package com.fixbridge.payment.service;

import com.fixbridge.payment.entity.JobTipEntity;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.payment.entity.PaymentEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.payment.stripe.common.StripeService;
import com.fixbridge.payment.repository.JobTipRepository;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.payment.repository.PaymentRepository;
import com.fixbridge.security.authorization.ManagedJobAccess;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import com.fixbridge.common.util.MoneyUtil;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.fixbridge.payout.service.PayoutOpsService;
@Service
public class JobTipService {

  private final JobTipRepository jobTipRepository;
  private final ManagedJobRepository managedJobRepository;
  private final PaymentRepository paymentRepository;
  private final PayoutOpsService payoutOpsService;
  private final StripeService stripeService;

  public JobTipService(
      JobTipRepository jobTipRepository,
      ManagedJobRepository managedJobRepository,
      PaymentRepository paymentRepository,
      PayoutOpsService payoutOpsService,
      StripeService stripeService) {
    this.jobTipRepository = jobTipRepository;
    this.managedJobRepository = managedJobRepository;
    this.paymentRepository = paymentRepository;
    this.payoutOpsService = payoutOpsService;
    this.stripeService = stripeService;
  }

  /** Tips are 100% to the contractor (tipAmountCents fully included in payout net). */
  @Transactional
  public Map<String, Object> recordPaidTip(Long jobId, BigDecimal amount, String paymentIntent) {
    if (jobId == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "jobId is required.");
    }
    ManagedJobEntity job =
        managedJobRepository
            .findById(jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
    BigDecimal tip = MoneyUtil.dollars(amount);
    if (tip.compareTo(BigDecimal.ZERO) <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Tip amount must be positive.");
    }

    JobTipEntity tipRow =
        jobTipRepository.findFirstByJobIdOrderByCreatedAtDesc(jobId).orElseGet(JobTipEntity::new);
    tipRow.setJobId(jobId);
    tipRow.setHomeownerUserId(job.getHomeownerUserId());
    tipRow.setContractorUserId(job.getAssignedContractorUserId());
    tipRow.setAmount(tip);
    tipRow.setStatus("paid");
    tipRow.setPaidAt(OffsetDateTime.now());
    if (StringUtils.hasText(paymentIntent)) {
      tipRow.setStripePaymentIntentId(paymentIntent);
    }
    tipRow = jobTipRepository.save(tipRow);

    try {
      payoutOpsService.ensurePayoutForJob(jobId, "pending_approval", job.getHomeownerUserId());
    } catch (Exception ignored) {
      // non-fatal refresh
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("tipId", tipRow.getId());
    body.put("amount", tip.doubleValue());
    body.put("amountCents", MoneyUtil.dollarsToCents(tip));
    body.put("status", tipRow.getStatus());
    return body;
  }

  @Transactional
  public Map<String, Object> createTipCheckout(Long jobId, Map<String, Object> body, String origin) {
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
    if (job.getAssignedContractorUserId() == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Tips require an assigned contractor.");
    }

    BigDecimal tipAmount = resolveTipAmount(job, body);
    long tipCents = MoneyUtil.dollarsToCents(tipAmount);
    if (tipCents < 100) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Minimum tip is $1.00.");
    }

    JobTipEntity tipRow =
        jobTipRepository.findFirstByJobIdOrderByCreatedAtDesc(jobId).orElseGet(JobTipEntity::new);
    tipRow.setJobId(jobId);
    tipRow.setHomeownerUserId(job.getHomeownerUserId());
    tipRow.setContractorUserId(job.getAssignedContractorUserId());
    tipRow.setAmount(tipAmount);
    tipRow.setStatus("pending");
    tipRow.setPaidAt(null);
    if (body != null && body.get("tipPercent") != null) {
      try {
        tipRow.setPercentOfService(new BigDecimal(String.valueOf(body.get("tipPercent"))));
      } catch (Exception ignored) {
        // optional
      }
    }
    tipRow = jobTipRepository.save(tipRow);

    stripeService.assertPaymentsAvailable();
    Map<String, String> metadata = new LinkedHashMap<>();
    metadata.put("jobId", String.valueOf(jobId));
    metadata.put("paymentType", "tip");
    metadata.put("userId", String.valueOf(principal.getId()));
    metadata.put("tipId", String.valueOf(tipRow.getId()));
    metadata.put("contractorUserId", String.valueOf(job.getAssignedContractorUserId()));

    String booking =
        StringUtils.hasText(job.getBookingId()) ? job.getBookingId() : ("FB-" + jobId);
    Map<String, String> checkout =
        stripeService.createCheckoutSession(
            tipCents,
            principal.getEmail(),
            "Tip for contractor — " + booking,
            "/?paid=tip&job=" + jobId,
            "/?canceled=tip&job=" + jobId,
            origin,
            metadata,
            false);

    PaymentEntity payment = new PaymentEntity();
    payment.setJobId(jobId);
    payment.setUserId(principal.getId());
    payment.setPaymentType("tip");
    payment.setAmount(tipAmount);
    payment.setCurrency("usd");
    payment.setStatus("pending");
    payment.setStripeSessionId(checkout.get("sessionId"));
    payment.setSimulated(false);
    payment.setProvider("stripe");
    paymentRepository.save(payment);

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("ok", true);
    response.put("url", checkout.get("url"));
    response.put("amount", tipAmount);
    response.put("amountCents", tipCents);
    response.put("tipId", tipRow.getId());
    response.put("contractorShare", tipAmount);
    response.put("note", "Tips go 100% to the contractor.");
    return response;
  }

  private BigDecimal resolveTipAmount(ManagedJobEntity job, Map<String, Object> body) {
    BigDecimal amount = BigDecimal.ZERO;
    if (body != null && body.get("tipAmount") != null) {
      amount = MoneyUtil.dollars(new BigDecimal(String.valueOf(body.get("tipAmount"))));
    } else if (body != null && body.get("amount") != null) {
      amount = MoneyUtil.dollars(new BigDecimal(String.valueOf(body.get("amount"))));
    } else if (body != null && body.get("tipPercent") != null) {
      BigDecimal base =
          job.getFinalCustomerAmount() != null
              ? job.getFinalCustomerAmount()
              : (job.getServiceAmount() != null ? job.getServiceAmount() : BigDecimal.valueOf(100));
      BigDecimal pct = new BigDecimal(String.valueOf(body.get("tipPercent")));
      amount =
          MoneyUtil.dollars(base.multiply(pct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
    }
    BigDecimal serviceBase =
        job.getFinalCustomerAmount() != null
            ? job.getFinalCustomerAmount()
            : (job.getServiceAmount() != null ? job.getServiceAmount() : BigDecimal.valueOf(100));
    BigDecimal max =
        MoneyUtil.dollars(serviceBase.multiply(BigDecimal.valueOf(2)))
            .max(BigDecimal.valueOf(500));
    if (amount.compareTo(max) > 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Tip exceeds allowed maximum.");
    }
    return amount;
  }
}
