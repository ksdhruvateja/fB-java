package com.fixbridge.fixa.provider.common;

import java.util.List;
import java.util.Map;

public interface AiProvider {

  String getId();

  String getName();

  boolean isConfigured();

  Map<String, Object> status();

  /** OpenAI-compatible chat completion. */
  AiCompletionResult complete(List<Map<String, Object>> messages, double temperature, int maxTokens, boolean json);
}
