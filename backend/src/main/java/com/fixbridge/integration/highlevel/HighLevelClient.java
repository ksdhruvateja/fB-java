package com.fixbridge.integration.highlevel;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * HighLevel CRM client. When HIGHLEVEL_API_KEY is unset, methods no-op with a debug log
 * (no fake CRM side effects).
 */
@Component
public class HighLevelClient {

  private static final Logger log = LoggerFactory.getLogger(HighLevelClient.class);
  private static final String DEFAULT_BASE = "https://services.leadconnectorhq.com";

  private final ObjectMapper objectMapper;
  private final HttpClient httpClient;
  private final String apiKey;
  private final String locationId;
  private final String baseUrl;

  public HighLevelClient(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
    this.httpClient =
        HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    this.apiKey = blankToEmpty(System.getenv("HIGHLEVEL_API_KEY"));
    this.locationId = blankToEmpty(System.getenv("HIGHLEVEL_LOCATION_ID"));
    String base = blankToEmpty(System.getenv("HIGHLEVEL_BASE_URL"));
    this.baseUrl = StringUtils.hasText(base) ? base.replaceAll("/$", "") : DEFAULT_BASE;
  }

  public boolean isConfigured() {
    return StringUtils.hasText(apiKey);
  }

  public Map<String, Object> upsertContact(Map<String, Object> contact) {
    if (!isConfigured()) {
      log.debug("[highlevel] upsertContact skipped (HIGHLEVEL_API_KEY unset)");
      return Map.of("ok", true, "skipped", true, "reason", "not_configured");
    }
    try {
      Map<String, Object> payload = new LinkedHashMap<>(contact == null ? Map.of() : contact);
      if (StringUtils.hasText(locationId) && !payload.containsKey("locationId")) {
        payload.put("locationId", locationId);
      }
      return postJson("/contacts/upsert", payload);
    } catch (Exception e) {
      log.warn("[highlevel] upsertContact failed: {}", e.getMessage());
      return Map.of("ok", false, "error", e.getMessage());
    }
  }

  public Map<String, Object> trackEvent(String eventName, Map<String, Object> properties) {
    if (!isConfigured()) {
      log.debug("[highlevel] trackEvent '{}' skipped (HIGHLEVEL_API_KEY unset)", eventName);
      return Map.of("ok", true, "skipped", true, "reason", "not_configured");
    }
    try {
      Map<String, Object> payload = new LinkedHashMap<>();
      payload.put("event", eventName);
      payload.put("properties", properties == null ? Map.of() : properties);
      if (StringUtils.hasText(locationId)) {
        payload.put("locationId", locationId);
      }
      return postJson("/contacts/events", payload);
    } catch (Exception e) {
      log.warn("[highlevel] trackEvent failed: {}", e.getMessage());
      return Map.of("ok", false, "error", e.getMessage());
    }
  }

  private Map<String, Object> postJson(String path, Map<String, Object> body) throws Exception {
    String json = objectMapper.writeValueAsString(body);
    HttpRequest request =
        HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + path))
            .timeout(Duration.ofSeconds(20))
            .header("Authorization", "Bearer " + apiKey)
            .header("Content-Type", "application/json")
            .header("Version", "2021-07-28")
            .POST(HttpRequest.BodyPublishers.ofString(json))
            .build();
    HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("ok", response.statusCode() >= 200 && response.statusCode() < 300);
    result.put("status", response.statusCode());
    result.put("body", response.body());
    return result;
  }

  private static String blankToEmpty(String value) {
    return value == null ? "" : value.trim();
  }
}
