package com.fixbridge.compliance.repository;

import com.fixbridge.compliance.entity.ContractorComplianceDocumentEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContractorComplianceDocumentRepository
    extends JpaRepository<ContractorComplianceDocumentEntity, Long> {

  List<ContractorComplianceDocumentEntity> findByContractorUserIdAndCurrentTrueOrderByDocumentTypeAsc(
      Long contractorUserId);

  Optional<ContractorComplianceDocumentEntity>
      findByContractorUserIdAndDocumentTypeAndCurrentTrue(Long contractorUserId, String documentType);

  Optional<ContractorComplianceDocumentEntity>
      findByContractorUserIdAndDocumentTypeAndVersion(
          Long contractorUserId, String documentType, Integer version);

  List<ContractorComplianceDocumentEntity>
      findByContractorUserIdAndDocumentTypeOrderByVersionDescCreatedAtDesc(
          Long contractorUserId, String documentType);
}
