package com.fixbridge.property.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "properties")
public class PropertyEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "owner_user_id", nullable = false)
  private Long ownerUserId;

  private String label;

  @Column(name = "address_line1", nullable = false)
  private String addressLine1;

  @Column(name = "address_line2")
  private String addressLine2;

  private String city;
  private String state;
  private String zip;

  @Column(name = "property_type")
  private String propertyType;

  @Column(name = "access_notes")
  private String accessNotes;

  @Column(name = "property_purpose")
  private String propertyPurpose;

  @Column(name = "transaction_stage")
  private String transactionStage;

  private String country = "US";

  @Column(name = "street_address")
  private String streetAddress;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "health_profile", columnDefinition = "jsonb")
  private JsonNode healthProfile;

  @Column(name = "year_built")
  private Integer yearBuilt;

  private BigDecimal beds;
  private BigDecimal baths;
  private Integer sqft;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "home_systems", columnDefinition = "jsonb")
  private JsonNode homeSystems;

  @Column(name = "postal_code_plus4")
  private String postalCodePlus4;

  @Column(name = "address_verified")
  private Boolean addressVerified = false;

  @Column(name = "address_verified_at")
  private OffsetDateTime addressVerifiedAt;

  @Column(name = "address_verification_provider")
  private String addressVerificationProvider;

  private String timezone;
  private Double latitude;
  private Double longitude;

  @Column(name = "created_at")
  private OffsetDateTime createdAt;

  @PrePersist
  void onCreate() {
    if (createdAt == null) {
      createdAt = OffsetDateTime.now();
    }
    if (country == null || country.isBlank()) {
      country = "US";
    }
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

  public String getLabel() {
    return label;
  }

  public void setLabel(String label) {
    this.label = label;
  }

  public String getAddressLine1() {
    return addressLine1;
  }

  public void setAddressLine1(String addressLine1) {
    this.addressLine1 = addressLine1;
  }

  public String getAddressLine2() {
    return addressLine2;
  }

  public void setAddressLine2(String addressLine2) {
    this.addressLine2 = addressLine2;
  }

  public String getCity() {
    return city;
  }

  public void setCity(String city) {
    this.city = city;
  }

  public String getState() {
    return state;
  }

  public void setState(String state) {
    this.state = state;
  }

  public String getZip() {
    return zip;
  }

  public void setZip(String zip) {
    this.zip = zip;
  }

  public String getPropertyType() {
    return propertyType;
  }

  public void setPropertyType(String propertyType) {
    this.propertyType = propertyType;
  }

  public String getAccessNotes() {
    return accessNotes;
  }

  public void setAccessNotes(String accessNotes) {
    this.accessNotes = accessNotes;
  }

  public String getPropertyPurpose() {
    return propertyPurpose;
  }

  public void setPropertyPurpose(String propertyPurpose) {
    this.propertyPurpose = propertyPurpose;
  }

  public String getTransactionStage() {
    return transactionStage;
  }

  public void setTransactionStage(String transactionStage) {
    this.transactionStage = transactionStage;
  }

  public String getCountry() {
    return country;
  }

  public void setCountry(String country) {
    this.country = country;
  }

  public String getStreetAddress() {
    return streetAddress;
  }

  public void setStreetAddress(String streetAddress) {
    this.streetAddress = streetAddress;
  }

  public JsonNode getHealthProfile() {
    return healthProfile;
  }

  public void setHealthProfile(JsonNode healthProfile) {
    this.healthProfile = healthProfile;
  }

  public Integer getYearBuilt() {
    return yearBuilt;
  }

  public void setYearBuilt(Integer yearBuilt) {
    this.yearBuilt = yearBuilt;
  }

  public BigDecimal getBeds() {
    return beds;
  }

  public void setBeds(BigDecimal beds) {
    this.beds = beds;
  }

  public BigDecimal getBaths() {
    return baths;
  }

  public void setBaths(BigDecimal baths) {
    this.baths = baths;
  }

  public Integer getSqft() {
    return sqft;
  }

  public void setSqft(Integer sqft) {
    this.sqft = sqft;
  }

  public JsonNode getHomeSystems() {
    return homeSystems;
  }

  public void setHomeSystems(JsonNode homeSystems) {
    this.homeSystems = homeSystems;
  }

  public String getPostalCodePlus4() {
    return postalCodePlus4;
  }

  public void setPostalCodePlus4(String postalCodePlus4) {
    this.postalCodePlus4 = postalCodePlus4;
  }

  public Boolean getAddressVerified() {
    return addressVerified;
  }

  public void setAddressVerified(Boolean addressVerified) {
    this.addressVerified = addressVerified;
  }

  public OffsetDateTime getAddressVerifiedAt() {
    return addressVerifiedAt;
  }

  public void setAddressVerifiedAt(OffsetDateTime addressVerifiedAt) {
    this.addressVerifiedAt = addressVerifiedAt;
  }

  public String getAddressVerificationProvider() {
    return addressVerificationProvider;
  }

  public void setAddressVerificationProvider(String addressVerificationProvider) {
    this.addressVerificationProvider = addressVerificationProvider;
  }

  public String getTimezone() {
    return timezone;
  }

  public void setTimezone(String timezone) {
    this.timezone = timezone;
  }

  public Double getLatitude() {
    return latitude;
  }

  public void setLatitude(Double latitude) {
    this.latitude = latitude;
  }

  public Double getLongitude() {
    return longitude;
  }

  public void setLongitude(Double longitude) {
    this.longitude = longitude;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
