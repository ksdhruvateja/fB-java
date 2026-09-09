package com.fixbridge.auth.repository;

import com.fixbridge.auth.entity.MfaChallengeEntity;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MfaChallengeRepository extends JpaRepository<MfaChallengeEntity, Long> {

  Optional<MfaChallengeEntity> findFirstByUserIdAndConsumedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
      Long userId, OffsetDateTime now);
}
