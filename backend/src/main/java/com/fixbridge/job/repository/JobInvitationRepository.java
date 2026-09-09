package com.fixbridge.job.repository;

import com.fixbridge.job.entity.JobInvitationEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface JobInvitationRepository extends JpaRepository<JobInvitationEntity, Long> {

  Optional<JobInvitationEntity> findByIdAndContractorUserId(Long id, Long contractorUserId);

  Optional<JobInvitationEntity> findByJobIdAndContractorUserId(Long jobId, Long contractorUserId);

  List<JobInvitationEntity> findByContractorUserIdOrderByCreatedAtDesc(Long contractorUserId);

  @Query("""
      SELECT i.contractorUserId FROM JobInvitationEntity i
      WHERE i.jobId = :jobId
      """)
  List<Long> findContractorIdsByJobId(@Param("jobId") Long jobId);

  boolean existsByJobIdAndContractorUserId(Long jobId, Long contractorUserId);
}
