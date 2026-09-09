package com.fixbridge.admin.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "referral_relationships")
public class ReferralRelationshipEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "public_id", unique = true)
  private String publicId;

  @Column(nullable = false)
  private String type;

  @Column(name = "referrer_user_id", nullable = false)
  private Long referrerUserId;

  @Column(name = "referred_user_id")
  private Long referredUserId;

  @Column(name = "referral_code", nullable = false)
  private String referralCode;

  @Column(nullable = false)
  private String status = "signed_up";

  @Column(name = "referrer_reward_cents", nullable = false)
  private Integer referrerRewardCents = 0;

  @Column(name = "referred_reward_cents", nullable = false)
  private Integer referredRewardCents = 0;

  @Column(name = "reward_type", nullable = false)
  private String rewardType = "credit";

  @Column(name = "qualification_event")
  private String qualificationEvent;

  @Column(name = "related_job_id")
  private Long relatedJobId;

  @Column(name = "qualified_at")
  private OffsetDateTime qualifiedAt;

  @Column(name = "reward_earned_at")
  private OffsetDateTime rewardEarnedAt;

  @Column(name = "reward_available_at")
  private OffsetDateTime rewardAvailableAt;

  @Column(name = "reward_used_at")
  private OffsetDateTime rewardUsedAt;

  @Column(name = "invalid_reason", columnDefinition = "CLOB")
  private String invalidReason;

  @Column(name = "hold_reason", columnDefinition = "CLOB")
  private String holdReason;

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
    updatedAt = now;
    if (status == null) {
      status = "signed_up";
    }
    if (referrerRewardCents == null) {
      referrerRewardCents = 0;
    }
    if (referredRewardCents == null) {
      referredRewardCents = 0;
    }
    if (rewardType == null) {
      rewardType = "credit";
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

  public String getPublicId() {
    return publicId;
  }

  public void setPublicId(String publicId) {
    this.publicId = publicId;
  }

  public String getType() {
    return type;
  }

  public void setType(String type) {
    this.type = type;
  }

  public Long getReferrerUserId() {
    return referrerUserId;
  }

  public void setReferrerUserId(Long referrerUserId) {
    this.referrerUserId = referrerUserId;
  }

  public Long getReferredUserId() {
    return referredUserId;
  }

  public void setReferredUserId(Long referredUserId) {
    this.referredUserId = referredUserId;
  }

  public String getReferralCode() {
    return referralCode;
  }

  public void setReferralCode(String referralCode) {
    this.referralCode = referralCode;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public Integer getReferrerRewardCents() {
    return referrerRewardCents;
  }

  public void setReferrerRewardCents(Integer referrerRewardCents) {
    this.referrerRewardCents = referrerRewardCents;
  }

  public Integer getReferredRewardCents() {
    return referredRewardCents;
  }

  public void setReferredRewardCents(Integer referredRewardCents) {
    this.referredRewardCents = referredRewardCents;
  }

  public String getRewardType() {
    return rewardType;
  }

  public void setRewardType(String rewardType) {
    this.rewardType = rewardType;
  }

  public String getQualificationEvent() {
    return qualificationEvent;
  }

  public void setQualificationEvent(String qualificationEvent) {
    this.qualificationEvent = qualificationEvent;
  }

  public Long getRelatedJobId() {
    return relatedJobId;
  }

  public void setRelatedJobId(Long relatedJobId) {
    this.relatedJobId = relatedJobId;
  }

  public OffsetDateTime getQualifiedAt() {
    return qualifiedAt;
  }

  public void setQualifiedAt(OffsetDateTime qualifiedAt) {
    this.qualifiedAt = qualifiedAt;
  }

  public OffsetDateTime getRewardEarnedAt() {
    return rewardEarnedAt;
  }

  public void setRewardEarnedAt(OffsetDateTime rewardEarnedAt) {
    this.rewardEarnedAt = rewardEarnedAt;
  }

  public OffsetDateTime getRewardAvailableAt() {
    return rewardAvailableAt;
  }

  public void setRewardAvailableAt(OffsetDateTime rewardAvailableAt) {
    this.rewardAvailableAt = rewardAvailableAt;
  }

  public OffsetDateTime getRewardUsedAt() {
    return rewardUsedAt;
  }

  public void setRewardUsedAt(OffsetDateTime rewardUsedAt) {
    this.rewardUsedAt = rewardUsedAt;
  }

  public String getInvalidReason() {
    return invalidReason;
  }

  public void setInvalidReason(String invalidReason) {
    this.invalidReason = invalidReason;
  }

  public String getHoldReason() {
    return holdReason;
  }

  public void setHoldReason(String holdReason) {
    this.holdReason = holdReason;
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
