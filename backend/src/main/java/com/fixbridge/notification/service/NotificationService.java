package com.fixbridge.notification.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fixbridge.notification.dto.NotificationDto;
import com.fixbridge.notification.entity.NotificationEntity;
import com.fixbridge.notification.mapper.NotificationMapper;
import com.fixbridge.notification.repository.NotificationRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {

  private final NotificationRepository notificationRepository;
  private final NotificationMapper notificationMapper;

  public NotificationService(
      NotificationRepository notificationRepository, NotificationMapper notificationMapper) {
    this.notificationRepository = notificationRepository;
    this.notificationMapper = notificationMapper;
  }

  @Transactional
  public NotificationEntity create(
      Long userId,
      String userRole,
      Long jobId,
      String type,
      String title,
      String message,
      String entityType,
      Long entityId,
      String actionUrl,
      JsonNode metadata) {
    NotificationEntity n = new NotificationEntity();
    n.setUserId(userId);
    n.setUserRole(userRole);
    n.setJobId(jobId);
    n.setType(type);
    n.setTitle(title);
    n.setMessage(message);
    n.setEntityType(entityType);
    n.setEntityId(entityId);
    n.setActionUrl(actionUrl);
    n.setMetadata(metadata);
    n.setReadFlag(false);
    return notificationRepository.save(n);
  }

  @Transactional(readOnly = true)
  public Map<String, Object> unreadCount() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    long count = notificationRepository.countUnread(principal.getId());
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("count", count);
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> list(String filter, Integer limit, Integer offset) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    String mode = filter != null ? filter.trim().toLowerCase(Locale.ROOT) : "all";
    int lim = limit == null ? 50 : Math.min(100, Math.max(1, limit));
    int off = offset == null ? 0 : Math.max(0, offset);
    PageRequest page = PageRequest.of(off / lim, lim);

    List<NotificationEntity> rows;
    if ("unread".equals(mode)) {
      rows = notificationRepository.findUnreadForUser(principal.getId(), page);
    } else if ("archived".equals(mode)) {
      rows = notificationRepository.findArchivedForUser(principal.getId(), page);
    } else {
      rows = notificationRepository.findActiveForUser(principal.getId(), page);
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put(
        "notifications",
        rows.stream().map(notificationMapper::toDto).collect(Collectors.toList()));
    return body;
  }

  @Transactional
  public Map<String, Object> markRead(Long id) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    notificationRepository.markRead(principal.getId(), id);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    return body;
  }

  @Transactional
  public Map<String, Object> markAllRead() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    notificationRepository.markAllRead(principal.getId());
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    return body;
  }

  @Transactional
  public Map<String, Object> archive(Long id) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    notificationRepository.archiveOne(principal.getId(), id);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    return body;
  }

  @Transactional
  public Map<String, Object> archiveRead() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    notificationRepository.archiveRead(principal.getId());
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    return body;
  }

  /** Backward-compatible bulk read; returns notification list like Express. */
  @Transactional
  public List<NotificationDto> markReadBulk(List<Long> ids) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    if (ids != null && !ids.isEmpty()) {
      for (Long id : ids) {
        if (id != null) {
          notificationRepository.markRead(principal.getId(), id);
        }
      }
    } else {
      notificationRepository.markAllRead(principal.getId());
    }
    return notificationRepository
        .findActiveForUser(principal.getId(), PageRequest.of(0, 50))
        .stream()
        .map(notificationMapper::toDto)
        .collect(Collectors.toCollection(ArrayList::new));
  }
}
