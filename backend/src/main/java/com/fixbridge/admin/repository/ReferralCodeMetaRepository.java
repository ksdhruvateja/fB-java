package com.fixbridge.admin.repository;

import com.fixbridge.admin.entity.ReferralCodeMetaEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReferralCodeMetaRepository extends JpaRepository<ReferralCodeMetaEntity, Long> {

  Optional<ReferralCodeMetaEntity> findByCodeIgnoreCase(String code);
}
