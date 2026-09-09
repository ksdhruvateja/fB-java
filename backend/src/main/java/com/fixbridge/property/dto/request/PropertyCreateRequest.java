package com.fixbridge.property.dto.request;

import com.fasterxml.jackson.databind.JsonNode;

public class PropertyCreateRequest {

  private String label;
  private String addressLine1;
  private String addressLine2;
  private String city;
  private String state;
  private String zip;
  private String country;
  private String streetAddress;
  private String propertyType;
  private String accessNotes;
  private String propertyPurpose;
  private String transactionStage;
  private Integer yearBuilt;
  private Double beds;
  private Double baths;
  private Integer sqft;
  private JsonNode homeSystems;
  private String postalCodePlus4;
  private String timezone;
  private Double latitude;
  private Double longitude;

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

  public Integer getYearBuilt() {
    return yearBuilt;
  }

  public void setYearBuilt(Integer yearBuilt) {
    this.yearBuilt = yearBuilt;
  }

  public Double getBeds() {
    return beds;
  }

  public void setBeds(Double beds) {
    this.beds = beds;
  }

  public Double getBaths() {
    return baths;
  }

  public void setBaths(Double baths) {
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
}
