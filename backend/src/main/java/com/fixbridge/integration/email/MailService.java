package com.fixbridge.integration.email;

import com.fixbridge.config.FixbridgeProperties;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.mail.MailProperties;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * Gmail SMTP mailer matching Express {@code api/mail.js} behavior.
 * When {@code DISABLE_OUTBOUND_EMAIL} / {@code fixbridge.mail.disabled} is set,
 * messages are logged and marked simulated (no SMTP).
 */
@Service
public class MailService {

  private static final Logger log = LoggerFactory.getLogger(MailService.class);

  private final FixbridgeProperties properties;
  private final MailProperties springMail;
  private final JavaMailSender mailSender;

  public MailService(
      FixbridgeProperties properties,
      MailProperties springMail,
      @Autowired(required = false) JavaMailSender mailSender) {
    this.properties = properties;
    this.springMail = springMail;
    this.mailSender = mailSender;
  }

  public boolean isOutboundDisabled() {
    return properties.getMail().isDisabled();
  }

  public boolean isConfigured() {
    return mailSender != null
        && StringUtils.hasText(springMail.getUsername())
        && StringUtils.hasText(springMail.getPassword());
  }

  public MailResult send(String to, String subject, String html, String text) {
    String recipient = to == null ? "" : to.trim();
    if (!StringUtils.hasText(recipient)) {
      return MailResult.failed("Missing recipient.");
    }

    if (isOutboundDisabled()) {
      log.info("[Gmail disabled] DISABLE_OUTBOUND_EMAIL=true — not sending to={} subject={}",
          recipient, subject);
      if (StringUtils.hasText(text)) {
        log.info("[Gmail disabled] body preview: {}", truncate(text, 500));
      }
      return MailResult.simulated("Outbound email disabled (DISABLE_OUTBOUND_EMAIL).");
    }

    if (!isConfigured()) {
      log.info(
          "[Gmail not configured] to={} subject={} — set GMAIL_USER and GMAIL_APP_PASSWORD.",
          recipient,
          subject);
      if (StringUtils.hasText(text)) {
        log.info("[Gmail not configured] body preview: {}", truncate(text, 500));
      }
      return MailResult.simulated("Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.");
    }

    try {
      MimeMessage message = mailSender.createMimeMessage();
      MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
      helper.setFrom(fromHeader());
      helper.setReplyTo(properties.getMail().getReplyTo());
      helper.setTo(recipient);
      helper.setSubject(StringUtils.hasText(subject) ? subject : "(no subject) FixBridge");
      boolean hasHtml = StringUtils.hasText(html);
      boolean hasText = StringUtils.hasText(text);
      if (hasHtml && hasText) {
        helper.setText(text, html);
      } else if (hasHtml) {
        helper.setText(html, true);
      } else {
        helper.setText(hasText ? text : "", false);
      }
      mailSender.send(message);
      String messageId = message.getMessageID();
      return MailResult.sent(messageId);
    } catch (Exception e) {
      log.error("[Gmail SMTP] {}", e.getMessage());
      return MailResult.failed(e.getMessage() != null ? e.getMessage() : "Failed to send email.");
    }
  }

  public MailResult sendAdminMfaCode(String to, String firstName, String code) {
    String name = StringUtils.hasText(firstName) ? firstName.trim() : "Admin";
    String subject = "FixBridge admin verification code";
    String text = "Hi " + name + ",\n\nYour FixBridge admin verification code is: " + code
        + "\n\nThis code expires shortly. If you did not request it, contact support.\n";
    String html = """
        <p>Hi %s,</p>
        <p>Use this verification code to complete your FixBridge admin sign-in.</p>
        <p>Your code: <strong>%s</strong></p>
        <p>This code expires shortly. If you did not request it, contact support immediately.</p>
        """.formatted(escapeHtml(name), escapeHtml(code));
    return send(to, subject, html, text);
  }

  private String fromHeader() {
    FixbridgeProperties.Mail mail = properties.getMail();
    String fromEmail = mail.getFromEmail();
    String fromName = mail.getFromName();
    if (StringUtils.hasText(fromName) && StringUtils.hasText(fromEmail)) {
      return fromName + " <" + fromEmail + ">";
    }
    return StringUtils.hasText(fromEmail) ? fromEmail : "support@fixbridge.us";
  }

  private static String truncate(String value, int max) {
    if (value == null) {
      return "";
    }
    return value.length() <= max ? value : value.substring(0, max);
  }

  private static String escapeHtml(String value) {
    if (value == null) {
      return "";
    }
    return value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;");
  }
}
