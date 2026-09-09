package com.fixbridge.admin.repository;

import com.fixbridge.admin.entity.ReferralCreditEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReferralCreditRepository extends JpaRepository<ReferralCreditEntity, Long> {

  List<ReferralCreditEntity> findByUserIdOrderByCreatedAtDesc(Long userId);
}
