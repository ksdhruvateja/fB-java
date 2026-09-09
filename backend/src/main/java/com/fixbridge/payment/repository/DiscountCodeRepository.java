package com.fixbridge.payment.repository;

import com.fixbridge.payment.entity.DiscountCodeEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DiscountCodeRepository extends JpaRepository<DiscountCodeEntity, Long> {

  @Query("""
      SELECT d FROM DiscountCodeEntity d
      WHERE LOWER(d.code) = LOWER(:code) AND d.deletedAt IS NULL
      """)
  Optional<DiscountCodeEntity> findActiveByCodeIgnoreCase(@Param("code") String code);

  @Query("""
      SELECT d FROM DiscountCodeEntity d
      WHERE d.deletedAt IS NULL
      ORDER BY d.createdAt DESC
      """)
  List<DiscountCodeEntity> findAllNotDeleted();
}
