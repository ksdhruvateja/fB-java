package com.fixbridge.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "fixbridge")
public class FixbridgeProperties {

  private final Jwt jwt = new Jwt();
  private final Cors cors = new Cors();
  private String appUrl = "http://localhost:5000";
  private String jsonBodyLimit = "20mb";
  private final RateLimit rateLimit = new RateLimit();
  private final Stripe stripe = new Stripe();
  private final Google google = new Google();
  private final Geoapify geoapify = new Geoapify();
  private final Ai ai = new Ai();
  private final Mail mail = new Mail();
  private final Admin admin = new Admin();
  private final Media media = new Media();

  public Jwt getJwt() {
    return jwt;
  }

  public Cors getCors() {
    return cors;
  }

  public String getAppUrl() {
    return appUrl;
  }

  public void setAppUrl(String appUrl) {
    this.appUrl = appUrl;
  }

  public String getJsonBodyLimit() {
    return jsonBodyLimit;
  }

  public void setJsonBodyLimit(String jsonBodyLimit) {
    this.jsonBodyLimit = jsonBodyLimit;
  }

  public RateLimit getRateLimit() {
    return rateLimit;
  }

  public Stripe getStripe() {
    return stripe;
  }

  public Google getGoogle() {
    return google;
  }

  public Geoapify getGeoapify() {
    return geoapify;
  }

  public Ai getAi() {
    return ai;
  }

  public Mail getMail() {
    return mail;
  }

  public Admin getAdmin() {
    return admin;
  }

  public Media getMedia() {
    return media;
  }

  public static class Jwt {
    private String secret = "local-dev-only-change-me-please-use-long-secret";
    private String expiration = "7d";
    private String mfaPendingExpiration = "15m";

    public String getSecret() {
      return secret;
    }

    public void setSecret(String secret) {
      this.secret = secret;
    }

    public String getExpiration() {
      return expiration;
    }

    public void setExpiration(String expiration) {
      this.expiration = expiration;
    }

    public String getMfaPendingExpiration() {
      return mfaPendingExpiration;
    }

    public void setMfaPendingExpiration(String mfaPendingExpiration) {
      this.mfaPendingExpiration = mfaPendingExpiration;
    }
  }

  public static class Cors {
    private String origins = "";

    public String getOrigins() {
      return origins;
    }

    public void setOrigins(String origins) {
      this.origins = origins;
    }
  }

  public static class RateLimit {
    private int apiMax = 400;
    private int signinMax = 30;

    public int getApiMax() {
      return apiMax;
    }

    public void setApiMax(int apiMax) {
      this.apiMax = apiMax;
    }

    public int getSigninMax() {
      return signinMax;
    }

    public void setSigninMax(int signinMax) {
      this.signinMax = signinMax;
    }
  }

  public static class Stripe {
    private String secretKey = "";
    private String webhookSecret = "";
    private String publishableKey = "";

    public String getSecretKey() {
      return secretKey;
    }

    public void setSecretKey(String secretKey) {
      this.secretKey = secretKey;
    }

    public String getWebhookSecret() {
      return webhookSecret;
    }

    public void setWebhookSecret(String webhookSecret) {
      this.webhookSecret = webhookSecret;
    }

    public String getPublishableKey() {
      return publishableKey;
    }

    public void setPublishableKey(String publishableKey) {
      this.publishableKey = publishableKey;
    }

    public boolean isConfigured() {
      return secretKey != null && !secretKey.isBlank();
    }
  }

  public static class Google {
    private String clientId = "";
    private String mapsApiKey = "";

    public String getClientId() {
      return clientId;
    }

    public void setClientId(String clientId) {
      this.clientId = clientId;
    }

    public String getMapsApiKey() {
      return mapsApiKey;
    }

    public void setMapsApiKey(String mapsApiKey) {
      this.mapsApiKey = mapsApiKey;
    }
  }

  public static class Geoapify {
    private String apiKey = "";
    private String countryFilter = "countrycode:us";

    public String getApiKey() {
      return apiKey;
    }

    public void setApiKey(String apiKey) {
      this.apiKey = apiKey;
    }

    public String getCountryFilter() {
      return countryFilter;
    }

    public void setCountryFilter(String countryFilter) {
      this.countryFilter = countryFilter;
    }
  }

  public static class Ai {
    private String explabsApiKey = "";
    private String openrouterApiKey = "";
    private String openrouterModel = "openai/gpt-4o-mini";
    private String openrouterBaseUrl = "https://openrouter.ai/api/v1";
    private long fetchTimeoutMs = 60_000L;

    public String getExplabsApiKey() {
      return explabsApiKey;
    }

    public void setExplabsApiKey(String explabsApiKey) {
      this.explabsApiKey = explabsApiKey;
    }

    public String getOpenrouterApiKey() {
      return openrouterApiKey;
    }

    public void setOpenrouterApiKey(String openrouterApiKey) {
      this.openrouterApiKey = openrouterApiKey;
    }

    public String getOpenrouterModel() {
      return openrouterModel;
    }

    public void setOpenrouterModel(String openrouterModel) {
      this.openrouterModel = openrouterModel;
    }

    public String getOpenrouterBaseUrl() {
      return openrouterBaseUrl;
    }

    public void setOpenrouterBaseUrl(String openrouterBaseUrl) {
      this.openrouterBaseUrl = openrouterBaseUrl;
    }

    public long getFetchTimeoutMs() {
      return fetchTimeoutMs;
    }

    public void setFetchTimeoutMs(long fetchTimeoutMs) {
      this.fetchTimeoutMs = fetchTimeoutMs;
    }

    public boolean isConfigured() {
      return (explabsApiKey != null && !explabsApiKey.isBlank())
          || (openrouterApiKey != null && !openrouterApiKey.isBlank());
    }
  }

  public static class Mail {
    private boolean disabled = false;
    private String fromEmail = "support@fixbridge.us";
    private String fromName = "FixBridge Support";
    private String replyTo = "support@fixbridge.us";

    public boolean isDisabled() {
      return disabled;
    }

    public void setDisabled(boolean disabled) {
      this.disabled = disabled;
    }

    public String getFromEmail() {
      return fromEmail;
    }

    public void setFromEmail(String fromEmail) {
      this.fromEmail = fromEmail;
    }

    public String getFromName() {
      return fromName;
    }

    public void setFromName(String fromName) {
      this.fromName = fromName;
    }

    public String getReplyTo() {
      return replyTo;
    }

    public void setReplyTo(String replyTo) {
      this.replyTo = replyTo;
    }
  }

  public static class Admin {
    private String primaryEmail = "";

    public String getPrimaryEmail() {
      return primaryEmail;
    }

    public void setPrimaryEmail(String primaryEmail) {
      this.primaryEmail = primaryEmail;
    }
  }

  public static class Media {
    private double maxAttachmentSizeMb = 2.5;
    private int maxAttachmentsPerMessage = 5;
    private String storageProvider = "database";

    public double getMaxAttachmentSizeMb() {
      return maxAttachmentSizeMb;
    }

    public void setMaxAttachmentSizeMb(double maxAttachmentSizeMb) {
      this.maxAttachmentSizeMb = maxAttachmentSizeMb;
    }

    public int getMaxAttachmentsPerMessage() {
      return maxAttachmentsPerMessage;
    }

    public void setMaxAttachmentsPerMessage(int maxAttachmentsPerMessage) {
      this.maxAttachmentsPerMessage = maxAttachmentsPerMessage;
    }

    public String getStorageProvider() {
      return storageProvider;
    }

    public void setStorageProvider(String storageProvider) {
      this.storageProvider = storageProvider;
    }
  }
}
