package com.fixbridge.auth.dto.request;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class GoogleAuthRequest {

  private String credential;
  private String idToken;
  private String role;
  private String intent;
  private String pendingSignupToken;
  private String phone;
  private String referredByCode;
  private Boolean marketingEmailOptIn;
  private Boolean marketingSmsOptIn;
  private Boolean agreeContractorAgreementV4;
  private Boolean acceptTerms;
  private Boolean acceptPrivacy;
  private Object consents;

  public String getCredential() {
    return credential;
  }

  public void setCredential(String credential) {
    this.credential = credential;
  }

  public String getIdToken() {
    return idToken;
  }

  public void setIdToken(String idToken) {
    this.idToken = idToken;
  }

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }

  public String getIntent() {
    return intent;
  }

  public void setIntent(String intent) {
    this.intent = intent;
  }

  public String getPendingSignupToken() {
    return pendingSignupToken;
  }

  public void setPendingSignupToken(String pendingSignupToken) {
    this.pendingSignupToken = pendingSignupToken;
  }

  public String getPhone() {
    return phone;
  }

  public void setPhone(String phone) {
    this.phone = phone;
  }

  public String getReferredByCode() {
    return referredByCode;
  }

  public void setReferredByCode(String referredByCode) {
    this.referredByCode = referredByCode;
  }

  public Boolean getMarketingEmailOptIn() {
    return marketingEmailOptIn;
  }

  public void setMarketingEmailOptIn(Boolean marketingEmailOptIn) {
    this.marketingEmailOptIn = marketingEmailOptIn;
  }

  public Boolean getMarketingSmsOptIn() {
    return marketingSmsOptIn;
  }

  public void setMarketingSmsOptIn(Boolean marketingSmsOptIn) {
    this.marketingSmsOptIn = marketingSmsOptIn;
  }

  public Boolean getAgreeContractorAgreementV4() {
    return agreeContractorAgreementV4;
  }

  public void setAgreeContractorAgreementV4(Boolean agreeContractorAgreementV4) {
    this.agreeContractorAgreementV4 = agreeContractorAgreementV4;
  }

  public Boolean getAcceptTerms() {
    return acceptTerms;
  }

  public void setAcceptTerms(Boolean acceptTerms) {
    this.acceptTerms = acceptTerms;
  }

  public Boolean getAcceptPrivacy() {
    return acceptPrivacy;
  }

  public void setAcceptPrivacy(Boolean acceptPrivacy) {
    this.acceptPrivacy = acceptPrivacy;
  }

  public Object getConsents() {
    return consents;
  }

  public void setConsents(Object consents) {
    this.consents = consents;
  }
}
