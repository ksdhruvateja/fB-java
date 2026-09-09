package com.fixbridge.job.repository;

import com.fixbridge.job.entity.BidEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BidRepository extends JpaRepository<BidEntity, Long> {

  Optional<BidEntity> findByIdAndJobId(Long id, Long jobId);

  List<BidEntity> findByJobIdOrderByCreatedAtDesc(Long jobId);
}
