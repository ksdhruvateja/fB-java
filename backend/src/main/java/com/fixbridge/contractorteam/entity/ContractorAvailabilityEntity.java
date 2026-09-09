package com.fixbridge.contractorteam.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "contractor_availability")
public class ContractorAvailabilityEntity {

  @Id
  @Column(name = "contractor_user_id")
  private Long contractorUserId;

  private String timezone = "America/New_York";

  @Column(name = "working_days", columnDefinition = "CLOB")
  private String workingDays;

  @Column(name = "same_day_available")
  private Boolean sameDayAvailable = false;

  @Column(name = "emergency_available")
  private Boolean emergencyAvailable = false;

  @Column(name = "max_jobs_per_day")
  private Integer maxJobsPerDay;

  @Column(name = "temporary_unavailable")
  private Boolean temporaryUnavailable = false;

  @Column(name = "updated_at")
  private OffsetDateTime updatedAt;

  @PrePersist
  @PreUpdate
  void touch() {
    updatedAt = OffsetDateTime.now();
    if (timezone == null) {
      timezone = "America/New_York";
    }
    if (sameDayAvailable == null) {
      sameDayAvailable = false;
    }
    if (emergencyAvailable == null) {
      emergencyAvailable = false;
    }
    if (temporaryUnavailable == null) {
      temporaryUnavailable = false;
    }
  }

  public Long getContractorUserId() {
    return contractorUserId;
  }

  public void setContractorUserId(Long contractorUserId) {
    this.contractorUserId = contractorUserId;
  }

  public String getTimezone() {
    return timezone;
  }

  public void setTimezone(String timezone) {
    this.timezone = timezone;
  }

  public String getWorkingDays() {
    return workingDays;
  }

  public void setWorkingDays(String workingDays) {
    this.workingDays = workingDays;
  }

  public Boolean getSameDayAvailable() {
    return sameDayAvailable;
  }

  public void setSameDayAvailable(Boolean sameDayAvailable) {
    this.sameDayAvailable = sameDayAvailable;
  }

  public Boolean getEmergencyAvailable() {
    return emergencyAvailable;
  }

  public void setEmergencyAvailable(Boolean emergencyAvailable) {
    this.emergencyAvailable = emergencyAvailable;
  }

  public Integer getMaxJobsPerDay() {
    return maxJobsPerDay;
  }

  public void setMaxJobsPerDay(Integer maxJobsPerDay) {
    this.maxJobsPerDay = maxJobsPerDay;
  }

  public Boolean getTemporaryUnavailable() {
    return temporaryUnavailable;
  }

  public void setTemporaryUnavailable(Boolean temporaryUnavailable) {
    this.temporaryUnavailable = temporaryUnavailable;
  }

  public OffsetDateTime getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(OffsetDateTime updatedAt) {
    this.updatedAt = updatedAt;
  }
}
