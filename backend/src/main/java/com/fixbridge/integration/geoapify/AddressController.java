package com.fixbridge.integration.geoapify;

import com.fixbridge.integration.geoapify.GeoapifyClient;
import com.fixbridge.common.util.AddressFormat;
import com.fixbridge.common.util.SimpleRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AddressController {

  private final GeoapifyClient geoapifyClient;
  private final SimpleRateLimiter addressLimiter = new SimpleRateLimiter(120, Duration.ofMinutes(15));

  public AddressController(GeoapifyClient geoapifyClient) {
    this.geoapifyClient = geoapifyClient;
  }

  @GetMapping("/api/address/status")
  public Map<String, Object> status() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("verificationProvider", null);
    body.put("autocompleteProvider", geoapifyClient.isConfigured() ? "geoapify" : null);
    body.put("autocompleteSupported", geoapifyClient.isConfigured());
    body.put("countryFilter", geoapifyClient.countryFilter());
    body.put(
        "note",
        "Address suggestions via Geoapify when configured. Manual entry always allowed.");
    return body;
  }

  @PostMapping("/api/address/validate")
  public ResponseEntity<Map<String, Object>> validate(
      @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
    if (!addressLimiter.tryAcquire(clientKey(request))) {
      return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(rateLimited());
    }
    Map<String, Object> result = AddressFormat.validateAddressFormat(body);
    if (Boolean.FALSE.equals(result.get("ok"))) {
      return ResponseEntity.badRequest().body(result);
    }
    return ResponseEntity.ok(result);
  }

  @GetMapping("/api/address/autocomplete")
  public ResponseEntity<Map<String, Object>> autocomplete(
      @RequestParam(value = "q", required = false) String q,
      @RequestParam(value = "text", required = false) String text,
      @RequestParam(value = "limit", required = false) Integer limit,
      HttpServletRequest request) {
    if (!addressLimiter.tryAcquire(clientKey(request))) {
      return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(rateLimited());
    }
    return ResponseEntity.ok(softAutocomplete(firstNonBlank(q, text), limit));
  }

  @GetMapping("/api/public/address/autocomplete")
  public ResponseEntity<Map<String, Object>> publicAutocomplete(
      @RequestParam(value = "q", required = false) String q,
      @RequestParam(value = "text", required = false) String text,
      @RequestParam(value = "limit", required = false) Integer limit,
      HttpServletRequest request) {
    if (!addressLimiter.tryAcquire(clientKey(request))) {
      return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(rateLimited());
    }
    return ResponseEntity.ok(softAutocomplete(firstNonBlank(q, text), limit));
  }

  @GetMapping("/api/address/suggestions")
  public ResponseEntity<Map<String, Object>> suggestions(
      @RequestParam(value = "q", required = false) String q,
      @RequestParam(value = "text", required = false) String text,
      @RequestParam(value = "zip", required = false) String zip,
      @RequestParam(value = "limit", required = false) Integer limit,
      HttpServletRequest request) {
    if (!addressLimiter.tryAcquire(clientKey(request))) {
      return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(rateLimited());
    }
    String query = firstNonBlank(q, text, zip);
    Map<String, Object> result = softAutocomplete(query, limit);
    result.put("zipHint", AddressFormat.zip5(zip));
    return ResponseEntity.ok(result);
  }

  @PostMapping("/api/address/verify")
  public ResponseEntity<Map<String, Object>> verifyRemoved() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", false);
    body.put("code", "ADDRESS_VERIFICATION_REMOVED");
    body.put(
        "message",
        "Address verification is not used. Use address suggestions or enter the address manually.");
    return ResponseEntity.status(HttpStatus.GONE).body(body);
  }

  @GetMapping("/api/address/city-state")
  public ResponseEntity<Map<String, Object>> cityStateRemoved() {
    return ResponseEntity.status(HttpStatus.GONE).body(lookupRemoved());
  }

  @GetMapping("/api/address/zip")
  public ResponseEntity<Map<String, Object>> zipRemoved() {
    return ResponseEntity.status(HttpStatus.GONE).body(lookupRemoved());
  }

  private Map<String, Object> softAutocomplete(String query, Integer limit) {
    Map<String, Object> result = geoapifyClient.autocomplete(query, limit);
    // Soft response: always 200-shaped payload for UI usability
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("configured", Boolean.TRUE.equals(result.get("configured")));
    body.put("suggestions", result.getOrDefault("suggestions", java.util.List.of()));
    if (Boolean.TRUE.equals(result.get("skipped"))) {
      body.put("skipped", true);
    }
    if (Boolean.FALSE.equals(result.get("ok"))) {
      body.put("unavailable", true);
      body.put("message", result.get("message"));
      body.put("code", result.get("code"));
    }
    return body;
  }

  private static Map<String, Object> rateLimited() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", false);
    body.put("message", "Too many address requests. Try again later.");
    return body;
  }

  private static Map<String, Object> lookupRemoved() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", false);
    body.put("code", "ADDRESS_LOOKUP_REMOVED");
    body.put("message", "Use address autocomplete or enter city/state/ZIP manually.");
    return body;
  }

  private static String clientKey(HttpServletRequest request) {
    String forwarded = request.getHeader("X-Forwarded-For");
    if (forwarded != null && !forwarded.isBlank()) {
      return forwarded.split(",")[0].trim();
    }
    String nf = request.getHeader("X-NF-Client-Connection-Ip");
    if (nf != null && !nf.isBlank()) {
      return nf.trim();
    }
    return request.getRemoteAddr() != null ? request.getRemoteAddr() : "unknown";
  }

  private static String firstNonBlank(String... values) {
    if (values == null) {
      return "";
    }
    for (String v : values) {
      if (v != null && !v.isBlank()) {
        return v.trim();
      }
    }
    return "";
  }
}
