package com.fixbridge.integration.geoapify;

import com.fasterxml.jackson.databind.JsonNode;
import com.fixbridge.config.FixbridgeProperties;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Server-side Geoapify autocomplete proxy. Soft-fails with empty suggestions when unconfigured
 * or unavailable — never a mandatory verification gate.
 */
@Component
public class GeoapifyClient {

  private static final Logger log = LoggerFactory.getLogger(GeoapifyClient.class);
  private static final String AUTOCOMPLETE_URL = "https://api.geoapify.com/v1/geocode/autocomplete";
  private static final int DEFAULT_LIMIT = 6;
  private static final int MAX_LIMIT = 8;
  private static final Duration CACHE_TTL = Duration.ofMinutes(8);

  private final FixbridgeProperties properties;
  private final RestTemplate restTemplate;
  private final ConcurrentHashMap<String, CacheEntry> suggestionCache = new ConcurrentHashMap<>();

  public GeoapifyClient(FixbridgeProperties properties, RestTemplateBuilder restTemplateBuilder) {
    this.properties = properties;
    this.restTemplate =
        restTemplateBuilder
            .setConnectTimeout(Duration.ofSeconds(5))
            .setReadTimeout(Duration.ofSeconds(8))
            .build();
  }

  public boolean isConfigured() {
    return StringUtils.hasText(properties.getGeoapify().getApiKey());
  }

  public String countryFilter() {
    String filter = properties.getGeoapify().getCountryFilter();
    return StringUtils.hasText(filter) ? filter.trim() : "countrycode:us";
  }

  public Map<String, Object> autocomplete(String text, Integer limit) {
    String q = text == null ? "" : text.trim();
    if (q.length() < 3) {
      return result(true, isConfigured(), List.of(), true, false, null, null);
    }
    if (!isConfigured()) {
      return result(
          false,
          false,
          List.of(),
          false,
          true,
          "GEOAPIFY_NOT_CONFIGURED",
          "Address suggestions are temporarily unavailable. You can continue entering the address manually.");
    }

    int capped = Math.min(Math.max(limit == null ? DEFAULT_LIMIT : limit, 1), MAX_LIMIT);
    String filter = countryFilter();
    String key = filter + "|" + capped + "|" + q.toLowerCase(Locale.ROOT);
    CacheEntry cached = suggestionCache.get(key);
    if (cached != null && Instant.now().isBefore(cached.expiresAt())) {
      return cached.payload();
    }

    try {
      URI uri =
          UriComponentsBuilder.fromHttpUrl(AUTOCOMPLETE_URL)
              .queryParam("text", q)
              .queryParam("format", "json")
              .queryParam("limit", capped)
              .queryParam("filter", filter)
              .queryParam("lang", "en")
              .queryParam("apiKey", properties.getGeoapify().getApiKey().trim())
              .build(true)
              .toUri();

      ResponseEntity<JsonNode> response = restTemplate.getForEntity(uri, JsonNode.class);
      if (response.getStatusCode().value() == 429) {
        return unavailable("GEOAPIFY_RATE_LIMIT");
      }
      if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
        return unavailable("GEOAPIFY_ERROR");
      }

      List<Map<String, Object>> suggestions = mapResults(response.getBody(), capped);
      Map<String, Object> payload = result(true, true, suggestions, false, false, null, null);
      if (!suggestions.isEmpty()) {
        suggestionCache.put(key, new CacheEntry(payload, Instant.now().plus(CACHE_TTL)));
      }
      return payload;
    } catch (RestClientResponseException e) {
      if (e.getStatusCode() == HttpStatusCode.valueOf(429)) {
        return unavailable("GEOAPIFY_RATE_LIMIT");
      }
      log.warn("Geoapify autocomplete HTTP error: {}", e.getMessage());
      return unavailable("GEOAPIFY_ERROR");
    } catch (Exception e) {
      log.warn("Geoapify autocomplete unavailable: {}", e.getMessage());
      return unavailable("GEOAPIFY_UNAVAILABLE");
    }
  }

  private Map<String, Object> unavailable(String code) {
    return result(
        false,
        true,
        List.of(),
        false,
        true,
        code,
        "Address suggestions are temporarily unavailable. You can continue entering the address manually.");
  }

  private List<Map<String, Object>> mapResults(JsonNode data, int capped) {
    List<JsonNode> results = new ArrayList<>();
    if (data.has("results") && data.get("results").isArray()) {
      data.get("results").forEach(results::add);
    } else if (data.has("features") && data.get("features").isArray()) {
      for (JsonNode feature : data.get("features")) {
        JsonNode props = feature.path("properties");
        // Merge geometry lat/lon when present
        results.add(props);
      }
    }

    List<Map<String, Object>> suggestions = new ArrayList<>();
    for (JsonNode raw : results) {
      Map<String, Object> mapped = mapGeoapifyResult(raw);
      if (mapped.get("addressLine1") != null && StringUtils.hasText(String.valueOf(mapped.get("addressLine1")))) {
        suggestions.add(mapped);
      }
      if (suggestions.size() >= capped) {
        break;
      }
    }
    return suggestions;
  }

  static Map<String, Object> mapGeoapifyResult(JsonNode raw) {
    String houseNumber = text(raw, "housenumber");
    String street = text(raw, "street");
    String streetAddress = joinNonBlank(" ", houseNumber, street);
    String named = text(raw, "name");
    String providerLine1 = text(raw, "address_line1");
    boolean providerLineIsPlaceName =
        !StringUtils.hasText(providerLine1)
            || (StringUtils.hasText(named) && providerLine1.equals(named))
            || (StringUtils.hasText(houseNumber) && !providerLine1.contains(houseNumber));
    String addressLine1 =
        firstNonBlank(
            providerLineIsPlaceName && StringUtils.hasText(streetAddress) ? streetAddress : null,
            providerLine1,
            streetAddress,
            named,
            firstCsvPart(text(raw, "formatted")));

    String stateCode = text(raw, "state_code").toUpperCase(Locale.ROOT);
    String stateName = text(raw, "state");
    String state = stateCode.length() == 2 ? stateCode : stateName;

    String postcode = text(raw, "postcode");
    String zipDigits = postcode.replaceAll("\\D", "");
    String zip = zipDigits.length() >= 5 ? zipDigits.substring(0, 5) : postcode;
    String postalCodePlus4 = zipDigits.length() >= 9 ? zipDigits.substring(5, 9) : null;

    Double lat = number(raw, "lat");
    Double lon = number(raw, "lon");
    if (lat == null && raw.has("geometry")) {
      JsonNode coords = raw.path("geometry").path("coordinates");
      if (coords.isArray() && coords.size() >= 2) {
        lon = coords.get(0).asDouble();
        lat = coords.get(1).asDouble();
      }
    }

    String city =
        firstNonBlank(text(raw, "city"), text(raw, "town"), text(raw, "village"), text(raw, "county"));
    String displayState = stateCode.length() == 2 ? stateCode : stateName;

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("label", firstNonBlank(text(raw, "formatted"), addressLine1));
    out.put("primary", addressLine1);
    out.put("secondary", joinNonBlank(", ", city, displayState, zip));
    out.put("addressLine1", addressLine1);
    out.put("addressLine2", null);
    out.put("city", city);
    out.put("state", state);
    out.put("zip", zip);
    out.put("postalCodePlus4", postalCodePlus4);
    out.put(
        "country",
        firstNonBlank(text(raw, "country_code"), text(raw, "country"), "us").toLowerCase(Locale.ROOT));
    out.put("latitude", lat);
    out.put("longitude", lon);
    out.put("placeId", raw.has("place_id") && !raw.get("place_id").isNull() ? raw.get("place_id").asText() : null);
    out.put("resultType", raw.has("result_type") ? text(raw, "result_type") : null);
    return out;
  }

  private static Map<String, Object> result(
      boolean ok,
      boolean configured,
      List<Map<String, Object>> suggestions,
      boolean skipped,
      boolean unavailable,
      String code,
      String message) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", ok);
    body.put("configured", configured);
    body.put("suggestions", suggestions);
    if (skipped) {
      body.put("skipped", true);
    }
    if (unavailable || !ok) {
      body.put("unavailable", true);
    }
    if (code != null) {
      body.put("code", code);
    }
    if (message != null) {
      body.put("message", message);
    }
    return body;
  }

  private static String text(JsonNode node, String field) {
    JsonNode v = node.path(field);
    return v.isMissingNode() || v.isNull() ? "" : v.asText("").trim();
  }

  private static Double number(JsonNode node, String field) {
    JsonNode v = node.get(field);
    if (v == null || v.isNull() || !v.isNumber()) {
      return null;
    }
    return v.asDouble();
  }

  private static String firstNonBlank(String... values) {
    if (values == null) {
      return "";
    }
    for (String v : values) {
      if (StringUtils.hasText(v)) {
        return v.trim();
      }
    }
    return "";
  }

  private static String joinNonBlank(String sep, String... parts) {
    StringBuilder sb = new StringBuilder();
    for (String part : parts) {
      if (!StringUtils.hasText(part)) {
        continue;
      }
      if (sb.length() > 0) {
        sb.append(sep);
      }
      sb.append(part.trim());
    }
    return sb.toString();
  }

  private static String firstCsvPart(String formatted) {
    if (!StringUtils.hasText(formatted)) {
      return "";
    }
    int idx = formatted.indexOf(',');
    return idx >= 0 ? formatted.substring(0, idx).trim() : formatted.trim();
  }

  private record CacheEntry(Map<String, Object> payload, Instant expiresAt) {}
}
