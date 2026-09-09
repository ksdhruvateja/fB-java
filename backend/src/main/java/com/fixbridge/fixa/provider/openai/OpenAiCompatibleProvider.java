package com.fixbridge.fixa.provider.openai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fixbridge.fixa.provider.common.AiCompletionResult;
import com.fixbridge.fixa.provider.common.AiProvider;
/** Shared OpenAI-compatible chat/completions HTTP client. */
public abstract class OpenAiCompatibleProvider implements AiProvider {

  private static final Logger log = LoggerFactory.getLogger(OpenAiCompatibleProvider.class);

  private final ObjectMapper objectMapper;
  private final HttpClient httpClient;
  private final long fetchTimeoutMs;

  protected OpenAiCompatibleProvider(ObjectMapper objectMapper, long fetchTimeoutMs) {
    this.objectMapper = objectMapper;
    this.fetchTimeoutMs = Math.max(5_000L, fetchTimeoutMs);
    this.httpClient =
        HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
  }

  protected abstract String baseUrl();

  protected abstract String model();

  protected abstract String readApiKey();

  protected abstract String logLabel();

  @Override
  public boolean isConfigured() {
    return !readApiKey().isBlank();
  }

  @Override
  public Map<String, Object> status() {
    Map<String, Object> status = new LinkedHashMap<>();
    status.put("id", getId());
    status.put("name", getName());
    status.put("configured", isConfigured());
    status.put("model", model());
    return status;
  }

  @Override
  public AiCompletionResult complete(
      List<Map<String, Object>> messages, double temperature, int maxTokens, boolean json) {
    String apiKey = readApiKey();
    if (apiKey.isBlank()) {
      log.error("[{}] provider is not connected", logLabel());
      return AiCompletionResult.failure(model(), 0, "not_connected");
    }
    try {
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("model", model());
      body.put("temperature", temperature);
      body.put("max_tokens", maxTokens);
      body.put("messages", messages == null ? List.of() : messages);
      if (json) {
        body.put("response_format", Map.of("type", "json_object"));
      }

      HttpRequest request =
          HttpRequest.newBuilder()
              .uri(URI.create(baseUrl().replaceAll("/$", "") + "/chat/completions"))
              .timeout(Duration.ofMillis(fetchTimeoutMs))
              .header("Authorization", "Bearer " + apiKey)
              .header("Content-Type", "application/json")
              .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
              .build();

      HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
      int status = response.statusCode();
      if (status < 200 || status >= 300) {
        String code = publicError(status);
        log.error("[{}] request failed status={} code={}", logLabel(), status, code);
        return AiCompletionResult.failure(model(), status, code);
      }

      JsonNode root = objectMapper.readTree(response.body());
      String text = extractContent(root.path("choices"));
      String model = root.path("model").asText(model());
      return AiCompletionResult.success(text, model);
    } catch (InterruptedException ie) {
      Thread.currentThread().interrupt();
      return AiCompletionResult.failure(model(), 0, "provider_unavailable");
    } catch (Exception e) {
      log.error("[{}] request failed: {}", logLabel(), e.getMessage());
      return AiCompletionResult.failure(model(), 0, "provider_unavailable");
    }
  }

  private String extractContent(JsonNode choices) {
    if (!choices.isArray() || choices.isEmpty()) {
      return "";
    }
    JsonNode content = choices.get(0).path("message").path("content");
    if (content.isTextual()) {
      return content.asText();
    }
    if (content.isArray()) {
      List<String> parts = new ArrayList<>();
      for (JsonNode part : content) {
        if (part.isTextual()) {
          parts.add(part.asText());
        } else if (part.has("text")) {
          parts.add(part.path("text").asText(""));
        }
      }
      return String.join("\n", parts);
    }
    return "";
  }

  private static String publicError(int status) {
    if (status == 401 || status == 403) {
      return "provider_rejected";
    }
    if (status == 429) {
      return "provider_busy";
    }
    if (status > 0) {
      return "provider_http_" + status;
    }
    return "provider_unavailable";
  }
}
