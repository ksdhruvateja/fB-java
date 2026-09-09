package com.fixbridge.payment.repository;

import com.fixbridge.payment.entity.FinancialLedgerEventEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FinancialLedgerEventRepository extends JpaRepository<FinancialLedgerEventEntity, Long> {}
