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
import java.time.LocalDate;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "recurring_services")
public class RecurringServiceEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "owner_user_id", nullable = false)
  private Long ownerUserId;

  @Column(name = "property_id", nullable = false)
  private Long propertyId;

  @Column(name = "service_type", nullable = false)
  private String serviceType;

  @Column(nullable = false)
  private String recurrence;

  @Column(name = "preferred_day")
  private String preferredDay;

  @Column(name = "preferred_time_window")
  private String preferredTimeWindow;

  @Column(name = "start_date")
  private LocalDate startDate;

  @Column(nullable = false)
  private String status = "active";

  @Column(name = "next_service_date")
  private LocalDate nextServiceDate;

  @Column(name = "assigned_contractor_user_id")
  private Long assignedContractorUserId;

  @Column(columnDefinition = "TEXT")
  private String notes;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private JsonNode metadata;

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
    if (status == null) {
      status = "active";
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

  public Long getOwnerUserId() {
    return ownerUserId;
  }

  public void setOwnerUserId(Long ownerUserId) {
    this.ownerUserId = ownerUserId;
  }

  public Long getPropertyId() {
    return propertyId;
  }

  public void setPropertyId(Long propertyId) {
    this.propertyId = propertyId;
  }

  public String getServiceType() {
    return serviceType;
  }

  public void setServiceType(String serviceType) {
    this.serviceType = serviceType;
  }

  public String getRecurrence() {
    return recurrence;
  }

  public void setRecurrence(String recurrence) {
    this.recurrence = recurrence;
  }

  public String getPreferredDay() {
    return preferredDay;
  }

  public void setPreferredDay(String preferredDay) {
    this.preferredDay = preferredDay;
  }

  public String getPreferredTimeWindow() {
    return preferredTimeWindow;
  }

  public void setPreferredTimeWindow(String preferredTimeWindow) {
    this.preferredTimeWindow = preferredTimeWindow;
  }

  public LocalDate getStartDate() {
    return startDate;
  }

  public void setStartDate(LocalDate startDate) {
    this.startDate = startDate;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public LocalDate getNextServiceDate() {
    return nextServiceDate;
  }

  public void setNextServiceDate(LocalDate nextServiceDate) {
    this.nextServiceDate = nextServiceDate;
  }

  public Long getAssignedContractorUserId() {
    return assignedContractorUserId;
  }

  public void setAssignedContractorUserId(Long assignedContractorUserId) {
    this.assignedContractorUserId = assignedContractorUserId;
  }

  public String getNotes() {
    return notes;
  }

  public void setNotes(String notes) {
    this.notes = notes;
  }

  public JsonNode getMetadata() {
    return metadata;
  }

  public void setMetadata(JsonNode metadata) {
    this.metadata = metadata;
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
