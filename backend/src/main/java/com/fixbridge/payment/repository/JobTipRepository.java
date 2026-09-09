package com.fixbridge.payment.repository;

import com.fixbridge.payment.entity.JobTipEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JobTipRepository extends JpaRepository<JobTipEntity, Long> {

  Optional<JobTipEntity> findFirstByJobIdOrderByCreatedAtDesc(Long jobId);

  Optional<JobTipEntity> findFirstByJobIdAndStatusOrderByCreatedAtDesc(Long jobId, String status);
}
