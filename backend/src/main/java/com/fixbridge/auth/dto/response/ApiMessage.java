package com.fixbridge.auth.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiMessage {

  private boolean ok;
  private String message;
  private String code;

  public ApiMessage() {}

  public ApiMessage(boolean ok, String message) {
    this.ok = ok;
    this.message = message;
  }

  public static ApiMessage ok() {
    return new ApiMessage(true, null);
  }

  public static ApiMessage ok(String message) {
    return new ApiMessage(true, message);
  }

  public static ApiMessage fail(String message) {
    return new ApiMessage(false, message);
  }

  public static ApiMessage fail(String message, String code) {
    ApiMessage m = fail(message);
    m.code = code;
    return m;
  }

  public boolean isOk() {
    return ok;
  }

  public void setOk(boolean ok) {
    this.ok = ok;
  }

  public String getMessage() {
    return message;
  }

  public void setMessage(String message) {
    this.message = message;
  }

  public String getCode() {
    return code;
  }

  public void setCode(String code) {
    this.code = code;
  }
}
