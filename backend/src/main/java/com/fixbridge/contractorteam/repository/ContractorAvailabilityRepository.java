package com.fixbridge.contractorteam.repository;

import com.fixbridge.contractorteam.entity.ContractorAvailabilityEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContractorAvailabilityRepository
    extends JpaRepository<ContractorAvailabilityEntity, Long> {}
