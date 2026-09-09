package com.fixbridge.changeorder.repository;

import com.fixbridge.changeorder.entity.ChangeOrderEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChangeOrderRepository extends JpaRepository<ChangeOrderEntity, Long> {

  List<ChangeOrderEntity> findByJobIdOrderByCreatedAtDesc(Long jobId);

  Optional<ChangeOrderEntity> findByIdAndJobId(Long id, Long jobId);
}
