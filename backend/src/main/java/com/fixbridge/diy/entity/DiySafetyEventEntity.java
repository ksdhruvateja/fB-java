package com.fixbridge.diy.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "diy_safety_events")
public class DiySafetyEventEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private Long userId;

  @Column(name = "job_id")
  private Long jobId;

  @Column(name = "event_type", nullable = false)
  private String eventType;

  @Column(name = "risk_level")
  private String riskLevel;

  @Column(name = "previous_risk_level")
  private String previousRiskLevel;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "risk_reason_codes", columnDefinition = "jsonb")
  private JsonNode riskReasonCodes;

  @Column(name = "feedback_rating")
  private String feedbackRating;

  @Column(name = "incident_type")
  private String incidentType;

  @Column(columnDefinition = "TEXT")
  private String description;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private JsonNode metadata;

  @Column(name = "ip_address")
  private String ipAddress;

  @Column(name = "user_agent")
  private String userAgent;

  @Column(name = "source_route")
  private String sourceRoute;

  @Column(name = "created_at")
  private OffsetDateTime createdAt;

  @PrePersist
  void onCreate() {
    if (createdAt == null) {
      createdAt = OffsetDateTime.now();
    }
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public Long getJobId() {
    return jobId;
  }

  public void setJobId(Long jobId) {
    this.jobId = jobId;
  }

  public String getEventType() {
    return eventType;
  }

  public void setEventType(String eventType) {
    this.eventType = eventType;
  }

  public String getRiskLevel() {
    return riskLevel;
  }

  public void setRiskLevel(String riskLevel) {
    this.riskLevel = riskLevel;
  }

  public String getPreviousRiskLevel() {
    return previousRiskLevel;
  }

  public void setPreviousRiskLevel(String previousRiskLevel) {
    this.previousRiskLevel = previousRiskLevel;
  }

  public JsonNode getRiskReasonCodes() {
    return riskReasonCodes;
  }

  public void setRiskReasonCodes(JsonNode riskReasonCodes) {
    this.riskReasonCodes = riskReasonCodes;
  }

  public String getFeedbackRating() {
    return feedbackRating;
  }

  public void setFeedbackRating(String feedbackRating) {
    this.feedbackRating = feedbackRating;
  }

  public String getIncidentType() {
    return incidentType;
  }

  public void setIncidentType(String incidentType) {
    this.incidentType = incidentType;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public JsonNode getMetadata() {
    return metadata;
  }

  public void setMetadata(JsonNode metadata) {
    this.metadata = metadata;
  }

  public String getIpAddress() {
    return ipAddress;
  }

  public void setIpAddress(String ipAddress) {
    this.ipAddress = ipAddress;
  }

  public String getUserAgent() {
    return userAgent;
  }

  public void setUserAgent(String userAgent) {
    this.userAgent = userAgent;
  }

  public String getSourceRoute() {
    return sourceRoute;
  }

  public void setSourceRoute(String sourceRoute) {
    this.sourceRoute = sourceRoute;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
