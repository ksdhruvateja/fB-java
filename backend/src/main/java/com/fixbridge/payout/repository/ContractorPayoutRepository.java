package com.fixbridge.payout.repository;

import com.fixbridge.payout.entity.ContractorPayoutEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContractorPayoutRepository extends JpaRepository<ContractorPayoutEntity, Long> {

  Optional<ContractorPayoutEntity> findByJobId(Long jobId);

  List<ContractorPayoutEntity> findByContractorIdOrderByCreatedAtDesc(Long contractorId);

  List<ContractorPayoutEntity> findTop200ByOrderByCreatedAtDesc();

  List<ContractorPayoutEntity> findByStatusOrderByCreatedAtDesc(String status);
}
