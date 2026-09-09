package com.fixbridge.payout.entity;

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
@Table(name = "contractor_payouts")
public class ContractorPayoutEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "contractor_id", nullable = false)
  private Long contractorId;

  @Column(name = "job_id", nullable = false, unique = true)
  private Long jobId;

  @Column(name = "job_ref", length = 64)
  private String jobRef;

  @Column(name = "customer_label", length = 512)
  private String customerLabel;

  @Column(name = "completion_date")
  private OffsetDateTime completionDate;

  @Column(name = "gross_amount_cents", nullable = false)
  private Integer grossAmountCents = 0;

  @Column(name = "platform_fee_cents", nullable = false)
  private Integer platformFeeCents = 0;

  @Column(name = "instant_payout_fee_cents", nullable = false)
  private Integer instantPayoutFeeCents = 0;

  @Column(name = "adjustments_cents", nullable = false)
  private Integer adjustmentsCents = 0;

  @Column(name = "net_amount_cents", nullable = false)
  private Integer netAmountCents = 0;

  @Column(name = "reserve_amount_cents", nullable = false)
  private Integer reserveAmountCents = 0;

  @Column(name = "service_amount_cents", nullable = false)
  private Integer serviceAmountCents = 0;

  @Column(name = "tip_amount_cents", nullable = false)
  private Integer tipAmountCents = 0;

  @Column(name = "payout_method", length = 32)
  private String payoutMethod = "standard";

  @Column(name = "stripe_transfer_id")
  private String stripeTransferId;

  @Column(name = "stripe_payout_id")
  private String stripePayoutId;

  @Column(nullable = false)
  private String status = "pending_approval";

  @Column(name = "hold_reason", length = 1024)
  private String holdReason;

  @Column(name = "held_at")
  private OffsetDateTime heldAt;

  @Column(name = "approved_by")
  private Long approvedBy;

  @Column(name = "approved_at")
  private OffsetDateTime approvedAt;

  @Column(name = "paid_at")
  private OffsetDateTime paidAt;

  @Column(name = "estimated_payout_at")
  private OffsetDateTime estimatedPayoutAt;

  @Column(name = "failure_reason", columnDefinition = "TEXT")
  private String failureReason;

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
      status = "pending_approval";
    }
    if (payoutMethod == null) {
      payoutMethod = "standard";
    }
    if (grossAmountCents == null) {
      grossAmountCents = 0;
    }
    if (platformFeeCents == null) {
      platformFeeCents = 0;
    }
    if (instantPayoutFeeCents == null) {
      instantPayoutFeeCents = 0;
    }
    if (adjustmentsCents == null) {
      adjustmentsCents = 0;
    }
    if (netAmountCents == null) {
      netAmountCents = 0;
    }
    if (reserveAmountCents == null) {
      reserveAmountCents = 0;
    }
    if (serviceAmountCents == null) {
      serviceAmountCents = 0;
    }
    if (tipAmountCents == null) {
      tipAmountCents = 0;
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

  public Long getContractorId() {
    return contractorId;
  }

  public void setContractorId(Long contractorId) {
    this.contractorId = contractorId;
  }

  public Long getJobId() {
    return jobId;
  }

  public void setJobId(Long jobId) {
    this.jobId = jobId;
  }

  public String getJobRef() {
    return jobRef;
  }

  public void setJobRef(String jobRef) {
    this.jobRef = jobRef;
  }

  public String getCustomerLabel() {
    return customerLabel;
  }

  public void setCustomerLabel(String customerLabel) {
    this.customerLabel = customerLabel;
  }

  public OffsetDateTime getCompletionDate() {
    return completionDate;
  }

  public void setCompletionDate(OffsetDateTime completionDate) {
    this.completionDate = completionDate;
  }

  public Integer getGrossAmountCents() {
    return grossAmountCents;
  }

  public void setGrossAmountCents(Integer grossAmountCents) {
    this.grossAmountCents = grossAmountCents;
  }

  public Integer getPlatformFeeCents() {
    return platformFeeCents;
  }

  public void setPlatformFeeCents(Integer platformFeeCents) {
    this.platformFeeCents = platformFeeCents;
  }

  public Integer getInstantPayoutFeeCents() {
    return instantPayoutFeeCents;
  }

  public void setInstantPayoutFeeCents(Integer instantPayoutFeeCents) {
    this.instantPayoutFeeCents = instantPayoutFeeCents;
  }

  public Integer getAdjustmentsCents() {
    return adjustmentsCents;
  }

  public void setAdjustmentsCents(Integer adjustmentsCents) {
    this.adjustmentsCents = adjustmentsCents;
  }

  public Integer getNetAmountCents() {
    return netAmountCents;
  }

  public void setNetAmountCents(Integer netAmountCents) {
    this.netAmountCents = netAmountCents;
  }

  public Integer getReserveAmountCents() {
    return reserveAmountCents;
  }

  public void setReserveAmountCents(Integer reserveAmountCents) {
    this.reserveAmountCents = reserveAmountCents;
  }

  public Integer getServiceAmountCents() {
    return serviceAmountCents;
  }

  public void setServiceAmountCents(Integer serviceAmountCents) {
    this.serviceAmountCents = serviceAmountCents;
  }

  public Integer getTipAmountCents() {
    return tipAmountCents;
  }

  public void setTipAmountCents(Integer tipAmountCents) {
    this.tipAmountCents = tipAmountCents;
  }

  public String getPayoutMethod() {
    return payoutMethod;
  }

  public void setPayoutMethod(String payoutMethod) {
    this.payoutMethod = payoutMethod;
  }

  public String getStripeTransferId() {
    return stripeTransferId;
  }

  public void setStripeTransferId(String stripeTransferId) {
    this.stripeTransferId = stripeTransferId;
  }

  public String getStripePayoutId() {
    return stripePayoutId;
  }

  public void setStripePayoutId(String stripePayoutId) {
    this.stripePayoutId = stripePayoutId;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getHoldReason() {
    return holdReason;
  }

  public void setHoldReason(String holdReason) {
    this.holdReason = holdReason;
  }

  public OffsetDateTime getHeldAt() {
    return heldAt;
  }

  public void setHeldAt(OffsetDateTime heldAt) {
    this.heldAt = heldAt;
  }

  public Long getApprovedBy() {
    return approvedBy;
  }

  public void setApprovedBy(Long approvedBy) {
    this.approvedBy = approvedBy;
  }

  public OffsetDateTime getApprovedAt() {
    return approvedAt;
  }

  public void setApprovedAt(OffsetDateTime approvedAt) {
    this.approvedAt = approvedAt;
  }

  public OffsetDateTime getPaidAt() {
    return paidAt;
  }

  public void setPaidAt(OffsetDateTime paidAt) {
    this.paidAt = paidAt;
  }

  public OffsetDateTime getEstimatedPayoutAt() {
    return estimatedPayoutAt;
  }

  public void setEstimatedPayoutAt(OffsetDateTime estimatedPayoutAt) {
    this.estimatedPayoutAt = estimatedPayoutAt;
  }

  public String getFailureReason() {
    return failureReason;
  }

  public void setFailureReason(String failureReason) {
    this.failureReason = failureReason;
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
