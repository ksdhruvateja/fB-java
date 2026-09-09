package com.fixbridge.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.admin.entity.AuditLogEntity;
import com.fixbridge.payout.entity.PayoutAuditLogEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.admin.repository.AuditLogRepository;
import com.fixbridge.payout.repository.PayoutAuditLogRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditService {

  private final AuditLogRepository auditLogRepository;
  private final PayoutAuditLogRepository payoutAuditLogRepository;
  private final UserRepository userRepository;
  private final ObjectMapper objectMapper;

  public AuditService(
      AuditLogRepository auditLogRepository,
      PayoutAuditLogRepository payoutAuditLogRepository,
      UserRepository userRepository,
      ObjectMapper objectMapper) {
    this.auditLogRepository = auditLogRepository;
    this.payoutAuditLogRepository = payoutAuditLogRepository;
    this.userRepository = userRepository;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public void write(Long actorUserId, String action, String entityType, Object entityId, Object detail) {
    AuditLogEntity row = new AuditLogEntity();
    row.setActorUserId(actorUserId);
    row.setAction(action == null ? "unknown" : action);
    row.setEntityType(entityType);
    row.setEntityId(entityId == null ? null : String.valueOf(entityId));
    if (detail != null) {
      row.setDetail(objectMapper.valueToTree(detail));
    }
    auditLogRepository.save(row);
  }

  @Transactional(readOnly = true)
  public Map<String, Object> list(Integer limit) {
    SecurityUtils.requireAdminRole();
    int capped = limit == null ? 80 : Math.max(1, Math.min(200, limit));

    List<Map<String, Object>> merged = new ArrayList<>();
    for (AuditLogEntity a : auditLogRepository.findTop200ByOrderByCreatedAtDesc()) {
      merged.add(toPlatformItem(a));
    }
    for (PayoutAuditLogEntity p : payoutAuditLogRepository.findTop200ByOrderByCreatedAtDesc()) {
      merged.add(toPayoutItem(p));
    }
    merged.sort(
        Comparator.comparing(
            (Map<String, Object> m) -> String.valueOf(m.getOrDefault("createdAt", "")),
            Comparator.reverseOrder()));
    if (merged.size() > capped) {
      merged = merged.subList(0, capped);
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("logs", merged);
    return body;
  }

  private Map<String, Object> toPlatformItem(AuditLogEntity a) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", a.getId());
    m.put("actorUserId", a.getActorUserId());
    enrichActor(m, a.getActorUserId());
    m.put("action", a.getAction());
    m.put("entityType", a.getEntityType());
    m.put("entityId", a.getEntityId());
    m.put("detail", a.getDetail());
    m.put("createdAt", a.getCreatedAt() != null ? a.getCreatedAt().toString() : null);
    m.put("source", "platform");
    return m;
  }

  private Map<String, Object> toPayoutItem(PayoutAuditLogEntity p) {
    Map<String, Object> m = new LinkedHashMap<>();
    long syntheticId = (p.getId() == null ? 0L : p.getId()) + 1_000_000_000L;
    m.put("id", syntheticId);
    m.put("actorUserId", p.getPerformedBy());
    enrichActor(m, p.getPerformedBy());
    m.put("action", "payout_" + (p.getAction() == null ? "unknown" : p.getAction()));
    m.put("entityType", "payout");
    m.put("entityId", p.getPayoutId() == null ? null : String.valueOf(p.getPayoutId()));
    m.put("detail", p.getMetadata());
    m.put("createdAt", p.getCreatedAt() != null ? p.getCreatedAt().toString() : null);
    m.put("source", "payout");
    return m;
  }

  private void enrichActor(Map<String, Object> m, Long actorId) {
    if (actorId == null) {
      m.put("actorName", null);
      m.put("actorEmail", null);
      return;
    }
    UserEntity u = userRepository.findById(actorId).orElse(null);
    m.put("actorName", u != null ? u.getName() : null);
    m.put("actorEmail", u != null ? u.getEmail() : null);
  }
}
