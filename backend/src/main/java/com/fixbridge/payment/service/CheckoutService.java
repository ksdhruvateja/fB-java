package com.fixbridge.payment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.payment.entity.PaymentAuthorizationSnapshotEntity;
import com.fixbridge.payment.entity.PaymentEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.payment.stripe.common.StripeService;
import com.fixbridge.job.mapper.ManagedJobMapper;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.payment.repository.PaymentAuthorizationSnapshotRepository;
import com.fixbridge.payment.repository.PaymentRepository;
import com.fixbridge.security.authorization.ManagedJobAccess;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import com.fixbridge.common.util.MoneyUtil;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class CheckoutService {

  private static final Set<String> PAY_DISPATCH_STATUSES =
      Set.of("awaiting_service_payment", "ai_review_complete");

  private final ManagedJobRepository managedJobRepository;
  private final PaymentRepository paymentRepository;
  private final PaymentAuthorizationSnapshotRepository paymentAuthorizationSnapshotRepository;
  private final CheckoutPricingService checkoutPricingService;
  private final DiscountService discountService;
  private final StripeService stripeService;
  private final ManagedJobMapper managedJobMapper;
  private final ObjectMapper objectMapper;

  public CheckoutService(
      ManagedJobRepository managedJobRepository,
      PaymentRepository paymentRepository,
      PaymentAuthorizationSnapshotRepository paymentAuthorizationSnapshotRepository,
      CheckoutPricingService checkoutPricingService,
      DiscountService discountService,
      StripeService stripeService,
      ManagedJobMapper managedJobMapper,
      ObjectMapper objectMapper) {
    this.managedJobRepository = managedJobRepository;
    this.paymentRepository = paymentRepository;
    this.paymentAuthorizationSnapshotRepository = paymentAuthorizationSnapshotRepository;
    this.checkoutPricingService = checkoutPricingService;
    this.discountService = discountService;
    this.stripeService = stripeService;
    this.managedJobMapper = managedJobMapper;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public Map<String, Object> prepareCheckout(Long jobId, Map<String, Object> body) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job = requireJobForHomeownerOrAdmin(jobId, principal);
    if (Boolean.TRUE.equals(job.getVisitFeeAuthorized())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "This request is already paid.");
    }

    if (body != null && Boolean.TRUE.equals(body.get("clearCoupon"))) {
      job.setDiscountCode(null);
      job.setDiscountType(null);
      job.setDiscountValue(null);
      job.setDiscountLabel(null);
      job.setCouponDiscountAmount(null);
      job.setCheckoutSnapshot(null);
    } else if (body != null && body.get("discountCode") != null) {
      discountService.applyCodeOntoJobIfPresent(job, String.valueOf(body.get("discountCode")));
    }

    ObjectNode snapshot = checkoutPricingService.buildCheckoutBreakdown(job);
    applySnapshotToJob(job, snapshot);
    managedJobRepository.save(job);

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("ok", true);
    response.put("snapshot", snapshot);
    response.put("breakdown", snapshot);
    response.put("job", managedJobMapper.toDto(job, principal));
    return response;
  }

  @Transactional
  public Map<String, Object> payDispatch(Long jobId, Map<String, Object> body, String origin) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job = requireJobForHomeownerOrAdmin(jobId, principal);

    if (!PAY_DISPATCH_STATUSES.contains(String.valueOf(job.getStatus()))) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "Dispatch authorization not due for this status.");
    }
    if (Boolean.TRUE.equals(job.getVisitFeeAuthorized())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Visit fee already authorized.");
    }

    ObjectNode snapshot = checkoutPricingService.buildCheckoutBreakdown(job);
    BigDecimal amount = snapshot.path("finalAmount").decimalValue();
    long authorizedNowCents = snapshot.path("authorizedNowCents").asLong();

    if (body != null && (body.get("authorizedAmount") != null || body.get("authorizedNow") != null)) {
      Object clientAmt = body.get("authorizedAmount") != null ? body.get("authorizedAmount") : body.get("authorizedNow");
      BigDecimal clientDollars = new BigDecimal(String.valueOf(clientAmt));
      long clientCents = MoneyUtil.dollarsToCents(clientDollars);
      if (clientCents != authorizedNowCents) {
        Map<String, Object> mismatch = new LinkedHashMap<>();
        mismatch.put("ok", false);
        mismatch.put("code", "PRICING_MISMATCH");
        mismatch.put(
            "message",
            "Authorized amount does not match current server pricing. Please refresh and try again.");
        mismatch.put("authorizedNow", MoneyUtil.centsToDollars(authorizedNowCents));
        throw new ApiException(
            HttpStatus.BAD_REQUEST,
            String.valueOf(mismatch.get("message")),
            "PRICING_MISMATCH");
      }
    }

    applySnapshotToJob(job, snapshot);
    managedJobRepository.save(job);

    stripeService.assertPaymentsAvailable();

    Map<String, String> metadata = new LinkedHashMap<>();
    metadata.put("jobId", String.valueOf(jobId));
    metadata.put("paymentType", "dispatch_fee");
    metadata.put("userId", String.valueOf(principal.getId()));
    metadata.put("captureMethod", "manual");
    metadata.put("finalAmount", amount.toPlainString());
    metadata.put("serviceFee", snapshot.path("serviceFee").asText("0"));
    metadata.put("couponCode", snapshot.path("couponCode").asText(""));

    String bookingId = snapshot.path("bookingId").asText("FB-" + jobId);
    Map<String, String> checkout =
        stripeService.createCheckoutSession(
            authorizedNowCents,
            principal.getEmail(),
            "FixBridge Service Fee — " + bookingId,
            "/?paid=dispatch&job=" + jobId,
            "/?canceled=dispatch&job=" + jobId,
            origin,
            metadata,
            true);

    ObjectNode meta = objectMapper.createObjectNode();
    meta.set("checkoutSnapshot", snapshot);
    if (StringUtils.hasText(snapshot.path("couponCode").asText(null))) {
      ObjectNode discount = objectMapper.createObjectNode();
      discount.put("code", snapshot.path("couponCode").asText());
      discount.put("discountAmount", snapshot.path("couponDiscount").decimalValue());
      discount.put("originalAmount", snapshot.path("serviceFee").decimalValue());
      meta.set("dispatchDiscount", discount);
    } else {
      meta.putNull("dispatchDiscount");
    }

    PaymentEntity payment = new PaymentEntity();
    payment.setJobId(jobId);
    payment.setUserId(principal.getId());
    payment.setPaymentType("dispatch_fee");
    payment.setAmount(MoneyUtil.dollars(amount));
    payment.setCurrency("usd");
    payment.setStatus("pending");
    payment.setStripeSessionId(checkout.get("sessionId"));
    payment.setSimulated(false);
    payment.setProvider("stripe");
    payment.setMeta(meta);
    payment = paymentRepository.save(payment);

    job.setAuthorizedAmountCents((int) authorizedNowCents);
    managedJobRepository.save(job);

    PaymentAuthorizationSnapshotEntity authSnap = new PaymentAuthorizationSnapshotEntity();
    authSnap.setUserId(principal.getId());
    authSnap.setJobId(jobId);
    authSnap.setPaymentId(payment.getId());
    authSnap.setAuthorizedAmountCents((int) authorizedNowCents);
    authSnap.setCurrency("usd");
    paymentAuthorizationSnapshotRepository.save(authSnap);

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("ok", true);
    response.put("url", checkout.get("url"));
    response.put("amount", amount);
    response.put("snapshot", snapshot);
    return response;
  }

  private void applySnapshotToJob(ManagedJobEntity job, ObjectNode snapshot) {
    job.setCheckoutSnapshot(snapshot);
    job.setServiceFeeAmount(snapshot.path("serviceFee").decimalValue());
    if (!snapshot.path("serviceAmount").isNull() && snapshot.has("serviceAmount")) {
      job.setServiceAmount(snapshot.path("serviceAmount").decimalValue());
    }
    job.setCouponDiscountAmount(snapshot.path("couponDiscount").decimalValue());
    BigDecimal finalAmount = snapshot.path("finalAmount").decimalValue();
    job.setFinalCustomerAmount(finalAmount);
    job.setVisitFeeAmount(finalAmount);
    job.setUpdatedAt(OffsetDateTime.now());
  }

  private ManagedJobEntity requireJobForHomeownerOrAdmin(Long jobId, UserPrincipal principal) {
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
    return job;
  }
}
