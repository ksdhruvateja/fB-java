package com.fixbridge.job.repository;

import com.fixbridge.job.entity.ManagedJobEntity;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ManagedJobRepository extends JpaRepository<ManagedJobEntity, Long> {

  List<ManagedJobEntity> findByHomeownerUserIdOrderByCreatedAtDesc(Long homeownerUserId);

  Optional<ManagedJobEntity> findByIdAndAssignedContractorUserId(Long id, Long assignedContractorUserId);

  List<ManagedJobEntity> findAllByOrderByCreatedAtDesc();

  @Query("""
      SELECT j FROM ManagedJobEntity j
      WHERE j.assignedContractorUserId = :contractorId
      ORDER BY j.createdAt DESC
      """)
  List<ManagedJobEntity> findAssignedToContractor(@Param("contractorId") Long contractorId);

  @Query("""
      SELECT j FROM ManagedJobEntity j
      WHERE LOWER(j.status) NOT IN ('closed', 'canceled', 'cancelled', 'refunded')
      """)
  List<ManagedJobEntity> findForWorkQueue();

  long countByAssignedContractorUserIdAndStatusIn(Long contractorUserId, Collection<String> statuses);

  long countByAssignedEmployeeIdAndStatusIn(Long employeeId, Collection<String> statuses);

  long countByHomeownerUserIdAndDiscountCodeIgnoreCaseAndCouponRedeemedAtIsNotNull(
      Long homeownerUserId, String discountCode);

  @Query("""
      SELECT j FROM ManagedJobEntity j
      WHERE LOWER(j.bookingId) LIKE LOWER(CONCAT('%', :q, '%'))
         OR LOWER(COALESCE(j.title, '')) LIKE LOWER(CONCAT('%', :q, '%'))
         OR LOWER(COALESCE(j.category, '')) LIKE LOWER(CONCAT('%', :q, '%'))
         OR CAST(j.id AS string) LIKE CONCAT('%', :q, '%')
      ORDER BY j.createdAt DESC
      """)
  List<ManagedJobEntity> searchAdmin(@Param("q") String q);

  @Query("""
      SELECT COUNT(j) FROM ManagedJobEntity j
      WHERE j.homeownerUserId = :userId
        AND LOWER(j.discountCode) = LOWER(:code)
        AND j.couponRedeemedAt IS NOT NULL
      """)
  long countRedeemedByUserAndCode(@Param("userId") Long userId, @Param("code") String code);
}
