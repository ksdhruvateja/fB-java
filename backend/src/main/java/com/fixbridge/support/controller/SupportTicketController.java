package com.fixbridge.support.controller;

import com.fixbridge.support.service.SupportTicketService;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SupportTicketController {

  private final SupportTicketService supportTicketService;

  public SupportTicketController(SupportTicketService supportTicketService) {
    this.supportTicketService = supportTicketService;
  }

  @PostMapping("/api/support/tickets")
  public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body) {
    return supportTicketService.create(body != null ? body : Map.of());
  }

  @PostMapping("/api/support/messages")
  public Map<String, Object> createMessage(@RequestBody(required = false) Map<String, Object> body) {
    Map<String, Object> payload = body != null ? new java.util.LinkedHashMap<>(body) : new java.util.LinkedHashMap<>();
    payload.putIfAbsent("channel", "help");
    Map<String, Object> result = supportTicketService.create(payload);
    @SuppressWarnings("unchecked")
    Map<String, Object> ticket = (Map<String, Object>) result.get("ticket");
    return Map.of(
        "ok",
        true,
        "id",
        ticket.get("id"),
        "ticketNumber",
        ticket.get("ticketNumber"),
        "createdAt",
        ticket.get("createdAt"),
        "supportEmail",
        result.get("supportEmail"));
  }

  @GetMapping("/api/support/tickets")
  public Map<String, Object> list(@RequestParam(required = false) String status) {
    return supportTicketService.listMine(status);
  }

  @GetMapping("/api/support/tickets/{ticketNumber}")
  public Map<String, Object> get(@PathVariable String ticketNumber) {
    return supportTicketService.getMine(ticketNumber);
  }

  @PostMapping("/api/support/tickets/{ticketNumber}/reply")
  public Map<String, Object> reply(
      @PathVariable String ticketNumber, @RequestBody(required = false) Map<String, Object> body) {
    String message = body != null ? String.valueOf(body.getOrDefault("message", "")) : "";
    return supportTicketService.reply(ticketNumber, message, false);
  }

  @GetMapping("/api/admin/support/tickets")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminList(
      @RequestParam(required = false) String status, @RequestParam(required = false) String q) {
    return supportTicketService.adminList(status, q);
  }

  @GetMapping("/api/admin/support/tickets/{ticketNumber}")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminGet(@PathVariable String ticketNumber) {
    return supportTicketService.adminGet(ticketNumber);
  }

  @PatchMapping("/api/admin/support/tickets/{ticketNumber}")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminUpdate(
      @PathVariable String ticketNumber, @RequestBody(required = false) Map<String, Object> body) {
    return supportTicketService.adminUpdate(ticketNumber, body != null ? body : Map.of());
  }

  @PostMapping("/api/admin/support/tickets/{ticketNumber}/reply")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminReply(
      @PathVariable String ticketNumber, @RequestBody(required = false) Map<String, Object> body) {
    String message = body != null ? String.valueOf(body.getOrDefault("message", "")) : "";
    boolean internal = body != null && Boolean.TRUE.equals(body.get("internal"));
    return supportTicketService.reply(ticketNumber, message, internal);
  }
}
