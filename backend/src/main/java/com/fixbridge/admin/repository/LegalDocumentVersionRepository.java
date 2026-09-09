package com.fixbridge.admin.repository;

import com.fixbridge.admin.entity.LegalDocumentVersionEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LegalDocumentVersionRepository extends JpaRepository<LegalDocumentVersionEntity, Long> {

  List<LegalDocumentVersionEntity> findByStatusIgnoreCaseOrderByEffectiveDateDesc(String status);

  Optional<LegalDocumentVersionEntity> findFirstByDocumentKeyIgnoreCaseAndStatusIgnoreCaseOrderByEffectiveDateDesc(
      String documentKey, String status);
}
