package com.fixbridge.payment.stripe.common;

import com.fixbridge.config.FixbridgeProperties;
import com.stripe.Stripe;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

@Configuration
public class StripeConfig {

  private static final Logger log = LoggerFactory.getLogger(StripeConfig.class);

  private final FixbridgeProperties properties;

  public StripeConfig(FixbridgeProperties properties) {
    this.properties = properties;
  }

  @PostConstruct
  public void init() {
    String key = properties.getStripe().getSecretKey();
    if (StringUtils.hasText(key)) {
      Stripe.apiKey = key.trim();
      log.info("Stripe API key configured.");
    } else {
      log.info("Stripe secret key not set; Stripe features disabled.");
    }
  }

  public boolean isConfigured() {
    return properties.getStripe().isConfigured();
  }
}
