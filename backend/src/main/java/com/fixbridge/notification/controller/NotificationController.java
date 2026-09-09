package com.fixbridge.notification.controller;

import com.fixbridge.notification.dto.NotificationDto;
import com.fixbridge.notification.service.NotificationService;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

  private final NotificationService notificationService;

  public NotificationController(NotificationService notificationService) {
    this.notificationService = notificationService;
  }

  @GetMapping("/unread-count")
  public Map<String, Object> unreadCount() {
    return notificationService.unreadCount();
  }

  @GetMapping
  public Map<String, Object> list(
      @RequestParam(required = false, defaultValue = "all") String filter,
      @RequestParam(required = false) Integer limit,
      @RequestParam(required = false) Integer offset) {
    return notificationService.list(filter, limit, offset);
  }

  @PostMapping("/{id}/read")
  public Map<String, Object> markRead(@PathVariable Long id) {
    return notificationService.markRead(id);
  }

  @PostMapping("/read-all")
  public Map<String, Object> markAllRead() {
    return notificationService.markAllRead();
  }

  @PostMapping("/{id}/archive")
  public Map<String, Object> archive(@PathVariable Long id) {
    return notificationService.archive(id);
  }

  @PostMapping("/archive-read")
  public Map<String, Object> archiveRead() {
    return notificationService.archiveRead();
  }

  @PostMapping("/read")
  public List<NotificationDto> markReadBulk(@RequestBody(required = false) NotificationDto.BulkReadRequest body) {
    List<Long> ids = body != null ? body.getIds() : null;
    return notificationService.markReadBulk(ids);
  }
}
