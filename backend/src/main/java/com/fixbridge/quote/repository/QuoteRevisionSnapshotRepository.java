package com.fixbridge.quote.repository;

import com.fixbridge.quote.entity.QuoteRevisionSnapshotEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuoteRevisionSnapshotRepository extends JpaRepository<QuoteRevisionSnapshotEntity, Long> {

  List<QuoteRevisionSnapshotEntity> findByProposalIdOrderByVersionNumberAsc(Long proposalId);

  boolean existsByProposalIdAndVersionNumber(Long proposalId, Integer versionNumber);
}
