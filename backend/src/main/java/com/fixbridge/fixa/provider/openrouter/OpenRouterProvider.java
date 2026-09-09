package com.fixbridge.fixa.provider.openrouter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fixbridge.config.FixbridgeProperties;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.fixbridge.fixa.provider.openai.OpenAiCompatibleProvider;
/**
 * OpenRouter OpenAI-compatible stub. Uses OPENROUTER_API_KEY / fixbridge.ai.openrouter-api-key when set.
 */
@Component
public class OpenRouterProvider extends OpenAiCompatibleProvider {

  public static final String BASE_URL = "https://openrouter.ai/api/v1";
  public static final String DEFAULT_MODEL = "openai/gpt-4o-mini";

  private final FixbridgeProperties properties;

  public OpenRouterProvider(FixbridgeProperties properties, ObjectMapper objectMapper) {
    super(objectMapper, properties.getAi().getFetchTimeoutMs());
    this.properties = properties;
  }

  @Override
  public String getId() {
    return "openrouter";
  }

  @Override
  public String getName() {
    return "OpenRouter";
  }

  @Override
  public Map<String, Object> status() {
    Map<String, Object> status = new LinkedHashMap<>(super.status());
    status.put("provider", "openrouter");
    return status;
  }

  @Override
  protected String baseUrl() {
    String override = properties.getAi().getOpenrouterBaseUrl();
    return StringUtils.hasText(override) ? override : BASE_URL;
  }

  @Override
  protected String model() {
    String model = properties.getAi().getOpenrouterModel();
    return StringUtils.hasText(model) ? model : DEFAULT_MODEL;
  }

  @Override
  protected String logLabel() {
    return "openrouter";
  }

  @Override
  public String readApiKey() {
    String fromProps = properties.getAi().getOpenrouterApiKey();
    if (StringUtils.hasText(fromProps)) {
      return fromProps.trim();
    }
    String env = System.getenv("OPENROUTER_API_KEY");
    return env == null ? "" : env.trim();
  }
}
