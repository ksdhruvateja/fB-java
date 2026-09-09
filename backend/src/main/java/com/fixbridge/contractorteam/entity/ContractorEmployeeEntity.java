package com.fixbridge.contractorteam.entity;

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
@Table(name = "contractor_employees")
public class ContractorEmployeeEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "contractor_user_id", nullable = false)
  private Long contractorUserId;

  @Column(name = "full_name", nullable = false)
  private String fullName;

  @Column(name = "job_title")
  private String jobTitle;

  @Column(columnDefinition = "CLOB")
  private String bio;

  private String trade;

  @Column(name = "years_experience")
  private Integer yearsExperience;

  @Column(name = "employee_ref")
  private String employeeRef;

  @Column(name = "photo_data", columnDefinition = "CLOB")
  private String photoData;

  @Column(name = "photo_mime")
  private String photoMime;

  @Column(name = "customer_description", columnDefinition = "CLOB")
  private String customerDescription;

  @Column(name = "internal_notes", columnDefinition = "CLOB")
  private String internalNotes;

  @Column(nullable = false, columnDefinition = "CLOB")
  private String phones = "[]";

  @Column(nullable = false, columnDefinition = "CLOB")
  private String emails = "[]";

  @Column(nullable = false)
  private Boolean active = true;

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
    if (phones == null) {
      phones = "[]";
    }
    if (emails == null) {
      emails = "[]";
    }
    if (active == null) {
      active = true;
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

  public Long getContractorUserId() {
    return contractorUserId;
  }

  public void setContractorUserId(Long contractorUserId) {
    this.contractorUserId = contractorUserId;
  }

  public String getFullName() {
    return fullName;
  }

  public void setFullName(String fullName) {
    this.fullName = fullName;
  }

  public String getJobTitle() {
    return jobTitle;
  }

  public void setJobTitle(String jobTitle) {
    this.jobTitle = jobTitle;
  }

  public String getBio() {
    return bio;
  }

  public void setBio(String bio) {
    this.bio = bio;
  }

  public String getTrade() {
    return trade;
  }

  public void setTrade(String trade) {
    this.trade = trade;
  }

  public Integer getYearsExperience() {
    return yearsExperience;
  }

  public void setYearsExperience(Integer yearsExperience) {
    this.yearsExperience = yearsExperience;
  }

  public String getEmployeeRef() {
    return employeeRef;
  }

  public void setEmployeeRef(String employeeRef) {
    this.employeeRef = employeeRef;
  }

  public String getPhotoData() {
    return photoData;
  }

  public void setPhotoData(String photoData) {
    this.photoData = photoData;
  }

  public String getPhotoMime() {
    return photoMime;
  }

  public void setPhotoMime(String photoMime) {
    this.photoMime = photoMime;
  }

  public String getCustomerDescription() {
    return customerDescription;
  }

  public void setCustomerDescription(String customerDescription) {
    this.customerDescription = customerDescription;
  }

  public String getInternalNotes() {
    return internalNotes;
  }

  public void setInternalNotes(String internalNotes) {
    this.internalNotes = internalNotes;
  }

  public String getPhones() {
    return phones;
  }

  public void setPhones(String phones) {
    this.phones = phones;
  }

  public String getEmails() {
    return emails;
  }

  public void setEmails(String emails) {
    this.emails = emails;
  }

  public Boolean getActive() {
    return active;
  }

  public void setActive(Boolean active) {
    this.active = active;
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
