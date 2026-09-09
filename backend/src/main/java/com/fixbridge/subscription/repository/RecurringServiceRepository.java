package com.fixbridge.subscription.repository;

import com.fixbridge.subscription.entity.RecurringServiceEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.fixbridge.property.entity.PropertyEntity;
public interface RecurringServiceRepository extends JpaRepository<RecurringServiceEntity, Long> {

  Optional<RecurringServiceEntity> findByIdAndOwnerUserId(Long id, Long ownerUserId);

  @Query("""
      SELECT rs FROM RecurringServiceEntity rs, PropertyEntity p
      WHERE rs.propertyId = p.id
        AND p.ownerUserId = :ownerUserId
      ORDER BY rs.nextServiceDate ASC, rs.createdAt DESC
      """)
  List<RecurringServiceEntity> findVisibleToPropertyOwner(@Param("ownerUserId") Long ownerUserId);
}
