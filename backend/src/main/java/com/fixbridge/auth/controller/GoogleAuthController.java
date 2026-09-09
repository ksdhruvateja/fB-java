package com.fixbridge.auth.controller;

import com.fixbridge.auth.dto.request.GoogleAuthRequest;
import com.fixbridge.auth.service.GoogleAuthService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class GoogleAuthController {

  private final GoogleAuthService googleAuthService;

  public GoogleAuthController(GoogleAuthService googleAuthService) {
    this.googleAuthService = googleAuthService;
  }

  @GetMapping("/google/config")
  public Map<String, Object> googleConfig() {
    return googleAuthService.publicConfig();
  }

  @PostMapping("/google")
  public ResponseEntity<Map<String, Object>> googleAuth(@RequestBody(required = false) GoogleAuthRequest request) {
    return googleAuthService.authenticate(request != null ? request : new GoogleAuthRequest());
  }

  @GetMapping("/google/linked")
  public Map<String, Object> googleLinked() {
    return googleAuthService.linkedStatus();
  }
}
