package com.fixbridge.diy.repository;

import com.fixbridge.diy.entity.DiyProjectEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DiyProjectRepository extends JpaRepository<DiyProjectEntity, Long> {

  List<DiyProjectEntity> findByUserIdOrderByUpdatedAtDesc(Long userId);

  Optional<DiyProjectEntity> findByIdAndUserId(Long id, Long userId);
}
