package com.fixbridge.subscription.repository;

import com.fixbridge.subscription.entity.SubscriptionPlanEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SubscriptionPlanRepository extends JpaRepository<SubscriptionPlanEntity, Long> {

  List<SubscriptionPlanEntity> findByActiveTrueOrderBySortOrderAscIdAsc();

  List<SubscriptionPlanEntity> findAllByOrderBySortOrderAscIdAsc();

  Optional<SubscriptionPlanEntity> findByCodeIgnoreCase(String code);

  boolean existsByCodeIgnoreCase(String code);
}
