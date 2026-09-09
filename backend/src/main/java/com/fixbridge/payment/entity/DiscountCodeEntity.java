package com.fixbridge.payment.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "discount_codes")
public class DiscountCodeEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 64)
  private String code;

  private String label;

  @Column(name = "discount_type", nullable = false, length = 32)
  private String discountType = "percent";

  @Column(nullable = false, precision = 12, scale = 2)
  private BigDecimal value;

  private Boolean active = true;

  @Column(name = "max_uses")
  private Integer maxUses;

  @Column(name = "uses_count")
  private Integer usesCount = 0;

  @Column(name = "expires_at")
  private OffsetDateTime expiresAt;

  @Column(name = "starts_at")
  private OffsetDateTime startsAt;

  @Column(name = "deleted_at")
  private OffsetDateTime deletedAt;

  @Column(columnDefinition = "TEXT")
  private String notes;

  @Column(name = "per_user_limit")
  private Integer perUserLimit;

  @Column(name = "created_by")
  private Long createdBy;

  @Column(name = "created_at")
  private OffsetDateTime createdAt;

  @PrePersist
  void onCreate() {
    if (createdAt == null) {
      createdAt = OffsetDateTime.now();
    }
    if (usesCount == null) {
      usesCount = 0;
    }
    if (active == null) {
      active = true;
    }
    if (discountType == null) {
      discountType = "percent";
    }
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

  public String getLabel() {
    return label;
  }

  public void setLabel(String label) {
    this.label = label;
  }

  public String getDiscountType() {
    return discountType;
  }

  public void setDiscountType(String discountType) {
    this.discountType = discountType;
  }

  public BigDecimal getValue() {
    return value;
  }

  public void setValue(BigDecimal value) {
    this.value = value;
  }

  public Boolean getActive() {
    return active;
  }

  public void setActive(Boolean active) {
    this.active = active;
  }

  public Integer getMaxUses() {
    return maxUses;
  }

  public void setMaxUses(Integer maxUses) {
    this.maxUses = maxUses;
  }

  public Integer getUsesCount() {
    return usesCount;
  }

  public void setUsesCount(Integer usesCount) {
    this.usesCount = usesCount;
  }

  public OffsetDateTime getExpiresAt() {
    return expiresAt;
  }

  public void setExpiresAt(OffsetDateTime expiresAt) {
    this.expiresAt = expiresAt;
  }

  public OffsetDateTime getStartsAt() {
    return startsAt;
  }

  public void setStartsAt(OffsetDateTime startsAt) {
    this.startsAt = startsAt;
  }

  public OffsetDateTime getDeletedAt() {
    return deletedAt;
  }

  public void setDeletedAt(OffsetDateTime deletedAt) {
    this.deletedAt = deletedAt;
  }

  public String getNotes() {
    return notes;
  }

  public void setNotes(String notes) {
    this.notes = notes;
  }

  public Integer getPerUserLimit() {
    return perUserLimit;
  }

  public void setPerUserLimit(Integer perUserLimit) {
    this.perUserLimit = perUserLimit;
  }

  public Long getCreatedBy() {
    return createdBy;
  }

  public void setCreatedBy(Long createdBy) {
    this.createdBy = createdBy;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
