package com.fixbridge.dispute.repository;

import com.fixbridge.dispute.entity.DisputeEventEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DisputeEventRepository extends JpaRepository<DisputeEventEntity, Long> {

  List<DisputeEventEntity> findByDisputeIdOrderByCreatedAtAsc(Long disputeId);
}
