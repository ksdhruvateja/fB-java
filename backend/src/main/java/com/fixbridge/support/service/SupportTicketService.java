package com.fixbridge.support.service;

import com.fixbridge.support.entity.SupportTicketEntity;
import com.fixbridge.support.entity.SupportTicketMessageEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.support.repository.SupportTicketMessageRepository;
import com.fixbridge.support.repository.SupportTicketRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class SupportTicketService {

  private static final Set<String> STATUSES =
      Set.of(
          "open",
          "in_review",
          "waiting_for_customer",
          "waiting_for_contractor",
          "waiting_for_admin",
          "resolved",
          "closed");
  private static final Set<String> PRIORITIES = Set.of("low", "normal", "high", "urgent");

  private final SupportTicketRepository ticketRepository;
  private final SupportTicketMessageRepository messageRepository;
  private final UserRepository userRepository;
  private final ManagedJobRepository managedJobRepository;

  public SupportTicketService(
      SupportTicketRepository ticketRepository,
      SupportTicketMessageRepository messageRepository,
      UserRepository userRepository,
      ManagedJobRepository managedJobRepository) {
    this.ticketRepository = ticketRepository;
    this.messageRepository = messageRepository;
    this.userRepository = userRepository;
    this.managedJobRepository = managedJobRepository;
  }

  @Transactional
  public Map<String, Object> create(Map<String, Object> body) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    UserEntity user =
        userRepository
            .findById(principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Authentication required."));

    String channel = "assistant".equals(String.valueOf(body.get("channel"))) ? "assistant" : "help";
    String subject = clip(String.valueOf(body.getOrDefault("subject", "")), 200);
    String message = clip(String.valueOf(body.getOrDefault("message", "")), 8000);
    if (!StringUtils.hasText(subject) || !StringUtils.hasText(message)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Subject and message are required.");
    }

    SupportTicketEntity ticket = new SupportTicketEntity();
    ticket.setTicketNumber(nextTicketNumber());
    ticket.setUserId(user.getId());
    ticket.setUserRole(user.getRole());
    ticket.setUserName(user.getName());
    ticket.setUserEmail(user.getEmail());
    ticket.setUserPhone(user.getPhone());
    ticket.setChannel(channel);
    ticket.setSubject(subject);
    ticket.setMessage(message);
    ticket.setCategory(clip(String.valueOf(body.getOrDefault("category", "Other")), 80));
    ticket.setPriority(normalizePriority(body.get("priority")));
    ticket.setRelatedJobId(asLong(body.get("relatedJobId") != null ? body.get("relatedJobId") : body.get("relatedJob")));
    ticket.setRelatedPropertyId(asLong(body.get("relatedPropertyId")));
    ticket.setRelatedQuoteId(asLong(body.get("relatedQuoteId")));
    ticket.setRelatedInvoiceId(asLong(body.get("relatedInvoiceId")));
    ticket.setRelatedPaymentId(asLong(body.get("relatedPaymentId")));
    ticket.setStatus("open");
    ticket = ticketRepository.save(ticket);

    SupportTicketMessageEntity first = new SupportTicketMessageEntity();
    first.setTicketId(ticket.getId());
    first.setSenderUserId(user.getId());
    first.setSenderRole(user.getRole());
    first.setSenderName(user.getName());
    first.setMessage(message);
    first.setInternal(false);
    messageRepository.save(first);

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("ok", true);
    out.put("ticket", toTicketDto(ticket));
    out.put("supportEmail", "support@fixbridge.us");
    return out;
  }

  public Map<String, Object> listMine(String statusFilter) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    List<SupportTicketEntity> rows;
    if ("open".equalsIgnoreCase(statusFilter)) {
      rows = ticketRepository.findOpenByUser(principal.getId());
    } else {
      rows = ticketRepository.findTop50ByUserIdOrderByUpdatedAtDescCreatedAtDesc(principal.getId());
      if (StringUtils.hasText(statusFilter) && !"all".equalsIgnoreCase(statusFilter)) {
        String s = statusFilter.toLowerCase(Locale.ROOT);
        rows =
            rows.stream()
                .filter(t -> s.equalsIgnoreCase(t.getStatus()))
                .collect(Collectors.toList());
      }
    }
    return Map.of("ok", true, "tickets", rows.stream().map(this::toTicketDto).toList());
  }

  public Map<String, Object> getMine(String ticketNumber) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    SupportTicketEntity ticket =
        ticketRepository
            .findByTicketNumber(ticketNumber.trim())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Ticket not found."));
    if (!canAccess(principal, ticket)) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Ticket not found.");
    }
    return fullTicket(ticket, "admin".equals(principal.getRole()));
  }

  @Transactional
  public Map<String, Object> reply(String ticketNumber, String message, boolean internal) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    if (!StringUtils.hasText(message)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Message is required.");
    }
    SupportTicketEntity ticket =
        ticketRepository
            .findByTicketNumber(ticketNumber.trim())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Ticket not found."));
    if (!canAccess(principal, ticket)) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Ticket not found.");
    }
    if (internal && !"admin".equals(principal.getRole())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Access denied.");
    }
    SupportTicketMessageEntity msg = new SupportTicketMessageEntity();
    msg.setTicketId(ticket.getId());
    msg.setSenderUserId(principal.getId());
    msg.setSenderRole(principal.getRole());
    msg.setSenderName(principal.getEmail());
    msg.setMessage(clip(message, 8000));
    msg.setInternal(internal);
    msg = messageRepository.save(msg);

    if (!internal && "admin".equals(principal.getRole())) {
      ticket.setStatus("waiting_for_customer");
    } else if (!internal && !"admin".equals(principal.getRole())) {
      ticket.setStatus("waiting_for_admin");
    }
    ticketRepository.save(ticket);
    return Map.of("ok", true, "message", toMessageDto(msg));
  }

  public Map<String, Object> adminList(String status, String q) {
    SecurityUtils.requireAdminRole();
    List<SupportTicketEntity> rows = ticketRepository.findTop200ByOrderByUpdatedAtDescCreatedAtDesc();
    if (StringUtils.hasText(status) && !"all".equalsIgnoreCase(status)) {
      String s = status.toLowerCase(Locale.ROOT);
      rows =
          rows.stream()
              .filter(
                  t -> {
                    String st = String.valueOf(t.getStatus()).toLowerCase(Locale.ROOT);
                    if ("open".equals(s)) {
                      return !"resolved".equals(st) && !"closed".equals(st);
                    }
                    if ("urgent".equals(s)) {
                      return "urgent".equalsIgnoreCase(t.getPriority());
                    }
                    if ("waiting".equals(s)) {
                      return st.startsWith("waiting_");
                    }
                    return s.equals(st);
                  })
              .collect(Collectors.toList());
    }
    if (StringUtils.hasText(q)) {
      String needle = q.toLowerCase(Locale.ROOT);
      rows =
          rows.stream()
              .filter(
                  t ->
                      contains(t.getTicketNumber(), needle)
                          || contains(t.getSubject(), needle)
                          || contains(t.getUserName(), needle)
                          || contains(t.getUserEmail(), needle)
                          || contains(t.getUserPhone(), needle))
              .collect(Collectors.toList());
    }
    return Map.of("ok", true, "tickets", rows.stream().map(this::toTicketDto).toList());
  }

  public Map<String, Object> adminGet(String ticketNumber) {
    SecurityUtils.requireAdminRole();
    SupportTicketEntity ticket =
        ticketRepository
            .findByTicketNumber(ticketNumber.trim())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Ticket not found."));
    return fullTicket(ticket, true);
  }

  @Transactional
  public Map<String, Object> adminUpdate(String ticketNumber, Map<String, Object> body) {
    SecurityUtils.requireAdminRole();
    SupportTicketEntity ticket =
        ticketRepository
            .findByTicketNumber(ticketNumber.trim())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Ticket not found."));
    if (body.containsKey("status")) {
      String status = normalizeStatus(body.get("status"));
      if (!STATUSES.contains(status)) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid status.");
      }
      ticket.setStatus(status);
      if ("resolved".equals(status)) {
        ticket.setResolvedAt(OffsetDateTime.now());
      }
      if ("closed".equals(status)) {
        ticket.setClosedAt(OffsetDateTime.now());
      }
    }
    if (body.containsKey("priority")) {
      ticket.setPriority(normalizePriority(body.get("priority")));
    }
    if (body.containsKey("assignedTo")) {
      ticket.setAssignedTo(
          body.get("assignedTo") == null ? null : clip(String.valueOf(body.get("assignedTo")), 120));
    }
    if (body.containsKey("category")) {
      ticket.setCategory(
          body.get("category") == null ? null : clip(String.valueOf(body.get("category")), 80));
    }
    ticket = ticketRepository.save(ticket);
    return Map.of("ok", true, "ticket", toTicketDto(ticket));
  }

  private Map<String, Object> fullTicket(SupportTicketEntity ticket, boolean includeInternal) {
    List<SupportTicketMessageEntity> messages =
        includeInternal
            ? messageRepository.findByTicketIdOrderByCreatedAtAscIdAsc(ticket.getId())
            : messageRepository.findByTicketIdAndInternalFalseOrderByCreatedAtAscIdAsc(ticket.getId());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("ok", true);
    out.put("ticket", toTicketDto(ticket));
    out.put("messages", messages.stream().map(this::toMessageDto).toList());
    out.put("context", ticket.getContext());
    return out;
  }

  private boolean canAccess(UserPrincipal principal, SupportTicketEntity ticket) {
    if ("admin".equals(principal.getRole())) {
      return true;
    }
    if (ticket.getUserId().equals(principal.getId())) {
      return true;
    }
    if ("contractor".equals(principal.getRole()) && ticket.getRelatedJobId() != null) {
      return managedJobRepository
          .findByIdAndAssignedContractorUserId(ticket.getRelatedJobId(), principal.getId())
          .isPresent();
    }
    return false;
  }

  private String nextTicketNumber() {
    int seq = 10001;
    var last = ticketRepository.findFirstByTicketNumberStartingWithOrderByIdDesc("FBT-");
    if (last.isPresent()) {
      String num = last.get().getTicketNumber().replace("FBT-", "");
      try {
        int n = Integer.parseInt(num);
        if (n >= 10001) {
          seq = n + 1;
        }
      } catch (NumberFormatException ignored) {
        // keep default
      }
    }
    return "FBT-" + seq;
  }

  private Map<String, Object> toTicketDto(SupportTicketEntity t) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", t.getId());
    m.put("ticketNumber", t.getTicketNumber());
    m.put("userId", t.getUserId());
    m.put("userRole", t.getUserRole());
    m.put("userName", t.getUserName());
    m.put("userEmail", t.getUserEmail());
    m.put("userPhone", t.getUserPhone());
    m.put("channel", t.getChannel());
    m.put("subject", t.getSubject());
    m.put("message", t.getMessage());
    m.put("category", t.getCategory());
    m.put("priority", normalizePriority(t.getPriority()));
    m.put("assignedTo", t.getAssignedTo());
    m.put("relatedPropertyId", t.getRelatedPropertyId());
    m.put("relatedJobId", t.getRelatedJobId());
    m.put("relatedQuoteId", t.getRelatedQuoteId());
    m.put("relatedInvoiceId", t.getRelatedInvoiceId());
    m.put("relatedPaymentId", t.getRelatedPaymentId());
    m.put("context", t.getContext());
    m.put("status", normalizeStatus(t.getStatus()));
    m.put("createdAt", t.getCreatedAt());
    m.put("updatedAt", t.getUpdatedAt());
    m.put("resolvedAt", t.getResolvedAt());
    m.put("closedAt", t.getClosedAt());
    return m;
  }

  private Map<String, Object> toMessageDto(SupportTicketMessageEntity r) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", r.getId());
    m.put("ticketId", r.getTicketId());
    m.put("senderUserId", r.getSenderUserId());
    m.put("senderRole", r.getSenderRole());
    m.put("senderName", r.getSenderName());
    m.put("message", r.getMessage());
    m.put("isInternal", Boolean.TRUE.equals(r.getInternal()));
    m.put("createdAt", r.getCreatedAt());
    return m;
  }

  private static String normalizeStatus(Object status) {
    String s = String.valueOf(status == null ? "open" : status).toLowerCase(Locale.ROOT).replace(' ', '_');
    if ("in_progress".equals(s)) {
      return "in_review";
    }
    return s;
  }

  private static String normalizePriority(Object priority) {
    String p = String.valueOf(priority == null ? "normal" : priority).toLowerCase(Locale.ROOT);
    return PRIORITIES.contains(p) ? p : "normal";
  }

  private static Long asLong(Object v) {
    if (v == null || !StringUtils.hasText(String.valueOf(v))) {
      return null;
    }
    try {
      return Long.valueOf(String.valueOf(v));
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private static String clip(String s, int max) {
    if (s == null) {
      return "";
    }
    String t = s.trim();
    return t.length() <= max ? t : t.substring(0, max);
  }

  private static boolean contains(String hay, String needle) {
    return hay != null && hay.toLowerCase(Locale.ROOT).contains(needle);
  }
}
