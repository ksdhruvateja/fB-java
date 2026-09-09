package com.fixbridge.changeorder.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.changeorder.entity.ChangeOrderEntity;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.changeorder.mapper.ChangeOrderMapper;
import com.fixbridge.changeorder.repository.ChangeOrderRepository;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.security.authorization.ManagedJobAccess;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class ChangeOrderService {

  private static final Set<String> APPROVABLE_STATUSES =
      Set.of("awaiting_customer", "sent_to_homeowner", "admin_reviewed");

  private final ManagedJobRepository managedJobRepository;
  private final ChangeOrderRepository changeOrderRepository;
  private final ChangeOrderMapper changeOrderMapper;
  private final ObjectMapper objectMapper;

  public ChangeOrderService(
      ManagedJobRepository managedJobRepository,
      ChangeOrderRepository changeOrderRepository,
      ChangeOrderMapper changeOrderMapper,
      ObjectMapper objectMapper) {
    this.managedJobRepository = managedJobRepository;
    this.changeOrderRepository = changeOrderRepository;
    this.changeOrderMapper = changeOrderMapper;
    this.objectMapper = objectMapper;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> list(Long jobId) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job = requireJob(jobId);
    assertReadAccess(job, principal);

    List<Map<String, Object>> changeOrders =
        changeOrderRepository.findByJobIdOrderByCreatedAtDesc(jobId).stream()
            .map(co -> changeOrderMapper.toDto(co, principal.getRole()))
            .toList();
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("changeOrders", changeOrders);
    return body;
  }

  @Transactional
  public Map<String, Object> create(Long jobId, Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job = requireJob(jobId);
    boolean isContractor =
        ManagedJobAccess.isAssignedContractor(principal, job.getAssignedContractorUserId());
    if (!isContractor && !ManagedJobAccess.isAdminRole(principal)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }

    String description = request == null ? null : stringVal(request.get("description"));
    BigDecimal net = request == null ? null : toMoney(request.get("contractorNet"));
    if (!StringUtils.hasText(description) || net == null || net.compareTo(BigDecimal.ZERO) <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "description and contractorNet required.");
    }

    ChangeOrderEntity co = new ChangeOrderEntity();
    co.setJobId(jobId);
    co.setContractorUserId(principal.getId());
    co.setDescription(clamp(description, 4000));
    co.setMediaDataUrl(request.get("mediaDataUrl") != null ? String.valueOf(request.get("mediaDataUrl")) : null);
    co.setContractorNet(net);
    co.setReason(
        request.get("reason") != null ? clamp(String.valueOf(request.get("reason")), 500) : null);
    co.setStatus("submitted");
    changeOrderRepository.save(co);

    job.setStatus("change_order_pending");
    managedJobRepository.save(job);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("changeOrder", changeOrderMapper.toDto(co, principal.getRole()));
    return body;
  }

  @Transactional
  public Map<String, Object> approve(Long jobId, Long coId) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job = requireJob(jobId);
    if (!(ManagedJobAccess.isAdminRole(principal)
        || ManagedJobAccess.isHomeownerOwner(principal, job.getHomeownerUserId()))) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }

    ChangeOrderEntity co =
        changeOrderRepository
            .findByIdAndJobId(coId, jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Change order not found."));

    String status = String.valueOf(co.getStatus() == null ? "" : co.getStatus()).toLowerCase(Locale.ROOT);
    if (!APPROVABLE_STATUSES.contains(status)) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "Change order cannot be approved in its current state.",
          "invalid_change_order_state");
    }

    ObjectNode snapshot = objectMapper.createObjectNode();
    snapshot.put("description", co.getDescription());
    if (co.getContractorNet() != null) {
      snapshot.put("contractor_net", co.getContractorNet());
    }
    if (co.getRetailAmount() != null) {
      snapshot.put("retail_amount", co.getRetailAmount());
    }
    snapshot.set("line_items", co.getLineItems() == null ? objectMapper.createArrayNode() : co.getLineItems());
    snapshot.put("reason", co.getReason());
    snapshot.put("approved_at", OffsetDateTime.now().toString());

    co.setStatus("approved");
    co.setApprovedAt(OffsetDateTime.now());
    co.setApprovedSnapshot(snapshot);
    changeOrderRepository.save(co);

    if ("change_order_pending".equalsIgnoreCase(job.getStatus())) {
      job.setStatus("work_started");
      managedJobRepository.save(job);
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("changeOrder", changeOrderMapper.toDto(co, principal.getRole()));
    return body;
  }

  private ManagedJobEntity requireJob(Long jobId) {
    return managedJobRepository
        .findById(jobId)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found."));
  }

  private static void assertReadAccess(ManagedJobEntity job, UserPrincipal principal) {
    boolean allowed =
        ManagedJobAccess.canReadManagedJob(job, principal, List.of());
    if (!allowed) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }
  }

  private static BigDecimal toMoney(Object value) {
    if (value == null) {
      return null;
    }
    try {
      return new BigDecimal(String.valueOf(value)).setScale(2, RoundingMode.HALF_UP);
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private static String stringVal(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private static String clamp(String value, int max) {
    String trimmed = value.trim();
    return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
  }
}
