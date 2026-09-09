package com.fixbridge.servicecatalog.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "service_offerings")
public class ServiceOfferingEntity {

  @Id
  @Column(length = 64)
  private String id;

  @Column(nullable = false, unique = true, length = 64)
  private String slug;

  @Column(nullable = false, length = 120)
  private String name;

  @Column(nullable = false, length = 512)
  private String description;

  @Column(name = "icon_key", length = 64)
  private String iconKey;

  @Column(name = "one_time_professional", nullable = false)
  private Boolean oneTimeProfessional = true;

  @Column(name = "diy_eligible", nullable = false)
  private Boolean diyEligible = true;

  @Column(name = "ai_assessment_eligible", nullable = false)
  private Boolean aiAssessmentEligible = true;

  @Column(name = "subscription_eligible", nullable = false)
  private Boolean subscriptionEligible = false;

  @Column(name = "emergency_eligible", nullable = false)
  private Boolean emergencyEligible = false;

  @Column(nullable = false)
  private Boolean active = true;

  @Column(name = "homeowner_visible", nullable = false)
  private Boolean homeownerVisible = true;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "pricing_metadata", columnDefinition = "jsonb")
  private JsonNode pricingMetadata;

  @Column(name = "sort_order", nullable = false)
  private Integer sortOrder = 0;

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
    if (slug == null || slug.isBlank()) {
      slug = id;
    }
    normalizeFlags();
  }

  @PreUpdate
  void onUpdate() {
    updatedAt = OffsetDateTime.now();
    normalizeFlags();
  }

  private void normalizeFlags() {
    if (oneTimeProfessional == null) {
      oneTimeProfessional = true;
    }
    if (diyEligible == null) {
      diyEligible = true;
    }
    if (aiAssessmentEligible == null) {
      aiAssessmentEligible = true;
    }
    if (subscriptionEligible == null) {
      subscriptionEligible = false;
    }
    if (emergencyEligible == null) {
      emergencyEligible = false;
    }
    if (active == null) {
      active = true;
    }
    if (homeownerVisible == null) {
      homeownerVisible = true;
    }
    if (sortOrder == null) {
      sortOrder = 0;
    }
  }

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public String getSlug() {
    return slug;
  }

  public void setSlug(String slug) {
    this.slug = slug;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getIconKey() {
    return iconKey;
  }

  public void setIconKey(String iconKey) {
    this.iconKey = iconKey;
  }

  public Boolean getOneTimeProfessional() {
    return oneTimeProfessional;
  }

  public void setOneTimeProfessional(Boolean oneTimeProfessional) {
    this.oneTimeProfessional = oneTimeProfessional;
  }

  public Boolean getDiyEligible() {
    return diyEligible;
  }

  public void setDiyEligible(Boolean diyEligible) {
    this.diyEligible = diyEligible;
  }

  public Boolean getAiAssessmentEligible() {
    return aiAssessmentEligible;
  }

  public void setAiAssessmentEligible(Boolean aiAssessmentEligible) {
    this.aiAssessmentEligible = aiAssessmentEligible;
  }

  public Boolean getSubscriptionEligible() {
    return subscriptionEligible;
  }

  public void setSubscriptionEligible(Boolean subscriptionEligible) {
    this.subscriptionEligible = subscriptionEligible;
  }

  public Boolean getEmergencyEligible() {
    return emergencyEligible;
  }

  public void setEmergencyEligible(Boolean emergencyEligible) {
    this.emergencyEligible = emergencyEligible;
  }

  public Boolean getActive() {
    return active;
  }

  public void setActive(Boolean active) {
    this.active = active;
  }

  public Boolean getHomeownerVisible() {
    return homeownerVisible;
  }

  public void setHomeownerVisible(Boolean homeownerVisible) {
    this.homeownerVisible = homeownerVisible;
  }

  public JsonNode getPricingMetadata() {
    return pricingMetadata;
  }

  public void setPricingMetadata(JsonNode pricingMetadata) {
    this.pricingMetadata = pricingMetadata;
  }

  public Integer getSortOrder() {
    return sortOrder;
  }

  public void setSortOrder(Integer sortOrder) {
    this.sortOrder = sortOrder;
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
