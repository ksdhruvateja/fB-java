package com.fixbridge.admin.repository;

import com.fixbridge.admin.entity.PartnerUserEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PartnerUserRepository extends JpaRepository<PartnerUserEntity, Long> {

  Optional<PartnerUserEntity> findByEmailIgnoreCase(String email);
}
