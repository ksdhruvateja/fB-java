package com.fixbridge.payout.repository;

import com.fixbridge.payout.entity.PayoutSettingsEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PayoutSettingsRepository extends JpaRepository<PayoutSettingsEntity, String> {}
