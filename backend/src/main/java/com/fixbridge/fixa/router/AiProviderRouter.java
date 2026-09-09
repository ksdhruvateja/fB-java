package com.fixbridge.fixa.router;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.fixbridge.fixa.provider.common.AiCompletionResult;
import com.fixbridge.fixa.provider.common.AiProvider;
import com.fixbridge.fixa.provider.experientiallabs.ExplabsProvider;
import com.fixbridge.fixa.provider.openrouter.OpenRouterProvider;
/** Picks Explabs by default; falls back to OpenRouter when Explabs is not configured. */
@Component
public class AiProviderRouter implements AiProvider {

  private static final Logger log = LoggerFactory.getLogger(AiProviderRouter.class);

  private final ExplabsProvider explabsProvider;
  private final OpenRouterProvider openRouterProvider;

  public AiProviderRouter(ExplabsProvider explabsProvider, OpenRouterProvider openRouterProvider) {
    this.explabsProvider = explabsProvider;
    this.openRouterProvider = openRouterProvider;
  }

  public AiProvider resolve() {
    if (explabsProvider.isConfigured()) {
      return explabsProvider;
    }
    if (openRouterProvider.isConfigured()) {
      log.debug("[fixa] Explabs not configured; using OpenRouter fallback");
      return openRouterProvider;
    }
    return explabsProvider;
  }

  @Override
  public String getId() {
    return resolve().getId();
  }

  @Override
  public String getName() {
    return resolve().getName();
  }

  @Override
  public boolean isConfigured() {
    return explabsProvider.isConfigured() || openRouterProvider.isConfigured();
  }

  @Override
  public Map<String, Object> status() {
    Map<String, Object> status = new LinkedHashMap<>();
    status.put("active", resolve().getId());
    status.put("configured", isConfigured());
    status.put("providers", List.of(explabsProvider.status(), openRouterProvider.status()));
    return status;
  }

  @Override
  public AiCompletionResult complete(
      List<Map<String, Object>> messages, double temperature, int maxTokens, boolean json) {
    return resolve().complete(messages, temperature, maxTokens, json);
  }
}
