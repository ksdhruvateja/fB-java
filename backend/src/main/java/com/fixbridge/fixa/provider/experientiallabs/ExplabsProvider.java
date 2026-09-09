package com.fixbridge.fixa.provider.experientiallabs;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fixbridge.config.FixbridgeProperties;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

import com.fixbridge.fixa.provider.openai.OpenAiCompatibleProvider;
/**
 * Experiential Labs OpenAI-compatible provider.
 * Base URL / model match api/fixa/providers/explabs.js.
 */
@Component
public class ExplabsProvider extends OpenAiCompatibleProvider {

  public static final String MODEL = "gpt-6-astra";
  public static final String BASE_URL = "https://api.experientiallabs.ai/v1";

  private final FixbridgeProperties properties;

  public ExplabsProvider(FixbridgeProperties properties, ObjectMapper objectMapper) {
    super(objectMapper, properties.getAi().getFetchTimeoutMs());
    this.properties = properties;
  }

  @Override
  public String getId() {
    return "explabs";
  }

  @Override
  public String getName() {
    return "Experiential Labs";
  }

  @Override
  public Map<String, Object> status() {
    Map<String, Object> status = new LinkedHashMap<>(super.status());
    status.put("provider", "experiential-labs");
    return status;
  }

  @Override
  protected String baseUrl() {
    return BASE_URL;
  }

  @Override
  protected String model() {
    return MODEL;
  }

  @Override
  protected String logLabel() {
    return "fixa";
  }

  /** Normalize EXPLABS_API_KEY the same way as explabs.js readExplabsKey(). */
  @Override
  public String readApiKey() {
    String raw = properties.getAi().getExplabsApiKey();
    if (raw == null) {
      return "";
    }
    raw = raw.replace("\uFEFF", "").trim();
    if ((raw.startsWith("\"") && raw.endsWith("\"")) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.substring(1, raw.length() - 1).trim();
    }
    raw = raw.replaceFirst("(?i)^EXPLABS_API_KEY\\s*=\\s*", "").replaceFirst("(?i)^bearer\\s+", "").trim();
    if (raw.regionMatches(true, 0, "xpl_", 0, 4)) {
      raw = raw.replaceAll("\\s+", "");
      String body = raw.substring(4);
      if (body.matches("[0-9a-fA-F]{40}")) {
        raw = "xpl_" + body.toLowerCase();
      }
    }
    return raw;
  }
}
