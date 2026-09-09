package com.fixbridge.notification.mapper;

import com.fixbridge.notification.dto.NotificationDto;
import com.fixbridge.notification.entity.NotificationEntity;
import org.springframework.stereotype.Component;

@Component
public class NotificationMapper {

  public NotificationDto toDto(NotificationEntity entity) {
    if (entity == null) {
      return null;
    }
    NotificationDto dto = new NotificationDto();
    dto.setId(entity.getId());
    dto.setUserId(entity.getUserId());
    dto.setUserRole(entity.getUserRole());
    dto.setJobId(entity.getJobId());
    dto.setType(entity.getType());
    dto.setTitle(entity.getTitle());
    dto.setMessage(entity.getMessage());
    dto.setEntityType(entity.getEntityType());
    dto.setEntityId(entity.getEntityId());
    dto.setActionUrl(entity.getActionUrl());
    dto.setMetadata(entity.getMetadata());
    dto.setRead(entity.isRead());
    dto.setReadAt(entity.getReadAt());
    dto.setArchivedAt(entity.getArchivedAt());
    dto.setCreatedAt(entity.getCreatedAt());
    return dto;
  }
}
