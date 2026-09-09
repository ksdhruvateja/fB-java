package com.fixbridge.messaging.controller;

import com.fixbridge.messaging.entity.MessageAttachmentEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.messaging.service.MessagingService;
import java.util.Base64;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/messages")
public class MessagingController {

  private final MessagingService messagingService;

  public MessagingController(MessagingService messagingService) {
    this.messagingService = messagingService;
  }

  @GetMapping("/unread-count")
  public Map<String, Object> unreadCount() {
    return messagingService.unreadCount();
  }

  @GetMapping("/conversations")
  public Map<String, Object> listConversations(
      @RequestParam(required = false, defaultValue = "all") String filter,
      @RequestParam(required = false, defaultValue = "") String search) {
    return messagingService.listConversations(filter, search);
  }

  @PostMapping("/conversations")
  public Map<String, Object> createConversation(@RequestBody(required = false) Map<String, Object> body) {
    return messagingService.createConversation(body != null ? body : Map.of());
  }

  @GetMapping("/conversations/{id}")
  public Map<String, Object> getConversation(
      @PathVariable("id") Long id,
      @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) Long beforeId) {
    return messagingService.getConversation(id, limit, beforeId);
  }

  @PostMapping("/conversations/{id}/messages")
  public Map<String, Object> sendMessage(
      @PathVariable("id") Long id,
      @RequestBody(required = false) Map<String, Object> body) {
    return messagingService.sendMessage(id, body != null ? body : Map.of());
  }

  @PostMapping("/conversations/{id}/read")
  public Map<String, Object> markRead(@PathVariable("id") Long id) {
    return messagingService.markRead(id);
  }

  @GetMapping("/attachments/{id}")
  public ResponseEntity<byte[]> downloadAttachment(@PathVariable("id") Long id) {
    MessageAttachmentEntity att = messagingService.getAttachment(id);
    byte[] data;
    try {
      data = Base64.getDecoder().decode(att.getStorageData());
    } catch (IllegalArgumentException e) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Not found.");
    }
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.parseMediaType(
        att.getMimeType() != null ? att.getMimeType() : MediaType.APPLICATION_OCTET_STREAM_VALUE));
    headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + att.getFileName() + "\"");
    headers.setCacheControl("private, no-store");
    return new ResponseEntity<>(data, headers, HttpStatus.OK);
  }
}
