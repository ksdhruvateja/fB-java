package com.fixbridge.auth.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/** Frontend AuthUser camelCase shape (password never included). */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class UserDto {

  private Long id;
  private String role;
  private String name;
  private String email;
  @JsonProperty("isAdmin")
  private Boolean isAdmin;
  private String trade;
  private String licenseNumber;
  private String licenseExpiresAt;
  private String insuranceExpiresAt;
  private String complianceStatus;
  private Boolean dispatchEligible;
  private Boolean level1Eligible;
  private Boolean level2Eligible;
  private String overallComplianceStatus;
  private String licenseDocumentName;
  private String insuranceDocumentName;
  private String idDocumentName;
  private String photoDataUrl;
  private String phone;
  private String address;
  private Boolean addressVerified;
  private String postalCodePlus4;
  private String addressVerificationProvider;
  private String contactEmail;
  private String companyName;
  private String companyDetails;
  private String insuranceDetails;
  @JsonProperty("isBlocked")
  private Boolean isBlocked;
  @JsonProperty("isGoogleAccount")
  private Boolean isGoogleAccount;
  @JsonProperty("isAppleAccount")
  private Boolean isAppleAccount;
  @JsonProperty("isAuth0Account")
  private Boolean isAuth0Account;
  private String planCode;
  private List<String> serviceZips;
  private Integer travelRadiusMiles;
  private Double visitFee;
  private Double emergencyVisitFee;
  private Double afterHoursFee;
  private Double weekendFee;
  private Double cancellationFee;
  private Double minimumLaborFee;
  private Boolean freeEstimate;
  private Boolean visitAppliesToRepair;
  private String gender;
  private String dob;
  private String referralCode;
  private String referredByCode;
  private String adminAccessLevel;
  private String adminRolePreset;
  private List<String> permissions;
  private String stripeAccountId;
  private String stripeOnboardingStatus;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public Boolean getIsAdmin() {
    return isAdmin;
  }

  public void setIsAdmin(Boolean isAdmin) {
    this.isAdmin = isAdmin;
  }

  public String getTrade() {
    return trade;
  }

  public void setTrade(String trade) {
    this.trade = trade;
  }

  public String getLicenseNumber() {
    return licenseNumber;
  }

  public void setLicenseNumber(String licenseNumber) {
    this.licenseNumber = licenseNumber;
  }

  public String getLicenseExpiresAt() {
    return licenseExpiresAt;
  }

  public void setLicenseExpiresAt(String licenseExpiresAt) {
    this.licenseExpiresAt = licenseExpiresAt;
  }

  public String getInsuranceExpiresAt() {
    return insuranceExpiresAt;
  }

  public void setInsuranceExpiresAt(String insuranceExpiresAt) {
    this.insuranceExpiresAt = insuranceExpiresAt;
  }

  public String getComplianceStatus() {
    return complianceStatus;
  }

  public void setComplianceStatus(String complianceStatus) {
    this.complianceStatus = complianceStatus;
  }

  public Boolean getDispatchEligible() {
    return dispatchEligible;
  }

  public void setDispatchEligible(Boolean dispatchEligible) {
    this.dispatchEligible = dispatchEligible;
  }

  public Boolean getLevel1Eligible() {
    return level1Eligible;
  }

  public void setLevel1Eligible(Boolean level1Eligible) {
    this.level1Eligible = level1Eligible;
  }

  public Boolean getLevel2Eligible() {
    return level2Eligible;
  }

  public void setLevel2Eligible(Boolean level2Eligible) {
    this.level2Eligible = level2Eligible;
  }

  public String getOverallComplianceStatus() {
    return overallComplianceStatus;
  }

  public void setOverallComplianceStatus(String overallComplianceStatus) {
    this.overallComplianceStatus = overallComplianceStatus;
  }

  public String getLicenseDocumentName() {
    return licenseDocumentName;
  }

  public void setLicenseDocumentName(String licenseDocumentName) {
    this.licenseDocumentName = licenseDocumentName;
  }

  public String getInsuranceDocumentName() {
    return insuranceDocumentName;
  }

  public void setInsuranceDocumentName(String insuranceDocumentName) {
    this.insuranceDocumentName = insuranceDocumentName;
  }

  public String getIdDocumentName() {
    return idDocumentName;
  }

  public void setIdDocumentName(String idDocumentName) {
    this.idDocumentName = idDocumentName;
  }

  public String getPhotoDataUrl() {
    return photoDataUrl;
  }

  public void setPhotoDataUrl(String photoDataUrl) {
    this.photoDataUrl = photoDataUrl;
  }

  public String getPhone() {
    return phone;
  }

  public void setPhone(String phone) {
    this.phone = phone;
  }

  public String getAddress() {
    return address;
  }

  public void setAddress(String address) {
    this.address = address;
  }

  public Boolean getAddressVerified() {
    return addressVerified;
  }

  public void setAddressVerified(Boolean addressVerified) {
    this.addressVerified = addressVerified;
  }

  public String getPostalCodePlus4() {
    return postalCodePlus4;
  }

  public void setPostalCodePlus4(String postalCodePlus4) {
    this.postalCodePlus4 = postalCodePlus4;
  }

  public String getAddressVerificationProvider() {
    return addressVerificationProvider;
  }

  public void setAddressVerificationProvider(String addressVerificationProvider) {
    this.addressVerificationProvider = addressVerificationProvider;
  }

  public String getContactEmail() {
    return contactEmail;
  }

  public void setContactEmail(String contactEmail) {
    this.contactEmail = contactEmail;
  }

  public String getCompanyName() {
    return companyName;
  }

  public void setCompanyName(String companyName) {
    this.companyName = companyName;
  }

  public String getCompanyDetails() {
    return companyDetails;
  }

  public void setCompanyDetails(String companyDetails) {
    this.companyDetails = companyDetails;
  }

  public String getInsuranceDetails() {
    return insuranceDetails;
  }

  public void setInsuranceDetails(String insuranceDetails) {
    this.insuranceDetails = insuranceDetails;
  }

  public Boolean getIsBlocked() {
    return isBlocked;
  }

  public void setIsBlocked(Boolean isBlocked) {
    this.isBlocked = isBlocked;
  }

  public Boolean getIsGoogleAccount() {
    return isGoogleAccount;
  }

  public void setIsGoogleAccount(Boolean isGoogleAccount) {
    this.isGoogleAccount = isGoogleAccount;
  }

  public Boolean getIsAppleAccount() {
    return isAppleAccount;
  }

  public void setIsAppleAccount(Boolean isAppleAccount) {
    this.isAppleAccount = isAppleAccount;
  }

  public Boolean getIsAuth0Account() {
    return isAuth0Account;
  }

  public void setIsAuth0Account(Boolean isAuth0Account) {
    this.isAuth0Account = isAuth0Account;
  }

  public String getPlanCode() {
    return planCode;
  }

  public void setPlanCode(String planCode) {
    this.planCode = planCode;
  }

  public List<String> getServiceZips() {
    return serviceZips;
  }

  public void setServiceZips(List<String> serviceZips) {
    this.serviceZips = serviceZips;
  }

  public Integer getTravelRadiusMiles() {
    return travelRadiusMiles;
  }

  public void setTravelRadiusMiles(Integer travelRadiusMiles) {
    this.travelRadiusMiles = travelRadiusMiles;
  }

  public Double getVisitFee() {
    return visitFee;
  }

  public void setVisitFee(Double visitFee) {
    this.visitFee = visitFee;
  }

  public Double getEmergencyVisitFee() {
    return emergencyVisitFee;
  }

  public void setEmergencyVisitFee(Double emergencyVisitFee) {
    this.emergencyVisitFee = emergencyVisitFee;
  }

  public Double getAfterHoursFee() {
    return afterHoursFee;
  }

  public void setAfterHoursFee(Double afterHoursFee) {
    this.afterHoursFee = afterHoursFee;
  }

  public Double getWeekendFee() {
    return weekendFee;
  }

  public void setWeekendFee(Double weekendFee) {
    this.weekendFee = weekendFee;
  }

  public Double getCancellationFee() {
    return cancellationFee;
  }

  public void setCancellationFee(Double cancellationFee) {
    this.cancellationFee = cancellationFee;
  }

  public Double getMinimumLaborFee() {
    return minimumLaborFee;
  }

  public void setMinimumLaborFee(Double minimumLaborFee) {
    this.minimumLaborFee = minimumLaborFee;
  }

  public Boolean getFreeEstimate() {
    return freeEstimate;
  }

  public void setFreeEstimate(Boolean freeEstimate) {
    this.freeEstimate = freeEstimate;
  }

  public Boolean getVisitAppliesToRepair() {
    return visitAppliesToRepair;
  }

  public void setVisitAppliesToRepair(Boolean visitAppliesToRepair) {
    this.visitAppliesToRepair = visitAppliesToRepair;
  }

  public String getGender() {
    return gender;
  }

  public void setGender(String gender) {
    this.gender = gender;
  }

  public String getDob() {
    return dob;
  }

  public void setDob(String dob) {
    this.dob = dob;
  }

  public String getReferralCode() {
    return referralCode;
  }

  public void setReferralCode(String referralCode) {
    this.referralCode = referralCode;
  }

  public String getReferredByCode() {
    return referredByCode;
  }

  public void setReferredByCode(String referredByCode) {
    this.referredByCode = referredByCode;
  }

  public String getAdminAccessLevel() {
    return adminAccessLevel;
  }

  public void setAdminAccessLevel(String adminAccessLevel) {
    this.adminAccessLevel = adminAccessLevel;
  }

  public String getAdminRolePreset() {
    return adminRolePreset;
  }

  public void setAdminRolePreset(String adminRolePreset) {
    this.adminRolePreset = adminRolePreset;
  }

  public List<String> getPermissions() {
    return permissions;
  }

  public void setPermissions(List<String> permissions) {
    this.permissions = permissions;
  }

  public String getStripeAccountId() {
    return stripeAccountId;
  }

  public void setStripeAccountId(String stripeAccountId) {
    this.stripeAccountId = stripeAccountId;
  }

  public String getStripeOnboardingStatus() {
    return stripeOnboardingStatus;
  }

  public void setStripeOnboardingStatus(String stripeOnboardingStatus) {
    this.stripeOnboardingStatus = stripeOnboardingStatus;
  }
}
