package com.fixbridge.admin.controller;

import com.fixbridge.admin.service.LegalConsentService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LegalConsentController {

  private final LegalConsentService legalConsentService;

  public LegalConsentController(LegalConsentService legalConsentService) {
    this.legalConsentService = legalConsentService;
  }

  @GetMapping("/api/legal/documents")
  public Map<String, Object> documents() {
    return legalConsentService.listDocuments();
  }

  @GetMapping("/api/homeowner/consent/status")
  public Map<String, Object> status() {
    return legalConsentService.consentStatus();
  }

  @PostMapping("/api/homeowner/consent/accept")
  public Map<String, Object> accept(
      @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
    return legalConsentService.accept(body != null ? body : Map.of(), request);
  }
}
