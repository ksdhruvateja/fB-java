package com.fixbridge.subscription.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "subscription_plans")
public class SubscriptionPlanEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true)
  private String code;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false, precision = 10, scale = 2)
  private BigDecimal amount = BigDecimal.ZERO;

  @Column(nullable = false)
  private String interval = "month";

  @Column(nullable = false)
  private String theme = "light";

  @Column(name = "sort_order", nullable = false)
  private Integer sortOrder = 0;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, columnDefinition = "jsonb")
  private JsonNode features;

  @Column(nullable = false)
  private Boolean highlight = false;

  @Column(name = "unlocks_diy", nullable = false)
  private Boolean unlocksDiy = false;

  @Column(name = "trial_days", nullable = false)
  private Integer trialDays = 0;

  @Column(nullable = false)
  private Boolean active = true;

  @Column(name = "cta_label", nullable = false)
  private String ctaLabel = "Select";

  @Column(columnDefinition = "TEXT")
  private String description;

  @Column(name = "created_at")
  private OffsetDateTime createdAt;

  @Column(name = "updated_at")
  private OffsetDateTime updatedAt;

  @PrePersist
  void onCreate() {
    OffsetDateTime now = OffsetDateTime.now();
    if (createdAt == null) {
      createdAt = now;
    }
    if (updatedAt == null) {
      updatedAt = now;
    }
    if (amount == null) {
      amount = BigDecimal.ZERO;
    }
    if (interval == null) {
      interval = "month";
    }
    if (theme == null) {
      theme = "light";
    }
    if (sortOrder == null) {
      sortOrder = 0;
    }
    if (highlight == null) {
      highlight = false;
    }
    if (unlocksDiy == null) {
      unlocksDiy = false;
    }
    if (trialDays == null) {
      trialDays = 0;
    }
    if (active == null) {
      active = true;
    }
    if (ctaLabel == null) {
      ctaLabel = "Select";
    }
  }

  @PreUpdate
  void onUpdate() {
    updatedAt = OffsetDateTime.now();
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public String getCode() {
    return code;
  }

  public void setCode(String code) {
    this.code = code;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public void setAmount(BigDecimal amount) {
    this.amount = amount;
  }

  public String getInterval() {
    return interval;
  }

  public void setInterval(String interval) {
    this.interval = interval;
  }

  public String getTheme() {
    return theme;
  }

  public void setTheme(String theme) {
    this.theme = theme;
  }

  public Integer getSortOrder() {
    return sortOrder;
  }

  public void setSortOrder(Integer sortOrder) {
    this.sortOrder = sortOrder;
  }

  public JsonNode getFeatures() {
    return features;
  }

  public void setFeatures(JsonNode features) {
    this.features = features;
  }

  public Boolean getHighlight() {
    return highlight;
  }

  public void setHighlight(Boolean highlight) {
    this.highlight = highlight;
  }

  public Boolean getUnlocksDiy() {
    return unlocksDiy;
  }

  public void setUnlocksDiy(Boolean unlocksDiy) {
    this.unlocksDiy = unlocksDiy;
  }

  public Integer getTrialDays() {
    return trialDays;
  }

  public void setTrialDays(Integer trialDays) {
    this.trialDays = trialDays;
  }

  public Boolean getActive() {
    return active;
  }

  public void setActive(Boolean active) {
    this.active = active;
  }

  public String getCtaLabel() {
    return ctaLabel;
  }

  public void setCtaLabel(String ctaLabel) {
    this.ctaLabel = ctaLabel;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }

  public OffsetDateTime getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(OffsetDateTime updatedAt) {
    this.updatedAt = updatedAt;
  }
}
