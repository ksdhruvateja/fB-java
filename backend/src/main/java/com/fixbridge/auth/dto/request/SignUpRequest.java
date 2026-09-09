package com.fixbridge.auth.dto.request;

import jakarta.validation.constraints.NotBlank;

/** Minimal homeowner signup payload (contractor fields optional for later expansion). */
public class SignUpRequest {

  @NotBlank
  private String role;

  @NotBlank
  private String name;

  @NotBlank
  private String email;

  @NotBlank
  private String password;

  private String phone;
  private String address;
  private String referredByCode;

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

  public String getReferredByCode() {
    return referredByCode;
  }

  public void setReferredByCode(String referredByCode) {
    this.referredByCode = referredByCode;
  }
}
