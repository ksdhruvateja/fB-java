package com.fixbridge.servicecatalog.dto;

import com.fasterxml.jackson.databind.JsonNode;

/** Admin capability / visibility edits for a service offering. */
public class ServiceOfferingUpdateRequest {

  private String name;
  private String description;
  private String iconKey;
  private Boolean oneTimeProfessional;
  private Boolean diyEligible;
  private Boolean aiAssessmentEligible;
  private Boolean subscriptionEligible;
  private Boolean emergencyEligible;
  private Boolean active;
  private Boolean homeownerVisible;
  private JsonNode pricingMetadata;
  private Integer sortOrder;

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
}
