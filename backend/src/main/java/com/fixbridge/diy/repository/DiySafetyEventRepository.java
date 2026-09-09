package com.fixbridge.diy.repository;

import com.fixbridge.diy.entity.DiySafetyEventEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DiySafetyEventRepository extends JpaRepository<DiySafetyEventEntity, Long> {}
