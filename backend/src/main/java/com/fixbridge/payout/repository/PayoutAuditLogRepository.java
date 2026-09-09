package com.fixbridge.payout.repository;

import com.fixbridge.payout.entity.PayoutAuditLogEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PayoutAuditLogRepository extends JpaRepository<PayoutAuditLogEntity, Long> {

  List<PayoutAuditLogEntity> findByPayoutIdOrderByCreatedAtAsc(Long payoutId);

  List<PayoutAuditLogEntity> findTop200ByOrderByCreatedAtDesc();
}
