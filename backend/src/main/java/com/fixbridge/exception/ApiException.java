package com.fixbridge.exception;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {

  private final HttpStatus status;
  private final String code;
  private final boolean authStyle;
  private final Map<String, Object> details;

  public ApiException(HttpStatus status, String message) {
    this(status, message, null, true, null);
  }

  public ApiException(HttpStatus status, String message, String code) {
    this(status, message, code, true, null);
  }

  public ApiException(HttpStatus status, String message, String code, boolean authStyle) {
    this(status, message, code, authStyle, null);
  }

  public ApiException(
      HttpStatus status, String message, String code, boolean authStyle, Map<String, Object> details) {
    super(message);
    this.status = status;
    this.code = code;
    this.authStyle = authStyle;
    this.details =
        details == null || details.isEmpty()
            ? Collections.emptyMap()
            : Collections.unmodifiableMap(new LinkedHashMap<>(details));
  }

  public HttpStatus getStatus() {
    return status;
  }

  public String getCode() {
    return code;
  }

  public boolean isAuthStyle() {
    return authStyle;
  }

  public Map<String, Object> getDetails() {
    return details;
  }
}
