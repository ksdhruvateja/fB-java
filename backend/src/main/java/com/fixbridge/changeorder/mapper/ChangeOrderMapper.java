package com.fixbridge.changeorder.mapper;

import com.fixbridge.changeorder.entity.ChangeOrderEntity;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class ChangeOrderMapper {

  public Map<String, Object> toDto(ChangeOrderEntity row, String role) {
    Map<String, Object> base = new LinkedHashMap<>();
    base.put("id", row.getId());
    base.put("jobId", row.getJobId());
    base.put("description", row.getDescription());
    base.put("status", row.getStatus());
    base.put("createdAt", row.getCreatedAt());
    base.put("approvedAt", row.getApprovedAt());
    if ("admin".equals(role) || "contractor".equals(role)) {
      base.put("contractorNet", toNumber(row.getContractorNet()));
    }
    if ("admin".equals(role) || "homeowner".equals(role)) {
      base.put("retailAmount", toNumber(row.getRetailAmount()));
    }
    return base;
  }

  private static Double toNumber(BigDecimal value) {
    return value == null ? null : value.doubleValue();
  }
}
