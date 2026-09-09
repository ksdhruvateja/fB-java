package com.fixbridge.fixa.provider.common;

public record AiCompletionResult(
    boolean ok, String text, String model, int status, String code) {

  public static AiCompletionResult failure(String model, int status, String code) {
    return new AiCompletionResult(false, "", model, status, code);
  }

  public static AiCompletionResult success(String text, String model) {
    return new AiCompletionResult(true, text == null ? "" : text, model, 200, "ok");
  }
}
