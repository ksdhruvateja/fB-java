package com.fixbridge.payout.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "payout_settings")
public class PayoutSettingsEntity {

  @Id
  @Column(length = 32)
  private String id = "default";

  @Column(name = "instant_payout_enabled")
  private Boolean instantPayoutEnabled = true;

  @Column(name = "instant_fee_type", length = 64)
  private String instantFeeType = "percentage_plus_fixed";

  @Column(name = "instant_fee_percentage_bps")
  private Integer instantFeePercentageBps = 200;

  @Column(name = "instant_fee_fixed_cents")
  private Integer instantFeeFixedCents = 150;

  @Column(name = "minimum_instant_fee_cents")
  private Integer minimumInstantFeeCents = 50;

  @Column(name = "maximum_instant_fee_cents")
  private Integer maximumInstantFeeCents = 2500;

  @Column(name = "minimum_instant_payout_cents")
  private Integer minimumInstantPayoutCents = 1000;

  @Column(name = "maximum_instant_payout_cents")
  private Integer maximumInstantPayoutCents = 1000000;

  @Column(name = "contractor_absorbs_fee")
  private Boolean contractorAbsorbsFee = true;

  @Column(name = "fixbridge_absorbs_fee")
  private Boolean fixbridgeAbsorbsFee = false;

  @Column(name = "updated_by")
  private Long updatedBy;

  @Column(name = "updated_at")
  private OffsetDateTime updatedAt;

  @PrePersist
  @PreUpdate
  void touch() {
    updatedAt = OffsetDateTime.now();
    if (instantPayoutEnabled == null) {
      instantPayoutEnabled = true;
    }
    if (instantFeeType == null) {
      instantFeeType = "percentage_plus_fixed";
    }
    if (instantFeePercentageBps == null) {
      instantFeePercentageBps = 200;
    }
    if (instantFeeFixedCents == null) {
      instantFeeFixedCents = 150;
    }
    if (minimumInstantFeeCents == null) {
      minimumInstantFeeCents = 50;
    }
    if (maximumInstantFeeCents == null) {
      maximumInstantFeeCents = 2500;
    }
    if (minimumInstantPayoutCents == null) {
      minimumInstantPayoutCents = 1000;
    }
    if (maximumInstantPayoutCents == null) {
      maximumInstantPayoutCents = 1000000;
    }
    if (contractorAbsorbsFee == null) {
      contractorAbsorbsFee = true;
    }
    if (fixbridgeAbsorbsFee == null) {
      fixbridgeAbsorbsFee = false;
    }
  }

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public Boolean getInstantPayoutEnabled() {
    return instantPayoutEnabled;
  }

  public void setInstantPayoutEnabled(Boolean instantPayoutEnabled) {
    this.instantPayoutEnabled = instantPayoutEnabled;
  }

  public String getInstantFeeType() {
    return instantFeeType;
  }

  public void setInstantFeeType(String instantFeeType) {
    this.instantFeeType = instantFeeType;
  }

  public Integer getInstantFeePercentageBps() {
    return instantFeePercentageBps;
  }

  public void setInstantFeePercentageBps(Integer instantFeePercentageBps) {
    this.instantFeePercentageBps = instantFeePercentageBps;
  }

  public Integer getInstantFeeFixedCents() {
    return instantFeeFixedCents;
  }

  public void setInstantFeeFixedCents(Integer instantFeeFixedCents) {
    this.instantFeeFixedCents = instantFeeFixedCents;
  }

  public Integer getMinimumInstantFeeCents() {
    return minimumInstantFeeCents;
  }

  public void setMinimumInstantFeeCents(Integer minimumInstantFeeCents) {
    this.minimumInstantFeeCents = minimumInstantFeeCents;
  }

  public Integer getMaximumInstantFeeCents() {
    return maximumInstantFeeCents;
  }

  public void setMaximumInstantFeeCents(Integer maximumInstantFeeCents) {
    this.maximumInstantFeeCents = maximumInstantFeeCents;
  }

  public Integer getMinimumInstantPayoutCents() {
    return minimumInstantPayoutCents;
  }

  public void setMinimumInstantPayoutCents(Integer minimumInstantPayoutCents) {
    this.minimumInstantPayoutCents = minimumInstantPayoutCents;
  }

  public Integer getMaximumInstantPayoutCents() {
    return maximumInstantPayoutCents;
  }

  public void setMaximumInstantPayoutCents(Integer maximumInstantPayoutCents) {
    this.maximumInstantPayoutCents = maximumInstantPayoutCents;
  }

  public Boolean getContractorAbsorbsFee() {
    return contractorAbsorbsFee;
  }

  public void setContractorAbsorbsFee(Boolean contractorAbsorbsFee) {
    this.contractorAbsorbsFee = contractorAbsorbsFee;
  }

  public Boolean getFixbridgeAbsorbsFee() {
    return fixbridgeAbsorbsFee;
  }

  public void setFixbridgeAbsorbsFee(Boolean fixbridgeAbsorbsFee) {
    this.fixbridgeAbsorbsFee = fixbridgeAbsorbsFee;
  }

  public Long getUpdatedBy() {
    return updatedBy;
  }

  public void setUpdatedBy(Long updatedBy) {
    this.updatedBy = updatedBy;
  }

  public OffsetDateTime getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(OffsetDateTime updatedAt) {
    this.updatedAt = updatedAt;
  }
}
