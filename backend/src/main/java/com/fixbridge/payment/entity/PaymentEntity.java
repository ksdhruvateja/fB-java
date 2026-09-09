package com.fixbridge.payment.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "payments")
public class PaymentEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "job_id")
  private Long jobId;

  @Column(name = "user_id")
  private Long userId;

  @Column(name = "payment_type", nullable = false)
  private String paymentType;

  @Column(nullable = false, precision = 12, scale = 2)
  private BigDecimal amount;

  @Column(length = 16)
  private String currency = "usd";

  @Column(nullable = false)
  private String status = "pending";

  @Column(name = "stripe_session_id")
  private String stripeSessionId;

  @Column(name = "stripe_payment_intent")
  private String stripePaymentIntent;

  @Column(name = "stripe_subscription_id")
  private String stripeSubscriptionId;

  @Column(name = "stripe_charge_id")
  private String stripeChargeId;

  @Column(name = "stripe_balance_transaction_id")
  private String stripeBalanceTransactionId;

  @Column(name = "stripe_processing_fee_cents")
  private Integer stripeProcessingFeeCents;

  @Column(name = "stripe_net_received_cents")
  private Integer stripeNetReceivedCents;

  private Boolean simulated = false;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private JsonNode meta;

  @Column(name = "public_id")
  private String publicId;

  private String provider = "stripe";

  @Column(name = "created_at")
  private OffsetDateTime createdAt;

  @PrePersist
  void onCreate() {
    if (createdAt == null) {
      createdAt = OffsetDateTime.now();
    }
    if (currency == null) {
      currency = "usd";
    }
    if (status == null) {
      status = "pending";
    }
    if (provider == null) {
      provider = "stripe";
    }
    if (simulated == null) {
      simulated = false;
    }
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public Long getJobId() {
    return jobId;
  }

  public void setJobId(Long jobId) {
    this.jobId = jobId;
  }

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public String getPaymentType() {
    return paymentType;
  }

  public void setPaymentType(String paymentType) {
    this.paymentType = paymentType;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public void setAmount(BigDecimal amount) {
    this.amount = amount;
  }

  public String getCurrency() {
    return currency;
  }

  public void setCurrency(String currency) {
    this.currency = currency;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getStripeSessionId() {
    return stripeSessionId;
  }

  public void setStripeSessionId(String stripeSessionId) {
    this.stripeSessionId = stripeSessionId;
  }

  public String getStripePaymentIntent() {
    return stripePaymentIntent;
  }

  public void setStripePaymentIntent(String stripePaymentIntent) {
    this.stripePaymentIntent = stripePaymentIntent;
  }

  public String getStripeSubscriptionId() {
    return stripeSubscriptionId;
  }

  public void setStripeSubscriptionId(String stripeSubscriptionId) {
    this.stripeSubscriptionId = stripeSubscriptionId;
  }

  public String getStripeChargeId() {
    return stripeChargeId;
  }

  public void setStripeChargeId(String stripeChargeId) {
    this.stripeChargeId = stripeChargeId;
  }

  public String getStripeBalanceTransactionId() {
    return stripeBalanceTransactionId;
  }

  public void setStripeBalanceTransactionId(String stripeBalanceTransactionId) {
    this.stripeBalanceTransactionId = stripeBalanceTransactionId;
  }

  public Integer getStripeProcessingFeeCents() {
    return stripeProcessingFeeCents;
  }

  public void setStripeProcessingFeeCents(Integer stripeProcessingFeeCents) {
    this.stripeProcessingFeeCents = stripeProcessingFeeCents;
  }

  public Integer getStripeNetReceivedCents() {
    return stripeNetReceivedCents;
  }

  public void setStripeNetReceivedCents(Integer stripeNetReceivedCents) {
    this.stripeNetReceivedCents = stripeNetReceivedCents;
  }

  public Boolean getSimulated() {
    return simulated;
  }

  public void setSimulated(Boolean simulated) {
    this.simulated = simulated;
  }

  public JsonNode getMeta() {
    return meta;
  }

  public void setMeta(JsonNode meta) {
    this.meta = meta;
  }

  public String getPublicId() {
    return publicId;
  }

  public void setPublicId(String publicId) {
    this.publicId = publicId;
  }

  public String getProvider() {
    return provider;
  }

  public void setProvider(String provider) {
    this.provider = provider;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
