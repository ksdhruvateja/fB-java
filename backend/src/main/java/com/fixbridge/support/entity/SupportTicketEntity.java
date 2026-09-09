package com.fixbridge.support.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "support_tickets")
public class SupportTicketEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "ticket_number", nullable = false, unique = true)
  private String ticketNumber;

  @Column(name = "user_id", nullable = false)
  private Long userId;

  @Column(name = "user_role")
  private String userRole;

  @Column(name = "user_name")
  private String userName;

  @Column(name = "user_email", nullable = false)
  private String userEmail;

  @Column(name = "user_phone")
  private String userPhone;

  @Column(nullable = false)
  private String channel;

  @Column(nullable = false)
  private String subject;

  @Column(nullable = false, columnDefinition = "TEXT")
  private String message;

  private String category;

  @Column(nullable = false)
  private String priority = "normal";

  @Column(name = "assigned_to")
  private String assignedTo;

  @Column(name = "related_property_id")
  private Long relatedPropertyId;

  @Column(name = "related_job_id")
  private Long relatedJobId;

  @Column(name = "related_quote_id")
  private Long relatedQuoteId;

  @Column(name = "related_invoice_id")
  private Long relatedInvoiceId;

  @Column(name = "related_payment_id")
  private Long relatedPaymentId;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private JsonNode context;

  @Column(nullable = false)
  private String status = "open";

  @Column(name = "created_at")
  private OffsetDateTime createdAt;

  @Column(name = "updated_at")
  private OffsetDateTime updatedAt;

  @Column(name = "resolved_at")
  private OffsetDateTime resolvedAt;

  @Column(name = "closed_at")
  private OffsetDateTime closedAt;

  @PrePersist
  void onCreate() {
    OffsetDateTime now = OffsetDateTime.now();
    if (createdAt == null) {
      createdAt = now;
    }
    if (updatedAt == null) {
      updatedAt = now;
    }
    if (priority == null) {
      priority = "normal";
    }
    if (status == null) {
      status = "open";
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

  public String getTicketNumber() {
    return ticketNumber;
  }

  public void setTicketNumber(String ticketNumber) {
    this.ticketNumber = ticketNumber;
  }

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public String getUserRole() {
    return userRole;
  }

  public void setUserRole(String userRole) {
    this.userRole = userRole;
  }

  public String getUserName() {
    return userName;
  }

  public void setUserName(String userName) {
    this.userName = userName;
  }

  public String getUserEmail() {
    return userEmail;
  }

  public void setUserEmail(String userEmail) {
    this.userEmail = userEmail;
  }

  public String getUserPhone() {
    return userPhone;
  }

  public void setUserPhone(String userPhone) {
    this.userPhone = userPhone;
  }

  public String getChannel() {
    return channel;
  }

  public void setChannel(String channel) {
    this.channel = channel;
  }

  public String getSubject() {
    return subject;
  }

  public void setSubject(String subject) {
    this.subject = subject;
  }

  public String getMessage() {
    return message;
  }

  public void setMessage(String message) {
    this.message = message;
  }

  public String getCategory() {
    return category;
  }

  public void setCategory(String category) {
    this.category = category;
  }

  public String getPriority() {
    return priority;
  }

  public void setPriority(String priority) {
    this.priority = priority;
  }

  public String getAssignedTo() {
    return assignedTo;
  }

  public void setAssignedTo(String assignedTo) {
    this.assignedTo = assignedTo;
  }

  public Long getRelatedPropertyId() {
    return relatedPropertyId;
  }

  public void setRelatedPropertyId(Long relatedPropertyId) {
    this.relatedPropertyId = relatedPropertyId;
  }

  public Long getRelatedJobId() {
    return relatedJobId;
  }

  public void setRelatedJobId(Long relatedJobId) {
    this.relatedJobId = relatedJobId;
  }

  public Long getRelatedQuoteId() {
    return relatedQuoteId;
  }

  public void setRelatedQuoteId(Long relatedQuoteId) {
    this.relatedQuoteId = relatedQuoteId;
  }

  public Long getRelatedInvoiceId() {
    return relatedInvoiceId;
  }

  public void setRelatedInvoiceId(Long relatedInvoiceId) {
    this.relatedInvoiceId = relatedInvoiceId;
  }

  public Long getRelatedPaymentId() {
    return relatedPaymentId;
  }

  public void setRelatedPaymentId(Long relatedPaymentId) {
    this.relatedPaymentId = relatedPaymentId;
  }

  public JsonNode getContext() {
    return context;
  }

  public void setContext(JsonNode context) {
    this.context = context;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
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

  public OffsetDateTime getResolvedAt() {
    return resolvedAt;
  }

  public void setResolvedAt(OffsetDateTime resolvedAt) {
    this.resolvedAt = resolvedAt;
  }

  public OffsetDateTime getClosedAt() {
    return closedAt;
  }

  public void setClosedAt(OffsetDateTime closedAt) {
    this.closedAt = closedAt;
  }
}
