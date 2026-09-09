package com.fixbridge.payment.stripe.common;

import com.fixbridge.config.FixbridgeProperties;
import com.fixbridge.exception.ApiException;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.exception.StripeException;
import com.stripe.model.Account;
import com.stripe.model.AccountLink;
import com.stripe.model.Event;
import com.stripe.model.Refund;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import com.stripe.param.AccountCreateParams;
import com.stripe.param.AccountLinkCreateParams;
import com.stripe.param.RefundCreateParams;
import com.stripe.param.checkout.SessionCreateParams;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class StripeService {

  private static final Logger log = LoggerFactory.getLogger(StripeService.class);

  private final FixbridgeProperties properties;
  private final StripeConfig stripeConfig;

  public StripeService(FixbridgeProperties properties, StripeConfig stripeConfig) {
    this.properties = properties;
    this.stripeConfig = stripeConfig;
  }

  public boolean isConfigured() {
    return stripeConfig.isConfigured();
  }

  public void assertPaymentsAvailable() {
    if (!isConfigured()) {
      throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "Payments are not configured. Set STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET for webhooks) in your environment.",
          "STRIPE_NOT_CONFIGURED");
    }
  }

  public String appBaseUrl() {
    String url = properties.getAppUrl();
    if (!StringUtils.hasText(url)) {
      url = "http://localhost:5000";
    }
    return url.replaceAll("/$", "");
  }

  public Map<String, String> createCheckoutSession(
      long amountCents,
      String customerEmail,
      String description,
      String successPath,
      String cancelPath,
      String origin,
      Map<String, String> metadata,
      boolean manualCapture) {
    return createCheckoutSessionInternal(
        amountCents,
        customerEmail,
        description,
        successPath,
        cancelPath,
        origin,
        metadata,
        manualCapture,
        SessionCreateParams.Mode.PAYMENT,
        0,
        "month");
  }

  public Map<String, String> createSubscriptionCheckoutSession(
      long amountCents,
      String customerEmail,
      String description,
      String successPath,
      String cancelPath,
      String origin,
      Map<String, String> metadata,
      int trialDays,
      String interval) {
    return createCheckoutSessionInternal(
        amountCents,
        customerEmail,
        description,
        successPath,
        cancelPath,
        origin,
        metadata,
        false,
        SessionCreateParams.Mode.SUBSCRIPTION,
        trialDays,
        interval);
  }

  private Map<String, String> createCheckoutSessionInternal(
      long amountCents,
      String customerEmail,
      String description,
      String successPath,
      String cancelPath,
      String origin,
      Map<String, String> metadata,
      boolean manualCapture,
      SessionCreateParams.Mode mode,
      int trialDays,
      String interval) {
    assertPaymentsAvailable();
    try {
      String baseUrl =
          StringUtils.hasText(origin) ? origin.replaceAll("/$", "") : appBaseUrl();
      SessionCreateParams.LineItem.PriceData.Builder priceData =
          SessionCreateParams.LineItem.PriceData.builder()
              .setCurrency("usd")
              .setUnitAmount(amountCents)
              .setProductData(
                  SessionCreateParams.LineItem.PriceData.ProductData.builder()
                      .setName(
                          StringUtils.hasText(description) ? description : "Service payment")
                      .build());
      if (mode == SessionCreateParams.Mode.SUBSCRIPTION) {
        priceData.setRecurring(
            SessionCreateParams.LineItem.PriceData.Recurring.builder()
                .setInterval(
                    "year".equalsIgnoreCase(interval)
                        ? SessionCreateParams.LineItem.PriceData.Recurring.Interval.YEAR
                        : SessionCreateParams.LineItem.PriceData.Recurring.Interval.MONTH)
                .build());
      }

      SessionCreateParams.Builder builder =
          SessionCreateParams.builder()
              .setMode(mode)
              .setSuccessUrl(baseUrl + successPath)
              .setCancelUrl(baseUrl + cancelPath)
              .addLineItem(
                  SessionCreateParams.LineItem.builder()
                      .setQuantity(1L)
                      .setPriceData(priceData.build())
                      .build());

      if (StringUtils.hasText(customerEmail)) {
        builder.setCustomerEmail(customerEmail);
      }
      if (metadata != null) {
        builder.putAllMetadata(metadata);
      }
      if (manualCapture && mode == SessionCreateParams.Mode.PAYMENT) {
        builder.setPaymentIntentData(
            SessionCreateParams.PaymentIntentData.builder()
                .setCaptureMethod(SessionCreateParams.PaymentIntentData.CaptureMethod.MANUAL)
                .build());
      }
      if (mode == SessionCreateParams.Mode.SUBSCRIPTION && trialDays > 0) {
        builder.setSubscriptionData(
            SessionCreateParams.SubscriptionData.builder()
                .setTrialPeriodDays((long) trialDays)
                .build());
      }

      Session session = Session.create(builder.build());
      if (!StringUtils.hasText(session.getUrl())) {
        throw new ApiException(
            HttpStatus.BAD_GATEWAY,
            "Stripe did not return a checkout URL.",
            "STRIPE_CHECKOUT_FAILED");
      }
      Map<String, String> out = new LinkedHashMap<>();
      out.put("url", session.getUrl());
      out.put("sessionId", session.getId());
      return out;
    } catch (ApiException e) {
      throw e;
    } catch (StripeException e) {
      log.error("Stripe checkout failed: {}", e.getMessage());
      throw new ApiException(
          HttpStatus.BAD_GATEWAY,
          e.getMessage() != null ? e.getMessage() : "Could not start Stripe checkout.",
          "STRIPE_CHECKOUT_FAILED");
    }
  }

  public void updateSubscriptionCancelAtPeriodEnd(String stripeSubscriptionId, boolean cancelAtPeriodEnd) {
    assertPaymentsAvailable();
    try {
      com.stripe.model.Subscription.retrieve(stripeSubscriptionId)
          .update(
              com.stripe.param.SubscriptionUpdateParams.builder()
                  .setCancelAtPeriodEnd(cancelAtPeriodEnd)
                  .build());
    } catch (StripeException e) {
      log.error("Stripe subscription update failed: {}", e.getMessage());
      throw new ApiException(
          HttpStatus.BAD_GATEWAY,
          e.getMessage() != null ? e.getMessage() : "Could not update subscription.",
          "STRIPE_SUBSCRIPTION_UPDATE_FAILED");
    }
  }

  public String createBillingPortalSession(String customerId, String origin) {
    assertPaymentsAvailable();
    try {
      String baseUrl =
          StringUtils.hasText(origin) ? origin.replaceAll("/$", "") : appBaseUrl();
      com.stripe.model.billingportal.Session session =
          com.stripe.model.billingportal.Session.create(
              com.stripe.param.billingportal.SessionCreateParams.builder()
                  .setCustomer(customerId)
                  .setReturnUrl(baseUrl + "/")
                  .build());
      return session.getUrl();
    } catch (StripeException e) {
      log.error("Stripe billing portal failed: {}", e.getMessage());
      throw new ApiException(
          HttpStatus.BAD_GATEWAY,
          e.getMessage() != null ? e.getMessage() : "Could not open billing portal.",
          "STRIPE_BILLING_PORTAL_FAILED");
    }
  }

  public String createExpressAccount(String email) {
    assertPaymentsAvailable();
    try {
      AccountCreateParams.Builder builder =
          AccountCreateParams.builder()
              .setType(AccountCreateParams.Type.EXPRESS)
              .setCapabilities(
                  AccountCreateParams.Capabilities.builder()
                      .setTransfers(
                          AccountCreateParams.Capabilities.Transfers.builder()
                              .setRequested(true)
                              .build())
                      .build());
      if (StringUtils.hasText(email)) {
        builder.setEmail(email);
      }
      Account account = Account.create(builder.build());
      return account.getId();
    } catch (ApiException e) {
      throw e;
    } catch (StripeException e) {
      log.error("Stripe express account create failed: {}", e.getMessage());
      throw new ApiException(
          HttpStatus.BAD_GATEWAY,
          e.getMessage() != null ? e.getMessage() : "Could not create Stripe Connect account.",
          "STRIPE_CONNECT_FAILED");
    }
  }

  public String createConnectAccountLink(String accountId, String refreshPath, String returnPath) {
    assertPaymentsAvailable();
    try {
      AccountLink link =
          AccountLink.create(
              AccountLinkCreateParams.builder()
                  .setAccount(accountId)
                  .setRefreshUrl(appBaseUrl() + refreshPath)
                  .setReturnUrl(appBaseUrl() + returnPath)
                  .setType(AccountLinkCreateParams.Type.ACCOUNT_ONBOARDING)
                  .build());
      return link.getUrl();
    } catch (ApiException e) {
      throw e;
    } catch (StripeException e) {
      log.error("Stripe account link failed: {}", e.getMessage());
      throw new ApiException(
          HttpStatus.BAD_GATEWAY,
          e.getMessage() != null ? e.getMessage() : "Could not create Stripe onboarding link.",
          "STRIPE_CONNECT_FAILED");
    }
  }

  public String createRefund(String paymentIntentId, long amountCents) {
    assertPaymentsAvailable();
    if (!StringUtils.hasText(paymentIntentId)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Payment intent is required for refund.");
    }
    try {
      RefundCreateParams.Builder builder =
          RefundCreateParams.builder().setPaymentIntent(paymentIntentId.trim());
      if (amountCents > 0) {
        builder.setAmount(amountCents);
      }
      Refund refund = Refund.create(builder.build());
      return refund.getId();
    } catch (ApiException e) {
      throw e;
    } catch (StripeException e) {
      log.error("Stripe refund failed: {}", e.getMessage());
      throw new ApiException(
          HttpStatus.BAD_GATEWAY,
          e.getMessage() != null ? e.getMessage() : "Could not create Stripe refund.",
          "STRIPE_REFUND_FAILED");
    }
  }

  public Event constructWebhookEvent(byte[] payload, String signatureHeader) {
    if (!isConfigured()) {
      return null;
    }
    String secret = properties.getStripe().getWebhookSecret();
    if (!StringUtils.hasText(secret)) {
      return null;
    }
    if (!StringUtils.hasText(signatureHeader) || payload == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Missing Stripe signature.");
    }
    try {
      return Webhook.constructEvent(new String(payload, java.nio.charset.StandardCharsets.UTF_8), signatureHeader, secret.trim());
    } catch (SignatureVerificationException e) {
      log.warn("Stripe webhook signature verification failed: {}", e.getMessage());
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid webhook");
    }
  }
}
