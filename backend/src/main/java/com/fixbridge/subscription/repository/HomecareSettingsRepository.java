package com.fixbridge.subscription.repository;

import com.fixbridge.subscription.entity.HomecareSettingsEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HomecareSettingsRepository extends JpaRepository<HomecareSettingsEntity, String> {}
