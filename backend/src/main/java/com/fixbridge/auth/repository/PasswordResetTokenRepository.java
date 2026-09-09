package com.fixbridge.auth.repository;

import com.fixbridge.auth.entity.PasswordResetTokenEntity;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetTokenEntity, Long> {

  @Modifying(clearAutomatically = true)
  @Query("UPDATE PasswordResetTokenEntity t SET t.used = true WHERE LOWER(t.email) = LOWER(:email) AND t.role = :role AND t.used = false")
  int invalidateUnused(@Param("email") String email, @Param("role") String role);

  Optional<PasswordResetTokenEntity> findFirstByRoleAndTokenAndUsedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
      String role, String token, OffsetDateTime expiresAt);
}
