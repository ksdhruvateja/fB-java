package com.fixbridge.payment.repository;

import com.fixbridge.payment.entity.RefundEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RefundRepository extends JpaRepository<RefundEntity, Long> {

  Optional<RefundEntity> findFirstByIdempotencyKey(String idempotencyKey);

  List<RefundEntity> findByPaymentIdOrderByCreatedAtDesc(Long paymentId);
}
