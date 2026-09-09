package com.fixbridge.admin.repository;

import com.fixbridge.admin.entity.PartnerEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PartnerRepository extends JpaRepository<PartnerEntity, Long> {

  List<PartnerEntity> findByDeletedAtIsNullOrderByCreatedAtDesc();

  Optional<PartnerEntity> findByCodeIgnoreCaseAndDeletedAtIsNullAndActiveTrue(String code);

  Optional<PartnerEntity> findByCodeIgnoreCase(String code);

  boolean existsByCodeIgnoreCase(String code);
}
