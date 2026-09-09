package com.fixbridge.admin.repository;

import com.fixbridge.admin.entity.HomeownerAcceptanceEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HomeownerAcceptanceRepository extends JpaRepository<HomeownerAcceptanceEntity, Long> {

  List<HomeownerAcceptanceEntity> findByUserIdOrderByAcceptedAtDesc(Long userId);

  Optional<HomeownerAcceptanceEntity>
      findFirstByUserIdAndAcceptanceTypeIgnoreCaseAndAcceptedTrueOrderByAcceptedAtDesc(
          Long userId, String acceptanceType);

  boolean existsByUserIdAndAcceptanceTypeIgnoreCaseAndAcceptedTrue(Long userId, String acceptanceType);
}
