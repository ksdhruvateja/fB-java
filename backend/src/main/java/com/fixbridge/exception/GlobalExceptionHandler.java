package com.fixbridge.exception;

import com.fixbridge.auth.dto.response.ApiMessage;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<?> handleApiException(ApiException ex, HttpServletRequest request) {
    if (ex.isAuthStyle()) {
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("ok", false);
      body.put("message", ex.getMessage());
      if (ex.getCode() != null) {
        body.put("code", ex.getCode());
      }
      if (ex.getDetails() != null && !ex.getDetails().isEmpty()) {
        body.putAll(ex.getDetails());
      }
      return ResponseEntity.status(ex.getStatus()).body(body);
    }
    return ResponseEntity.status(ex.getStatus()).body(structured(ex.getStatus(), ex.getMessage(), request));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ApiMessage> handleValidation(MethodArgumentNotValidException ex) {
    String message = "All fields are required.";
    FieldError fieldError = ex.getBindingResult().getFieldError();
    if (fieldError != null && fieldError.getDefaultMessage() != null) {
      message = fieldError.getDefaultMessage();
    }
    return ResponseEntity.badRequest().body(ApiMessage.fail(message));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ErrorResponse> handleGeneric(Exception ex, HttpServletRequest request) {
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(structured(HttpStatus.INTERNAL_SERVER_ERROR, "Server error. Please try again.", request));
  }

  private ErrorResponse structured(HttpStatus status, String message, HttpServletRequest request) {
    return new ErrorResponse(
        Instant.now(),
        status.value(),
        status.getReasonPhrase(),
        message,
        request.getRequestURI());
  }
}
