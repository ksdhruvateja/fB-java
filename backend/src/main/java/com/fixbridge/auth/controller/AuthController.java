package com.fixbridge.auth.controller;

import com.fixbridge.auth.dto.response.ApiMessage;
import com.fixbridge.auth.dto.response.AuthResponse;
import com.fixbridge.auth.dto.request.ForgotPasswordRequest;
import com.fixbridge.auth.dto.request.ProfileUpdateRequest;
import com.fixbridge.auth.dto.request.ResetPasswordRequest;
import com.fixbridge.auth.dto.request.SignInRequest;
import com.fixbridge.auth.dto.request.SignUpRequest;
import com.fixbridge.auth.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

  private final AuthService authService;

  public AuthController(AuthService authService) {
    this.authService = authService;
  }

  @PostMapping("/signin")
  public AuthResponse signIn(@Valid @RequestBody SignInRequest request) {
    return authService.signIn(request);
  }

  @PostMapping("/signup")
  public AuthResponse signUp(@Valid @RequestBody SignUpRequest request) {
    return authService.signUp(request);
  }

  @GetMapping("/me")
  public AuthResponse me() {
    return authService.me();
  }

  @PutMapping("/profile")
  public AuthResponse updateProfile(@RequestBody ProfileUpdateRequest request) {
    return authService.updateProfile(request);
  }

  @PostMapping("/forgot-password")
  public ApiMessage forgotPassword(@RequestBody(required = false) ForgotPasswordRequest request) {
    authService.forgotPassword(request != null ? request : new ForgotPasswordRequest());
    return ApiMessage.ok();
  }

  @PostMapping("/reset-password")
  public ResponseEntity<ApiMessage> resetPassword(@RequestBody ResetPasswordRequest request) {
    authService.resetPassword(request != null ? request : new ResetPasswordRequest());
    return ResponseEntity.ok(ApiMessage.ok());
  }
}
