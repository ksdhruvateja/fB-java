package com.fixbridge.payment.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.payment.entity.PaymentAuthorizationSnapshotEntity;
import com.fixbridge.payment.entity.PaymentEntity;
import com.fixbridge.payment.entity.WebhookEventEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.payment.stripe.common.StripeService;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.payment.repository.PaymentAuthorizationSnapshotRepository;
import com.fixbridge.payment.repository.PaymentRepository;
import com.fixbridge.payment.repository.WebhookEventRepository;
import com.fixbridge.common.util.MoneyUtil;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.StripeObject;
import com.stripe.model.checkout.Session;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class StripeWebhookService {

  private static final Logger log = LoggerFactory.getLogger(StripeWebhookService.class);

  private final StripeService stripeService;
  private final WebhookEventRepository webhookEventRepository;
  private final PaymentRepository paymentRepository;
  private final ManagedJobRepository managedJobRepository;
  private final PaymentAuthorizationSnapshotRepository paymentAuthorizationSnapshotRepository;
  private final DiscountService discountService;
  private final JobTipService jobTipService;
  private final ObjectMapper objectMapper;

  public StripeWebhookService(
      StripeService stripeService,
      WebhookEventRepository webhookEventRepository,
      PaymentRepository paymentRepository,
      ManagedJobRepository managedJobRepository,
      PaymentAuthorizationSnapshotRepository paymentAuthorizationSnapshotRepository,
      DiscountService discountService,
      JobTipService jobTipService,
      ObjectMapper objectMapper) {
    this.stripeService = stripeService;
    this.webhookEventRepository = webhookEventRepository;
    this.paymentRepository = paymentRepository;
    this.managedJobRepository = managedJobRepository;
    this.paymentAuthorizationSnapshotRepository = paymentAuthorizationSnapshotRepository;
    this.discountService = discountService;
    this.jobTipService = jobTipService;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public Map<String, Object> handle(byte[] rawBody, String signatureHeader) {
    Event event = stripeService.constructWebhookEvent(rawBody, signatureHeader);
    if (event == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid webhook");
    }

    ClaimResult claim = claimWebhookEvent(event);
    if (claim.alreadyProcessed()) {
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("ok", true);
      body.put("duplicate", true);
      return body;
    }

    try {
      if ("checkout.session.completed".equals(event.getType())) {
        Session session = extractSession(event);
        if (session != null) {
          handleCheckoutCompleted(session);
        }
      }
      markProcessed(event.getId());
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("ok", true);
      return body;
    } catch (RuntimeException e) {
      markFailed(event.getId(), e.getMessage());
      throw e;
    }
  }

  private void handleCheckoutCompleted(Session session) {
    Map<String, String> metadata = session.getMetadata() != null ? session.getMetadata() : Map.of();
    String paymentType = metadata.get("paymentType");
    Long jobId = parseLong(metadata.get("jobId"));

    BigDecimal paidAmt = null;
    if (session.getAmountTotal() != null) {
      paidAmt = MoneyUtil.centsToDollars(session.getAmountTotal());
    }

    String paymentIntentId =
        session.getPaymentIntent() != null ? String.valueOf(session.getPaymentIntent()) : null;

    if ("dispatch_fee".equals(paymentType) && jobId != null) {
      Optional<ManagedJobEntity> jobOpt = managedJobRepository.findById(jobId);
      if (jobOpt.isPresent()) {
        ManagedJobEntity job = jobOpt.get();

        Integer expectedCents = job.getAuthorizedAmountCents();
        if (expectedCents == null) {
          expectedCents =
              paymentAuthorizationSnapshotRepository
                  .findFirstByJobIdOrderByCreatedAtDesc(jobId)
                  .map(PaymentAuthorizationSnapshotEntity::getAuthorizedAmountCents)
                  .orElse(null);
        }
        if (session.getAmountTotal() != null
            && expectedCents != null
            && session.getAmountTotal().longValue() != expectedCents.longValue()) {
          log.error(
              "Dispatch amount mismatch for job {}: session={} expected={}",
              jobId,
              session.getAmountTotal(),
              expectedCents);
          updatePaymentBySession(session.getId(), "amount_mismatch", paymentIntentId, paidAmt);
          return;
        }

        job.setVisitFeeAuthorized(true);
        if (paidAmt != null) {
          job.setVisitFeeAmount(paidAmt);
          job.setFinalCustomerAmount(paidAmt);
        }
        if (job.getPaymentCompletedAt() == null) {
          job.setPaymentCompletedAt(OffsetDateTime.now());
        }
        job.setWorkQueueStatus("PAID_NEEDS_REVIEW");
        if (StringUtils.hasText(paymentIntentId)) {
          job.setStripePaymentIntentId(paymentIntentId);
        }
        String fromStatus = job.getStatus();
        job.setStatus("awaiting_contractor");
        job.setUpdatedAt(OffsetDateTime.now());
        try {
          discountService.redeemIfNeeded(job);
        } catch (Exception e) {
          log.warn("Coupon redeem failed for job {}: {}", jobId, e.getMessage());
        }
        managedJobRepository.save(job);
        log.info(
            "Dispatch fee authorized for job {} ({} -> awaiting_contractor)",
            jobId,
            fromStatus);
      }

      updatePaymentBySession(session.getId(), "authorized", paymentIntentId, paidAmt);
      return;
    }

    if ("tip".equals(paymentType) && jobId != null && paidAmt != null) {
      try {
        jobTipService.recordPaidTip(jobId, paidAmt, paymentIntentId);
      } catch (Exception e) {
        log.error("Tip record failed for job {}: {}", jobId, e.getMessage());
      }
      updatePaymentBySession(session.getId(), "succeeded", paymentIntentId, paidAmt);
      return;
    }

    if (jobId != null && StringUtils.hasText(paymentType)) {
      updatePaymentBySession(session.getId(), "succeeded", paymentIntentId, paidAmt);
    } else {
      updatePaymentBySession(session.getId(), "succeeded", paymentIntentId, paidAmt);
    }
  }

  private void updatePaymentBySession(
      String sessionId, String status, String paymentIntentId, BigDecimal paidAmt) {
    paymentRepository
        .findFirstByStripeSessionId(sessionId)
        .ifPresent(
            payment -> {
              payment.setStatus(status);
              if (StringUtils.hasText(paymentIntentId)) {
                payment.setStripePaymentIntent(paymentIntentId);
              }
              if (paidAmt != null) {
                payment.setAmount(paidAmt);
              }
              if (!StringUtils.hasText(payment.getPublicId()) && payment.getId() != null) {
                payment.setPublicId(
                    "TXN-" + String.format(Locale.ROOT, "%05d", payment.getId()));
              }
              if (!StringUtils.hasText(payment.getProvider())) {
                payment.setProvider("stripe");
              }
              paymentRepository.save(payment);
            });
  }

  private ClaimResult claimWebhookEvent(Event event) {
    Optional<WebhookEventEntity> existing =
        webhookEventRepository.findByProviderAndEventId("stripe", event.getId());
    if (existing.isPresent()) {
      WebhookEventEntity row = existing.get();
      String status =
          StringUtils.hasText(row.getProcessingStatus())
              ? row.getProcessingStatus()
              : (Boolean.TRUE.equals(row.getProcessed()) ? "processed" : "received");
      if ("processed".equals(status)) {
        return new ClaimResult(true);
      }
      row.setProcessingStatus("processing");
      row.setAttemptCount((row.getAttemptCount() == null ? 0 : row.getAttemptCount()) + 1);
      row.setLastError(null);
      row.setUpdatedAt(OffsetDateTime.now());
      webhookEventRepository.save(row);
      return new ClaimResult(false);
    }

    WebhookEventEntity created = new WebhookEventEntity();
    created.setProvider("stripe");
    created.setEventId(event.getId());
    created.setType(event.getType());
    created.setProcessed(false);
    created.setProcessingStatus("processing");
    created.setAttemptCount(1);
    try {
      JsonNode payload = objectMapper.readTree(event.toJson());
      created.setPayload(payload);
    } catch (Exception e) {
      created.setPayload(objectMapper.createObjectNode().put("id", event.getId()).put("type", event.getType()));
    }
    try {
      webhookEventRepository.save(created);
      return new ClaimResult(false);
    } catch (Exception e) {
      // Unique race — re-claim
      return claimWebhookEvent(event);
    }
  }

  private void markProcessed(String eventId) {
    webhookEventRepository
        .findByProviderAndEventId("stripe", eventId)
        .ifPresent(
            row -> {
              row.setProcessed(true);
              row.setProcessingStatus("processed");
              row.setProcessedAt(OffsetDateTime.now());
              row.setLastError(null);
              row.setUpdatedAt(OffsetDateTime.now());
              webhookEventRepository.save(row);
            });
  }

  private void markFailed(String eventId, String error) {
    webhookEventRepository
        .findByProviderAndEventId("stripe", eventId)
        .ifPresent(
            row -> {
              row.setProcessingStatus("failed");
              row.setLastError(error == null ? "unknown" : error.substring(0, Math.min(error.length(), 2000)));
              row.setUpdatedAt(OffsetDateTime.now());
              webhookEventRepository.save(row);
            });
  }

  private static Session extractSession(Event event) {
    EventDataObjectDeserializer deserializer = event.getDataObjectDeserializer();
    StripeObject obj = deserializer.getObject().orElse(null);
    if (obj instanceof Session session) {
      return session;
    }
    try {
      if (deserializer.getRawJson() != null) {
        return Session.GSON.fromJson(deserializer.getRawJson(), Session.class);
      }
    } catch (Exception e) {
      log.warn("Could not deserialize checkout session: {}", e.getMessage());
    }
    return null;
  }

  private static Long parseLong(String value) {
    if (!StringUtils.hasText(value)) {
      return null;
    }
    try {
      return Long.parseLong(value.trim());
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private record ClaimResult(boolean alreadyProcessed) {}
}
