package com.fixbridge.notification.repository;

import com.fixbridge.notification.entity.NotificationEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<NotificationEntity, Long> {

  @Query("""
      SELECT n FROM NotificationEntity n
      WHERE n.userId = :userId AND n.archivedAt IS NULL
      ORDER BY n.createdAt DESC
      """)
  List<NotificationEntity> findActiveForUser(@Param("userId") Long userId, Pageable pageable);

  @Query("""
      SELECT n FROM NotificationEntity n
      WHERE n.userId = :userId AND n.archivedAt IS NULL
        AND (n.readFlag = false OR n.readFlag IS NULL) AND n.readAt IS NULL
      ORDER BY n.createdAt DESC
      """)
  List<NotificationEntity> findUnreadForUser(@Param("userId") Long userId, Pageable pageable);

  @Query("""
      SELECT n FROM NotificationEntity n
      WHERE n.userId = :userId AND n.archivedAt IS NOT NULL
      ORDER BY n.createdAt DESC
      """)
  List<NotificationEntity> findArchivedForUser(@Param("userId") Long userId, Pageable pageable);

  @Query("""
      SELECT COUNT(n) FROM NotificationEntity n
      WHERE n.userId = :userId AND n.archivedAt IS NULL
        AND (n.readFlag = false OR n.readFlag IS NULL) AND n.readAt IS NULL
      """)
  long countUnread(@Param("userId") Long userId);

  Optional<NotificationEntity> findByIdAndUserId(Long id, Long userId);

  @Modifying
  @Query("""
      UPDATE NotificationEntity n
      SET n.readFlag = true, n.readAt = COALESCE(n.readAt, CURRENT_TIMESTAMP)
      WHERE n.userId = :userId AND n.id = :id
      """)
  int markRead(@Param("userId") Long userId, @Param("id") Long id);

  @Modifying
  @Query("""
      UPDATE NotificationEntity n
      SET n.readFlag = true, n.readAt = COALESCE(n.readAt, CURRENT_TIMESTAMP)
      WHERE n.userId = :userId AND (n.readFlag = false OR n.readFlag IS NULL)
        AND n.archivedAt IS NULL
      """)
  int markAllRead(@Param("userId") Long userId);

  @Modifying
  @Query("""
      UPDATE NotificationEntity n
      SET n.archivedAt = CURRENT_TIMESTAMP, n.readFlag = true,
          n.readAt = COALESCE(n.readAt, CURRENT_TIMESTAMP)
      WHERE n.userId = :userId AND n.id = :id
      """)
  int archiveOne(@Param("userId") Long userId, @Param("id") Long id);

  @Modifying
  @Query("""
      UPDATE NotificationEntity n
      SET n.archivedAt = CURRENT_TIMESTAMP
      WHERE n.userId = :userId AND n.readFlag = true AND n.archivedAt IS NULL
      """)
  int archiveRead(@Param("userId") Long userId);
}
