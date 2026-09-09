package com.fixbridge.property.repository;

import com.fixbridge.property.entity.PropertyEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PropertyRepository extends JpaRepository<PropertyEntity, Long> {

  List<PropertyEntity> findByOwnerUserIdOrderByCreatedAtAscIdAsc(Long ownerUserId);

  Optional<PropertyEntity> findByIdAndOwnerUserId(Long id, Long ownerUserId);

  long countByOwnerUserId(Long ownerUserId);

  Optional<PropertyEntity> findFirstByOwnerUserIdAndAddressLine1IgnoreCase(Long ownerUserId, String addressLine1);
}
