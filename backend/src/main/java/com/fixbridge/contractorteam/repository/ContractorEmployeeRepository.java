package com.fixbridge.contractorteam.repository;

import com.fixbridge.contractorteam.entity.ContractorEmployeeEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContractorEmployeeRepository extends JpaRepository<ContractorEmployeeEntity, Long> {

  List<ContractorEmployeeEntity> findByContractorUserIdOrderByActiveDescFullNameAsc(Long contractorUserId);

  Optional<ContractorEmployeeEntity> findByIdAndContractorUserId(Long id, Long contractorUserId);
}
