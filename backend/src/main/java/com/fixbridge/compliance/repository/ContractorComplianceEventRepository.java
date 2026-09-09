package com.fixbridge.compliance.repository;

import com.fixbridge.compliance.entity.ContractorComplianceEventEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContractorComplianceEventRepository
    extends JpaRepository<ContractorComplianceEventEntity, Long> {}
