package com.fixbridge.payment.repository;

import com.fixbridge.payment.entity.PaymentEntity;
import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentRepository extends JpaRepository<PaymentEntity, Long> {

  List<PaymentEntity> findTop100ByUserIdOrderByCreatedAtDesc(Long userId);

  Optional<PaymentEntity> findFirstByStripeSessionId(String stripeSessionId);

  List<PaymentEntity> findByJobIdOrderByCreatedAtDesc(Long jobId);

  List<PaymentEntity> findByJobIdAndStatusIn(Long jobId, Collection<String> statuses);

  @Query("""
      SELECT COALESCE(SUM(p.amount), 0) FROM PaymentEntity p
      WHERE p.jobId = :jobId AND p.status IN :statuses
      """)
  BigDecimal sumAmountByJobIdAndStatusIn(
      @Param("jobId") Long jobId, @Param("statuses") Collection<String> statuses);
}
