package com.fixbridge.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "users", uniqueConstraints = @UniqueConstraint(columnNames = {"role", "email"}))
public class UserEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private String role;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false)
  private String email;

  @Column(nullable = false)
  private String password;

  private String trade;

  @Column(name = "license_number")
  private String licenseNumber;

  @Column(name = "license_document_name")
  private String licenseDocumentName;

  @Column(name = "insurance_document_name")
  private String insuranceDocumentName;

  @Column(name = "id_document_name")
  private String idDocumentName;

  @Column(name = "license_document_data", columnDefinition = "TEXT")
  private String licenseDocumentData;

  @Column(name = "insurance_document_data", columnDefinition = "TEXT")
  private String insuranceDocumentData;

  @Column(name = "id_document_data", columnDefinition = "TEXT")
  private String idDocumentData;

  @Column(name = "w9_document_name")
  private String w9DocumentName;

  @Column(name = "w9_document_data", columnDefinition = "TEXT")
  private String w9DocumentData;

  @Column(name = "business_registration_name")
  private String businessRegistrationName;

  @Column(name = "business_registration_data", columnDefinition = "TEXT")
  private String businessRegistrationData;

  @Column(name = "business_license_name")
  private String businessLicenseName;

  @Column(name = "business_license_data", columnDefinition = "TEXT")
  private String businessLicenseData;

  @Column(name = "diversity_document_name")
  private String diversityDocumentName;

  @Column(name = "diversity_document_data", columnDefinition = "TEXT")
  private String diversityDocumentData;

  @Column(name = "contractor_application", columnDefinition = "TEXT")
  private String contractorApplication;

  @Column(name = "is_admin", nullable = false)
  private boolean isAdmin = false;

  @Column(name = "is_blocked", nullable = false)
  private boolean isBlocked = false;

  @Column(name = "compliance_status")
  private String complianceStatus;

  @Column(name = "photo_data_url", columnDefinition = "TEXT")
  private String photoDataUrl;

  private String phone;
  private String address;

  @Column(name = "address_verified")
  private Boolean addressVerified = false;

  @Column(name = "address_verified_at")
  private OffsetDateTime addressVerifiedAt;

  @Column(name = "address_verification_provider")
  private String addressVerificationProvider;

  @Column(name = "postal_code_plus4")
  private String postalCodePlus4;

  @Column(name = "contact_email")
  private String contactEmail;

  @Column(name = "company_name")
  private String companyName;

  @Column(name = "company_details", columnDefinition = "TEXT")
  private String companyDetails;

  @Column(name = "insurance_details", columnDefinition = "TEXT")
  private String insuranceDetails;

  @Column(name = "stripe_account_id")
  private String stripeAccountId;

  @Column(name = "stripe_onboarding_status")
  private String stripeOnboardingStatus;

  @Column(name = "stripe_payouts_enabled")
  private Boolean stripePayoutsEnabled = false;

  @Column(name = "mfa_enabled")
  private Boolean mfaEnabled = false;

  @Column(name = "plan_code")
  private String planCode;

  @Column(name = "oauth_google_sub")
  private String oauthGoogleSub;

  @Column(name = "oauth_apple_sub")
  private String oauthAppleSub;

  @Column(name = "oauth_auth0_sub")
  private String oauthAuth0Sub;

  @Column(name = "google_avatar_url")
  private String googleAvatarUrl;

  @Column(name = "signup_method")
  private String signupMethod = "email";

  @Column(name = "referral_code")
  private String referralCode;

  @Column(name = "referred_by_code")
  private String referredByCode;

  @Column(name = "admin_access_level")
  private String adminAccessLevel = "read-write";

  @Column(name = "admin_role_preset")
  private String adminRolePreset;

  @Column(name = "dispatch_eligible")
  private Boolean dispatchEligible = false;

  @Column(name = "level1_eligible")
  private Boolean level1Eligible = false;

  @Column(name = "level2_eligible")
  private Boolean level2Eligible = false;

  @Column(name = "overall_compliance_status")
  private String overallComplianceStatus;

  @Column(name = "license_expires_at")
  private LocalDate licenseExpiresAt;

  @Column(name = "insurance_expires_at")
  private LocalDate insuranceExpiresAt;

  @Column(name = "service_zips", columnDefinition = "TEXT")
  private String serviceZips;

  @Column(name = "travel_radius_miles")
  private Integer travelRadiusMiles;

  @Column(name = "visit_fee")
  private BigDecimal visitFee;

  @Column(name = "emergency_visit_fee")
  private BigDecimal emergencyVisitFee;

  @Column(name = "after_hours_fee")
  private BigDecimal afterHoursFee;

  @Column(name = "weekend_fee")
  private BigDecimal weekendFee;

  @Column(name = "cancellation_fee")
  private BigDecimal cancellationFee;

  @Column(name = "minimum_labor_fee")
  private BigDecimal minimumLaborFee;

  @Column(name = "free_estimate")
  private Boolean freeEstimate = false;

  @Column(name = "visit_applies_to_repair")
  private Boolean visitAppliesToRepair = false;

  private String gender;
  private String dob;

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

  public String getPassword() {
    return password;
  }

  public void setPassword(String password) {
    this.password = password;
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

  public String getLicenseDocumentData() {
    return licenseDocumentData;
  }

  public void setLicenseDocumentData(String licenseDocumentData) {
    this.licenseDocumentData = licenseDocumentData;
  }

  public String getInsuranceDocumentData() {
    return insuranceDocumentData;
  }

  public void setInsuranceDocumentData(String insuranceDocumentData) {
    this.insuranceDocumentData = insuranceDocumentData;
  }

  public String getIdDocumentData() {
    return idDocumentData;
  }

  public void setIdDocumentData(String idDocumentData) {
    this.idDocumentData = idDocumentData;
  }

  public String getW9DocumentName() {
    return w9DocumentName;
  }

  public void setW9DocumentName(String w9DocumentName) {
    this.w9DocumentName = w9DocumentName;
  }

  public String getW9DocumentData() {
    return w9DocumentData;
  }

  public void setW9DocumentData(String w9DocumentData) {
    this.w9DocumentData = w9DocumentData;
  }

  public String getBusinessRegistrationName() {
    return businessRegistrationName;
  }

  public void setBusinessRegistrationName(String businessRegistrationName) {
    this.businessRegistrationName = businessRegistrationName;
  }

  public String getBusinessRegistrationData() {
    return businessRegistrationData;
  }

  public void setBusinessRegistrationData(String businessRegistrationData) {
    this.businessRegistrationData = businessRegistrationData;
  }

  public String getBusinessLicenseName() {
    return businessLicenseName;
  }

  public void setBusinessLicenseName(String businessLicenseName) {
    this.businessLicenseName = businessLicenseName;
  }

  public String getBusinessLicenseData() {
    return businessLicenseData;
  }

  public void setBusinessLicenseData(String businessLicenseData) {
    this.businessLicenseData = businessLicenseData;
  }

  public String getDiversityDocumentName() {
    return diversityDocumentName;
  }

  public void setDiversityDocumentName(String diversityDocumentName) {
    this.diversityDocumentName = diversityDocumentName;
  }

  public String getDiversityDocumentData() {
    return diversityDocumentData;
  }

  public void setDiversityDocumentData(String diversityDocumentData) {
    this.diversityDocumentData = diversityDocumentData;
  }

  public String getContractorApplication() {
    return contractorApplication;
  }

  public void setContractorApplication(String contractorApplication) {
    this.contractorApplication = contractorApplication;
  }

  public boolean isAdmin() {
    return isAdmin;
  }

  public void setAdmin(boolean admin) {
    isAdmin = admin;
  }

  public boolean isBlocked() {
    return isBlocked;
  }

  public void setBlocked(boolean blocked) {
    isBlocked = blocked;
  }

  public String getComplianceStatus() {
    return complianceStatus;
  }

  public void setComplianceStatus(String complianceStatus) {
    this.complianceStatus = complianceStatus;
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

  public String getPostalCodePlus4() {
    return postalCodePlus4;
  }

  public void setPostalCodePlus4(String postalCodePlus4) {
    this.postalCodePlus4 = postalCodePlus4;
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

  public Boolean getStripePayoutsEnabled() {
    return stripePayoutsEnabled;
  }

  public void setStripePayoutsEnabled(Boolean stripePayoutsEnabled) {
    this.stripePayoutsEnabled = stripePayoutsEnabled;
  }

  public Boolean getMfaEnabled() {
    return mfaEnabled;
  }

  public void setMfaEnabled(Boolean mfaEnabled) {
    this.mfaEnabled = mfaEnabled;
  }

  public String getPlanCode() {
    return planCode;
  }

  public void setPlanCode(String planCode) {
    this.planCode = planCode;
  }

  public String getOauthGoogleSub() {
    return oauthGoogleSub;
  }

  public void setOauthGoogleSub(String oauthGoogleSub) {
    this.oauthGoogleSub = oauthGoogleSub;
  }

  public String getOauthAppleSub() {
    return oauthAppleSub;
  }

  public void setOauthAppleSub(String oauthAppleSub) {
    this.oauthAppleSub = oauthAppleSub;
  }

  public String getOauthAuth0Sub() {
    return oauthAuth0Sub;
  }

  public void setOauthAuth0Sub(String oauthAuth0Sub) {
    this.oauthAuth0Sub = oauthAuth0Sub;
  }

  public String getGoogleAvatarUrl() {
    return googleAvatarUrl;
  }

  public void setGoogleAvatarUrl(String googleAvatarUrl) {
    this.googleAvatarUrl = googleAvatarUrl;
  }

  public String getSignupMethod() {
    return signupMethod;
  }

  public void setSignupMethod(String signupMethod) {
    this.signupMethod = signupMethod;
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

  public LocalDate getLicenseExpiresAt() {
    return licenseExpiresAt;
  }

  public void setLicenseExpiresAt(LocalDate licenseExpiresAt) {
    this.licenseExpiresAt = licenseExpiresAt;
  }

  public LocalDate getInsuranceExpiresAt() {
    return insuranceExpiresAt;
  }

  public void setInsuranceExpiresAt(LocalDate insuranceExpiresAt) {
    this.insuranceExpiresAt = insuranceExpiresAt;
  }

  public String getServiceZips() {
    return serviceZips;
  }

  public void setServiceZips(String serviceZips) {
    this.serviceZips = serviceZips;
  }

  public Integer getTravelRadiusMiles() {
    return travelRadiusMiles;
  }

  public void setTravelRadiusMiles(Integer travelRadiusMiles) {
    this.travelRadiusMiles = travelRadiusMiles;
  }

  public BigDecimal getVisitFee() {
    return visitFee;
  }

  public void setVisitFee(BigDecimal visitFee) {
    this.visitFee = visitFee;
  }

  public BigDecimal getEmergencyVisitFee() {
    return emergencyVisitFee;
  }

  public void setEmergencyVisitFee(BigDecimal emergencyVisitFee) {
    this.emergencyVisitFee = emergencyVisitFee;
  }

  public BigDecimal getAfterHoursFee() {
    return afterHoursFee;
  }

  public void setAfterHoursFee(BigDecimal afterHoursFee) {
    this.afterHoursFee = afterHoursFee;
  }

  public BigDecimal getWeekendFee() {
    return weekendFee;
  }

  public void setWeekendFee(BigDecimal weekendFee) {
    this.weekendFee = weekendFee;
  }

  public BigDecimal getCancellationFee() {
    return cancellationFee;
  }

  public void setCancellationFee(BigDecimal cancellationFee) {
    this.cancellationFee = cancellationFee;
  }

  public BigDecimal getMinimumLaborFee() {
    return minimumLaborFee;
  }

  public void setMinimumLaborFee(BigDecimal minimumLaborFee) {
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
