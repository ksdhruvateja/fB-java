package com.fixbridge.payment.controller;

import com.fixbridge.payment.service.StripeWebhookService;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class StripeWebhookController {

  private final StripeWebhookService stripeWebhookService;

  public StripeWebhookController(StripeWebhookService stripeWebhookService) {
    this.stripeWebhookService = stripeWebhookService;
  }

  /**
   * Stripe requires the exact raw body for signature verification. Use {@code byte[]} so Spring
   * does not re-serialize JSON through Jackson before verification.
   */
  @PostMapping(
      value = "/api/stripe/webhook",
      consumes = {MediaType.APPLICATION_JSON_VALUE, MediaType.APPLICATION_OCTET_STREAM_VALUE, MediaType.ALL_VALUE})
  public Map<String, Object> webhook(
      @RequestBody byte[] payload,
      @RequestHeader(value = "Stripe-Signature", required = false) String signature) {
    return stripeWebhookService.handle(payload, signature);
  }
}
