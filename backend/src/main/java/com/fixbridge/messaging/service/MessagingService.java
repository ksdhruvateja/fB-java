package com.fixbridge.messaging.service;

import com.fixbridge.config.FixbridgeProperties;
import com.fixbridge.messaging.entity.ConversationEntity;
import com.fixbridge.messaging.entity.ConversationReadCursorEntity;
import com.fixbridge.messaging.entity.MessageAttachmentEntity;
import com.fixbridge.messaging.entity.MessageEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.messaging.repository.ConversationReadCursorRepository;
import com.fixbridge.messaging.repository.ConversationRepository;
import com.fixbridge.messaging.repository.MessageAttachmentRepository;
import com.fixbridge.messaging.repository.MessageRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class MessagingService {

  private static final Set<String> ALLOWED_MIME = Set.of(
      "image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf");
  private static final int MAX_BODY_LEN = 8000;
  private static final int MAX_MESSAGES_PER_MINUTE = 30;
  private static final Pattern DATA_URL = Pattern.compile("^data:([^;]+);base64,(.+)$", Pattern.DOTALL);

  private final ConversationRepository conversationRepository;
  private final MessageRepository messageRepository;
  private final ConversationReadCursorRepository readCursorRepository;
  private final MessageAttachmentRepository attachmentRepository;
  private final UserRepository userRepository;
  private final FixbridgeProperties properties;
  private final ConcurrentHashMap<Long, RateBucket> rateBuckets = new ConcurrentHashMap<>();

  public MessagingService(
      ConversationRepository conversationRepository,
      MessageRepository messageRepository,
      ConversationReadCursorRepository readCursorRepository,
      MessageAttachmentRepository attachmentRepository,
      UserRepository userRepository,
      FixbridgeProperties properties) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.readCursorRepository = readCursorRepository;
    this.attachmentRepository = attachmentRepository;
    this.userRepository = userRepository;
    this.properties = properties;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> unreadCount() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    List<ConversationEntity> conversations = listRawConversations(principal, "all");
    long total = 0;
    for (ConversationEntity c : conversations) {
      total += unreadFor(c.getId(), principal.getId());
    }
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("count", total);
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> listConversations(String filter, String search) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    String filterValue = filter == null ? "all" : filter.trim().toLowerCase(Locale.ROOT);
    String searchValue = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);

    List<ConversationEntity> rows = listRawConversations(principal, filterValue);
    List<Map<String, Object>> conversations = new ArrayList<>();
    for (ConversationEntity conv : rows) {
      if (conversations.size() >= 100) {
        break;
      }
      Map<String, Object> enriched = enrich(conv, principal);
      if ("unread".equals(filterValue) && ((Number) enriched.get("unreadCount")).intValue() == 0) {
        continue;
      }
      if (StringUtils.hasText(searchValue)) {
        String hay = String.join(" ",
            String.valueOf(enriched.getOrDefault("subject", "")),
            String.valueOf(enriched.getOrDefault("counterpartyName", "")),
            String.valueOf(enriched.getOrDefault("jobLabel", "")),
            String.valueOf(enriched.getOrDefault("lastMessagePreview", "")))
            .toLowerCase(Locale.ROOT);
        if (!hay.contains(searchValue)) {
          continue;
        }
      }
      conversations.add(enriched);
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("conversations", conversations);
    return body;
  }

  @Transactional
  public Map<String, Object> createConversation(Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    String subject = clamp(stripHtml(asString(request.get("subject"))), 200);
    if (!StringUtils.hasText(subject)) {
      subject = null;
    }
    Long jobId = asLong(request.get("jobId"));
    String initialBody = stripHtml(asString(request.get("body")));
    Long targetHomeownerId = asLong(request.get("homeownerUserId"));
    Long targetContractorId = asLong(request.get("contractorUserId"));

    String type;
    Long homeownerUserId = null;
    Long contractorUserId = null;
    String role = principal.getRole();

    if ("homeowner".equals(role)) {
      type = "homeowner_admin";
      homeownerUserId = principal.getId();
    } else if ("contractor".equals(role)) {
      type = "contractor_admin";
      contractorUserId = principal.getId();
    } else if ("admin".equals(role)) {
      if (targetHomeownerId != null) {
        type = "homeowner_admin";
        homeownerUserId = targetHomeownerId;
      } else if (targetContractorId != null) {
        type = "contractor_admin";
        contractorUserId = targetContractorId;
      } else {
        throw new ApiException(HttpStatus.BAD_REQUEST, "homeownerUserId or contractorUserId required.");
      }
    } else {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }

    if (jobId != null) {
      ConversationEntity existing = null;
      if ("homeowner_admin".equals(type) && homeownerUserId != null) {
        existing = conversationRepository
            .findFirstByTypeAndJobIdAndStatusNotAndHomeownerUserIdOrderByUpdatedAtDesc(
                type, jobId, "archived", homeownerUserId)
            .orElse(null);
      } else if ("contractor_admin".equals(type) && contractorUserId != null) {
        existing = conversationRepository
            .findFirstByTypeAndJobIdAndStatusNotAndContractorUserIdOrderByUpdatedAtDesc(
                type, jobId, "archived", contractorUserId)
            .orElse(null);
      }
      if (existing != null) {
        if (StringUtils.hasText(initialBody)) {
          sendMessageInternal(existing, principal, initialBody, asList(request.get("attachments")), null);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("conversation", enrich(existing, principal));
        body.put("reused", true);
        return body;
      }
    }

    ConversationEntity conv = new ConversationEntity();
    conv.setType(type);
    conv.setHomeownerUserId(homeownerUserId);
    conv.setContractorUserId(contractorUserId);
    conv.setJobId(jobId);
    conv.setSubject(subject);
    conv.setStatus("open");
    conv = conversationRepository.save(conv);

    if (StringUtils.hasText(initialBody)) {
      sendMessageInternal(conv, principal, initialBody, asList(request.get("attachments")), null);
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("conversation", enrich(conv, principal));
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> getConversation(Long conversationId, Integer limit, Long beforeId) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ConversationEntity conv = requireAccess(conversationId, principal);
    int lim = limit == null ? 50 : Math.min(100, Math.max(1, limit));

    List<MessageEntity> msgRows;
    if (beforeId != null) {
      msgRows = messageRepository.findByConversationIdAndIdLessThanOrderByCreatedAtDesc(
          conversationId, beforeId, PageRequest.of(0, lim));
    } else {
      msgRows = messageRepository.findByConversationIdOrderByCreatedAtDesc(
          conversationId, PageRequest.of(0, lim));
    }

    List<Map<String, Object>> messages = new ArrayList<>();
    for (int i = msgRows.size() - 1; i >= 0; i--) {
      MessageEntity m = msgRows.get(i);
      List<MessageAttachmentEntity> atts = attachmentRepository.findByMessageIdOrderByIdAsc(m.getId());
      messages.add(toMessage(m, atts));
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("conversation", enrich(conv, principal));
    body.put("messages", messages);
    return body;
  }

  @Transactional
  public Map<String, Object> sendMessage(Long conversationId, Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    if (!checkRateLimit(principal.getId())) {
      throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many messages. Please wait a moment.");
    }
    ConversationEntity conv = requireAccess(conversationId, principal);
    try {
      Map<String, Object> message = sendMessageInternal(
          conv,
          principal,
          stripHtml(asString(request.get("body"))),
          asList(request.get("attachments")),
          asString(request.get("idempotencyKey")));
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("ok", true);
      body.put("message", message);
      return body;
    } catch (ApiException e) {
      throw e;
    } catch (IllegalArgumentException e) {
      throw new ApiException(HttpStatus.BAD_REQUEST, e.getMessage());
    }
  }

  @Transactional
  public Map<String, Object> markRead(Long conversationId) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    requireAccess(conversationId, principal);
    ConversationReadCursorEntity cursor = readCursorRepository
        .findByConversationIdAndUserId(conversationId, principal.getId())
        .orElseGet(ConversationReadCursorEntity::new);
    cursor.setConversationId(conversationId);
    cursor.setUserId(principal.getId());
    cursor.setLastReadAt(OffsetDateTime.now());
    readCursorRepository.save(cursor);
    return Map.of("ok", true);
  }

  @Transactional(readOnly = true)
  public MessageAttachmentEntity getAttachment(Long attachmentId) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    MessageAttachmentEntity att = attachmentRepository.findById(attachmentId)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found."));
    requireAccess(att.getConversationId(), principal);
    return att;
  }

  private Map<String, Object> sendMessageInternal(
      ConversationEntity conversation,
      UserPrincipal authUser,
      String body,
      List<?> attachments,
      String idempotencyKey) {
    String text = stripHtml(body);
    List<?> atts = attachments != null ? attachments : List.of();
    if (!StringUtils.hasText(text) && atts.isEmpty()) {
      throw new IllegalArgumentException("Message body or attachment required.");
    }
    if (text.length() > MAX_BODY_LEN) {
      throw new IllegalArgumentException("Message too long.");
    }
    int maxAtt = properties.getMedia().getMaxAttachmentsPerMessage();
    if (atts.size() > maxAtt) {
      throw new IllegalArgumentException("Maximum " + maxAtt + " attachments per message.");
    }

    if (StringUtils.hasText(idempotencyKey)) {
      var dup = messageRepository.findFirstBySenderUserIdAndBodyAndCreatedAtAfterOrderByIdDesc(
          authUser.getId(), text, OffsetDateTime.now().minusSeconds(30));
      if (dup.isPresent()) {
        return toMessage(dup.get(), List.of());
      }
    }

    String role = authUser.getRole();
    UserEntity sender = userRepository.findById(authUser.getId()).orElse(null);
    String senderDisplay = sender != null && StringUtils.hasText(sender.getName())
        ? sender.getName()
        : (authUser.getEmail() != null ? authUser.getEmail() : "User");
    Long sentByAdminUserId = null;
    if ("admin".equals(role)) {
      senderDisplay = "FixBridge Support";
      sentByAdminUserId = authUser.getId();
    }

    MessageEntity message = new MessageEntity();
    message.setConversationId(conversation.getId());
    message.setSenderUserId(authUser.getId());
    message.setSenderRole(role);
    message.setSenderDisplayName(senderDisplay);
    message.setSentByAdminUserId(sentByAdminUserId);
    message.setBody(StringUtils.hasText(text) ? text : "(attachment)");
    message = messageRepository.save(message);

    List<MessageAttachmentEntity> savedAttachments = new ArrayList<>();
    for (Object raw : atts) {
      if (!(raw instanceof Map<?, ?> map)) {
        throw new IllegalArgumentException("Invalid attachment.");
      }
      ValidatedAttachment check = validateAttachment(map);
      MessageAttachmentEntity att = new MessageAttachmentEntity();
      att.setMessageId(message.getId());
      att.setConversationId(conversation.getId());
      att.setUploaderUserId(authUser.getId());
      att.setFileName(check.fileName());
      att.setMimeType(check.mime());
      att.setByteSize(check.byteSize());
      att.setStorageData(check.data());
      att.setStorageProvider("database");
      savedAttachments.add(attachmentRepository.save(att));
    }

    conversation.setUpdatedAt(OffsetDateTime.now());
    conversationRepository.save(conversation);

    return toMessage(message, savedAttachments);
  }

  private List<ConversationEntity> listRawConversations(UserPrincipal principal, String filter) {
    String role = principal.getRole();
    if ("admin".equals(role)) {
      List<ConversationEntity> all;
      if ("homeowners".equals(filter)) {
        all = conversationRepository.findAdminConversationsByType("homeowner_admin");
      } else if ("contractors".equals(filter)) {
        all = conversationRepository.findAdminConversationsByType("contractor_admin");
      } else if ("job".equals(filter)) {
        all = conversationRepository.findAdminJobConversations();
      } else {
        all = conversationRepository.findAdminConversations();
      }
      return all.size() > 100 ? all.subList(0, 100) : all;
    }
    if ("homeowner".equals(role)) {
      return conversationRepository.findTop100ByHomeownerUserIdOrderByUpdatedAtDescCreatedAtDesc(principal.getId());
    }
    if ("contractor".equals(role)) {
      return conversationRepository.findTop100ByContractorUserIdOrderByUpdatedAtDescCreatedAtDesc(principal.getId());
    }
    throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
  }

  private ConversationEntity requireAccess(Long conversationId, UserPrincipal authUser) {
    ConversationEntity conv = conversationRepository.findById(conversationId)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Conversation not found."));
    Long uid = authUser.getId();
    String role = authUser.getRole();
    if ("admin".equals(role)) {
      return conv;
    }
    if (conv.getHomeownerUserId() != null
        && conv.getHomeownerUserId().equals(uid)
        && "homeowner".equals(role)) {
      return conv;
    }
    if (conv.getContractorUserId() != null
        && conv.getContractorUserId().equals(uid)
        && "contractor".equals(role)) {
      return conv;
    }
    throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
  }

  private Map<String, Object> enrich(ConversationEntity conv, UserPrincipal authUser) {
    String counterpartyName = "FixBridge Support";
    if ("admin".equals(authUser.getRole())) {
      Long targetId = conv.getHomeownerUserId() != null ? conv.getHomeownerUserId() : conv.getContractorUserId();
      if (targetId != null) {
        counterpartyName = userRepository.findById(targetId)
            .map(u -> StringUtils.hasText(u.getName()) ? u.getName() : u.getEmail())
            .orElse("User");
      }
    }

    String lastPreview = null;
    OffsetDateTime lastAt = null;
    var lastMsg = messageRepository.findFirstByConversationIdOrderByCreatedAtDesc(conv.getId());
    if (lastMsg.isPresent()) {
      lastPreview = clamp(lastMsg.get().getBody(), 120);
      lastAt = lastMsg.get().getCreatedAt();
    }

    Map<String, Object> dto = new LinkedHashMap<>();
    dto.put("id", conv.getId());
    dto.put("type", conv.getType());
    dto.put("jobId", conv.getJobId());
    dto.put("homeownerUserId", conv.getHomeownerUserId());
    dto.put("contractorUserId", conv.getContractorUserId());
    dto.put("subject", conv.getSubject());
    dto.put("status", conv.getStatus() != null ? conv.getStatus() : "open");
    dto.put("createdAt", conv.getCreatedAt());
    dto.put("updatedAt", conv.getUpdatedAt() != null ? conv.getUpdatedAt() : conv.getCreatedAt());
    dto.put("unreadCount", unreadFor(conv.getId(), authUser.getId()));
    dto.put("lastMessagePreview", lastPreview);
    dto.put("lastMessageAt", lastAt);
    dto.put("counterpartyName", counterpartyName);
    dto.put("jobLabel", conv.getJobId() != null ? "FB-" + conv.getJobId() : null);
    return dto;
  }

  private long unreadFor(Long conversationId, Long userId) {
    OffsetDateTime lastRead = readCursorRepository.findByConversationIdAndUserId(conversationId, userId)
        .map(ConversationReadCursorEntity::getLastReadAt)
        .orElse(OffsetDateTime.ofInstant(Instant.EPOCH, ZoneOffset.UTC));
    return messageRepository.countUnread(conversationId, userId, lastRead);
  }

  private Map<String, Object> toMessage(MessageEntity row, List<MessageAttachmentEntity> attachments) {
    List<Map<String, Object>> attDtos = new ArrayList<>();
    for (MessageAttachmentEntity a : attachments) {
      attDtos.add(toAttachment(a));
    }
    Map<String, Object> dto = new LinkedHashMap<>();
    dto.put("id", row.getId());
    dto.put("conversationId", row.getConversationId());
    dto.put("senderUserId", row.getSenderUserId());
    dto.put("senderRole", row.getSenderRole());
    dto.put("senderDisplayName", row.getSenderDisplayName());
    dto.put("body", row.getBody());
    dto.put("createdAt", row.getCreatedAt());
    dto.put("attachments", attDtos);
    return dto;
  }

  private Map<String, Object> toAttachment(MessageAttachmentEntity row) {
    Map<String, Object> dto = new LinkedHashMap<>();
    dto.put("id", row.getId());
    dto.put("messageId", row.getMessageId());
    dto.put("conversationId", row.getConversationId());
    dto.put("fileName", row.getFileName());
    dto.put("mimeType", row.getMimeType());
    dto.put("byteSize", row.getByteSize());
    dto.put("downloadUrl", "/api/messages/attachments/" + row.getId());
    dto.put("isImage", row.getMimeType() != null && row.getMimeType().startsWith("image/"));
    dto.put("isPdf", "application/pdf".equals(row.getMimeType()));
    return dto;
  }

  private ValidatedAttachment validateAttachment(Map<?, ?> att) {
    String mime = asString(att.get("mimeType"));
    if (!StringUtils.hasText(mime)) {
      mime = asString(att.get("mime"));
    }
    mime = mime.toLowerCase(Locale.ROOT);
    if (!ALLOWED_MIME.contains(mime)) {
      throw new IllegalArgumentException("File type not allowed.");
    }
    String data = asString(att.get("data"));
    if (!StringUtils.hasText(data)) {
      data = asString(att.get("storageData"));
    }
    if (data.startsWith("data:")) {
      Matcher m = DATA_URL.matcher(data);
      if (!m.matches()) {
        throw new IllegalArgumentException("Invalid attachment encoding.");
      }
      data = m.group(2);
    }
    byte[] decoded;
    try {
      decoded = Base64.getDecoder().decode(data.getBytes(StandardCharsets.US_ASCII));
    } catch (IllegalArgumentException e) {
      throw new IllegalArgumentException("Invalid attachment encoding.");
    }
    int maxBytes = (int) (properties.getMedia().getMaxAttachmentSizeMb() * 1_000_000);
    if (decoded.length > maxBytes) {
      throw new IllegalArgumentException(
          "Max attachment size is " + Math.round(properties.getMedia().getMaxAttachmentSizeMb() * 10) / 10.0 + "MB.");
    }
    String fileName = safeFileName(firstNonBlank(asString(att.get("fileName")), asString(att.get("name"))));
    return new ValidatedAttachment(mime, data, fileName, decoded.length);
  }

  private boolean checkRateLimit(Long userId) {
    long now = System.currentTimeMillis();
    RateBucket bucket = rateBuckets.compute(userId, (id, existing) -> {
      if (existing == null || now - existing.start > 60_000) {
        return new RateBucket(now, 1);
      }
      existing.count += 1;
      return existing;
    });
    return bucket.count <= MAX_MESSAGES_PER_MINUTE;
  }

  private static String stripHtml(String text) {
    return String.valueOf(text == null ? "" : text)
        .replaceAll("<[^>]*>", "")
        .replaceAll("(?i)javascript:", "")
        .trim();
  }

  private static String clamp(String text, int max) {
    if (text == null) {
      return null;
    }
    return text.length() <= max ? text : text.substring(0, max);
  }

  private static String safeFileName(String name) {
    String base = String.valueOf(name == null ? "file" : name)
        .replaceAll("[/\\\\?%*:|\"<>]", "_")
        .replace("..", "_");
    if (base.length() > 180) {
      base = base.substring(0, 180);
    }
    return StringUtils.hasText(base) ? base : "file";
  }

  private static String asString(Object value) {
    return value == null ? "" : String.valueOf(value);
  }

  private static Long asLong(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof Number n) {
      return n.longValue();
    }
    String s = String.valueOf(value).trim();
    if (!StringUtils.hasText(s) || "null".equalsIgnoreCase(s)) {
      return null;
    }
    try {
      return Long.parseLong(s);
    } catch (NumberFormatException e) {
      return null;
    }
  }

  @SuppressWarnings("unchecked")
  private static List<?> asList(Object value) {
    if (value instanceof List<?> list) {
      return list;
    }
    return List.of();
  }

  private static String firstNonBlank(String a, String b) {
    if (StringUtils.hasText(a)) {
      return a;
    }
    if (StringUtils.hasText(b)) {
      return b;
    }
    return "file";
  }

  private record ValidatedAttachment(String mime, String data, String fileName, int byteSize) {}

  private static final class RateBucket {
    final long start;
    int count;

    RateBucket(long start, int count) {
      this.start = start;
      this.count = count;
    }
  }
}
