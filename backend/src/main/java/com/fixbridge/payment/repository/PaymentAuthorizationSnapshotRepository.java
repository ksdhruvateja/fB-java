package com.fixbridge.payment.repository;

import com.fixbridge.payment.entity.PaymentAuthorizationSnapshotEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentAuthorizationSnapshotRepository
    extends JpaRepository<PaymentAuthorizationSnapshotEntity, Long> {

  Optional<PaymentAuthorizationSnapshotEntity> findFirstByJobIdOrderByCreatedAtDesc(Long jobId);

  Optional<PaymentAuthorizationSnapshotEntity> findFirstByPaymentIdOrderByCreatedAtDesc(Long paymentId);
}
