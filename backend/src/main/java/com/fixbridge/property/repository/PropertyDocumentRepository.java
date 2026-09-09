package com.fixbridge.property.repository;

import com.fixbridge.property.entity.PropertyDocumentEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PropertyDocumentRepository extends JpaRepository<PropertyDocumentEntity, Long> {

  List<PropertyDocumentEntity> findByPropertyIdAndOwnerUserIdOrderByCreatedAtDesc(
      Long propertyId, Long ownerUserId);

  long countByPropertyId(Long propertyId);

  Optional<PropertyDocumentEntity> findByIdAndPropertyIdAndOwnerUserId(
      Long id, Long propertyId, Long ownerUserId);
}
