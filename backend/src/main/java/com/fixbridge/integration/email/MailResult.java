package com.fixbridge.integration.email;

public record MailResult(boolean ok, boolean simulated, String messageId, String message) {

  public static MailResult sent(String messageId) {
    return new MailResult(true, false, messageId, null);
  }

  public static MailResult simulated(String message) {
    return new MailResult(true, true, null, message);
  }

  public static MailResult failed(String message) {
    return new MailResult(false, false, null, message);
  }

  public boolean delivered() {
    return ok && !simulated;
  }
}
