package com.fixbridge.dispute.repository;

import com.fixbridge.dispute.entity.DisputeEntity;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DisputeRepository extends JpaRepository<DisputeEntity, Long> {

  List<DisputeEntity> findByJobIdOrderByCreatedAtDesc(Long jobId);

  Optional<DisputeEntity> findFirstByJobIdAndStatusNotInOrderByCreatedAtDesc(
      Long jobId, Collection<String> statuses);

  List<DisputeEntity> findTop200ByOrderByCreatedAtDesc();
}
