package com.fixbridge.admin.repository;

import com.fixbridge.admin.entity.AuditLogEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditLogRepository extends JpaRepository<AuditLogEntity, Long> {

  List<AuditLogEntity> findTop200ByOrderByCreatedAtDesc();
}
