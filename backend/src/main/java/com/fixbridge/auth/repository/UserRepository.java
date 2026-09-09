package com.fixbridge.auth.repository;

import com.fixbridge.auth.entity.UserEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<UserEntity, Long> {

  List<UserEntity> findByRole(String role);

  @Query("SELECT u FROM UserEntity u WHERE u.role = :role AND LOWER(u.email) = LOWER(:email)")
  Optional<UserEntity> findByRoleAndEmailIgnoreCase(@Param("role") String role, @Param("email") String email);

  @Query("SELECT CASE WHEN COUNT(u) > 0 THEN true ELSE false END FROM UserEntity u WHERE u.role = :role AND LOWER(u.email) = LOWER(:email)")
  boolean existsByRoleAndEmailIgnoreCase(@Param("role") String role, @Param("email") String email);

  boolean existsByReferralCodeIgnoreCase(String referralCode);

  Optional<UserEntity> findByReferralCodeIgnoreCase(String referralCode);

  Optional<UserEntity> findFirstByOauthGoogleSub(String oauthGoogleSub);

  @Query("""
      SELECT u FROM UserEntity u
      WHERE u.role <> :role AND LOWER(u.email) = LOWER(:email)
      ORDER BY u.id ASC
      """)
  Optional<UserEntity> findFirstByRoleNotAndEmailIgnoreCase(
      @Param("role") String role, @Param("email") String email);

  List<UserEntity> findByRoleOrderByCreatedAtDesc(String role);

  List<UserEntity> findAllByOrderByCreatedAtDesc();

  @Query("""
      SELECT u FROM UserEntity u
      WHERE (:role IS NULL OR u.role = :role)
        AND (
          :q IS NULL OR :q = ''
          OR LOWER(u.name) LIKE LOWER(CONCAT('%', :q, '%'))
          OR LOWER(u.email) LIKE LOWER(CONCAT('%', :q, '%'))
          OR CAST(u.id AS string) LIKE CONCAT('%', :q, '%')
        )
      ORDER BY u.createdAt DESC
      """)
  List<UserEntity> searchUsers(@Param("role") String role, @Param("q") String q);

  @Query("""
      SELECT u FROM UserEntity u
      WHERE u.role = 'admin'
      ORDER BY u.createdAt DESC
      """)
  List<UserEntity> findStaffAdmins();

  @Query("""
      SELECT COUNT(u) FROM UserEntity u
      WHERE u.role = :role AND u.adminRolePreset = :preset AND u.isBlocked = false
      """)
  long countActiveByRoleAndPreset(@Param("role") String role, @Param("preset") String preset);
}
