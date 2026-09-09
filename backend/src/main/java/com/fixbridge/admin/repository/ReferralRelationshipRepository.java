package com.fixbridge.admin.repository;

import com.fixbridge.admin.entity.ReferralRelationshipEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReferralRelationshipRepository extends JpaRepository<ReferralRelationshipEntity, Long> {

  Optional<ReferralRelationshipEntity> findByReferredUserId(Long referredUserId);

  List<ReferralRelationshipEntity> findByReferrerUserIdOrderByCreatedAtDesc(Long referrerUserId);

  @Query("""
      SELECT r FROM ReferralRelationshipEntity r
      WHERE (:type IS NULL OR r.type = :type)
        AND (:status IS NULL OR r.status = :status)
      ORDER BY r.createdAt DESC
      """)
  List<ReferralRelationshipEntity> findAdminFiltered(
      @Param("type") String type, @Param("status") String status);
}
