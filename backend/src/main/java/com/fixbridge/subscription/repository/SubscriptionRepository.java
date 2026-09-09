package com.fixbridge.subscription.repository;

import com.fixbridge.subscription.entity.SubscriptionEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SubscriptionRepository extends JpaRepository<SubscriptionEntity, Long> {

  List<SubscriptionEntity> findByUserIdOrderByCreatedAtDesc(Long userId);

  @Query("""
      SELECT s FROM SubscriptionEntity s
      WHERE s.userId = :userId
        AND LOWER(s.planCode) IN :planCodes
      ORDER BY s.createdAt DESC
      """)
  List<SubscriptionEntity> findHomeCareByUser(
      @Param("userId") Long userId, @Param("planCodes") List<String> planCodes);

  Optional<SubscriptionEntity> findFirstByUserIdAndPlanCodeInOrderByCreatedAtDesc(
      Long userId, List<String> planCodes);
}
