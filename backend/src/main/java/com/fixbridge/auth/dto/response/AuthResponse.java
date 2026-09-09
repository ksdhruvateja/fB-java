package com.fixbridge.auth.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class AuthResponse {

  private boolean ok;
  private String token;
  private UserDto user;
  private String message;
  private Boolean mfaRequired;
  private String code;

  public static AuthResponse success(String token, UserDto user) {
    AuthResponse r = new AuthResponse();
    r.ok = true;
    r.token = token;
    r.user = user;
    return r;
  }

  public static AuthResponse mfaPending(String token, UserDto user, String message) {
    AuthResponse r = new AuthResponse();
    r.ok = true;
    r.mfaRequired = true;
    r.token = token;
    r.user = user;
    r.message = message;
    return r;
  }

  public static AuthResponse failure(String message) {
    AuthResponse r = new AuthResponse();
    r.ok = false;
    r.message = message;
    return r;
  }

  public static AuthResponse failure(String message, String code) {
    AuthResponse r = failure(message);
    r.code = code;
    return r;
  }

  public boolean isOk() {
    return ok;
  }

  public void setOk(boolean ok) {
    this.ok = ok;
  }

  public String getToken() {
    return token;
  }

  public void setToken(String token) {
    this.token = token;
  }

  public UserDto getUser() {
    return user;
  }

  public void setUser(UserDto user) {
    this.user = user;
  }

  public String getMessage() {
    return message;
  }

  public void setMessage(String message) {
    this.message = message;
  }

  public Boolean getMfaRequired() {
    return mfaRequired;
  }

  public void setMfaRequired(Boolean mfaRequired) {
    this.mfaRequired = mfaRequired;
  }

  public String getCode() {
    return code;
  }

  public void setCode(String code) {
    this.code = code;
  }
}
