package com.fixbridge.quote.repository;

import com.fixbridge.quote.entity.ProposalEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProposalRepository extends JpaRepository<ProposalEntity, Long> {

  Optional<ProposalEntity> findFirstByJobIdOrderByCreatedAtDesc(Long jobId);

  List<ProposalEntity> findByJobIdOrderByCreatedAtDesc(Long jobId);

  Optional<ProposalEntity> findByQuoteNumberIgnoreCase(String quoteNumber);

  List<ProposalEntity> findTop100ByOrderByCreatedAtDesc();

  @Query("""
      SELECT p FROM ProposalEntity p
      WHERE p.jobId = :jobId
        AND LOWER(p.status) IN ('sent','viewed','accepted','approved')
      ORDER BY p.quoteOptionLabel ASC, p.publishedAt DESC
      """)
  List<ProposalEntity> findQuoteOptions(@Param("jobId") Long jobId);

  @Query("""
      SELECT p FROM ProposalEntity p
      WHERE p.jobId = :jobId
        AND LOWER(p.status) IN ('sent','viewed')
      ORDER BY p.publishedAt DESC, p.createdAt DESC
      """)
  List<ProposalEntity> findActiveForApproval(@Param("jobId") Long jobId);

  List<ProposalEntity> findByJobIdAndOptionGroupAndIdNotAndStatusIn(
      Long jobId, String optionGroup, Long id, List<String> statuses);
}
