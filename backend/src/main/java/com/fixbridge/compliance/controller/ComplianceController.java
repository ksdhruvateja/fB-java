package com.fixbridge.compliance.controller;

import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import com.fixbridge.compliance.service.ContractorComplianceService;
import com.fixbridge.compliance.enums.ComplianceConstants;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ComplianceController {

  private final ContractorComplianceService complianceService;

  public ComplianceController(ContractorComplianceService complianceService) {
    this.complianceService = complianceService;
  }

  @GetMapping("/contractor/compliance/summary")
  @PreAuthorize("hasRole('CONTRACTOR')")
  public Map<String, Object> contractorSummary() {
    SecurityUtils.requireContractorRole();
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("summary", complianceService.getSummary(principal.getId()));
    return body;
  }

  @GetMapping("/contractor/compliance/documents/{type}/file")
  @PreAuthorize("hasRole('CONTRACTOR')")
  public Map<String, Object> contractorFile(@PathVariable String type) {
    SecurityUtils.requireContractorRole();
    return complianceService.getDocumentFile(SecurityUtils.requireUserId(), type, null);
  }

  @PostMapping("/contractor/compliance/documents/{type}")
  @PreAuthorize("hasRole('CONTRACTOR')")
  public Map<String, Object> upload(
      @PathVariable String type, @RequestBody(required = false) Map<String, Object> body) {
    SecurityUtils.requireContractorRole();
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    Map<String, Object> req = body != null ? body : Map.of();
    String fileName =
        req.get("fileName") != null
            ? String.valueOf(req.get("fileName"))
            : (req.get("name") != null ? String.valueOf(req.get("name")) : null);
    String fileData =
        req.get("fileData") != null
            ? String.valueOf(req.get("fileData"))
            : (req.get("data") != null ? String.valueOf(req.get("data")) : null);
    LocalDate issueDate = parseDate(req.get("issueDate"));
    LocalDate expirationDate = parseDate(req.get("expirationDate"));
    boolean uploadLater = Boolean.TRUE.equals(req.get("uploadLater"));
    return complianceService.uploadDocument(
        principal.getId(),
        type,
        fileName,
        fileData,
        issueDate,
        expirationDate,
        uploadLater,
        principal.getId());
  }

  @GetMapping("/admin/contractors/{id}/compliance")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminSummary(@PathVariable Long id) {
    SecurityUtils.requireAdminRole();
    Map<String, Object> summary = complianceService.getSummary(id);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("summary", summary);
    body.put("certificateHolder", ComplianceConstants.COI_CERTIFICATE_HOLDER);
    body.put("legalNoticeAddress", ComplianceConstants.COI_LEGAL_NOTICE_ADDRESS);
    body.put("documentTypes", ComplianceConstants.DOCUMENT_TYPES);
    return body;
  }

  @GetMapping("/admin/contractors/{id}/compliance/documents/{type}/history")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminHistory(@PathVariable Long id, @PathVariable String type) {
    SecurityUtils.requireAdminRole();
    return complianceService.getHistory(id, type);
  }

  @GetMapping("/admin/contractors/{id}/compliance/documents/{type}/file")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminFile(
      @PathVariable Long id,
      @PathVariable String type,
      @RequestParam(required = false) Integer version) {
    SecurityUtils.requireAdminRole();
    return complianceService.getDocumentFile(id, type, version);
  }

  @PostMapping("/admin/contractors/{id}/compliance/documents/{type}/verify")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> verify(
      @PathVariable Long id,
      @PathVariable String type,
      @RequestBody(required = false) Map<String, Object> body) {
    SecurityUtils.requireAdminRole();
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    Map<String, Object> req = body != null ? body : Map.of();
    return complianceService.verifyDocument(
        id,
        type,
        principal.getId(),
        req.get("notes") != null ? String.valueOf(req.get("notes")) : null,
        parseDate(req.get("expirationDate")),
        parseDate(req.get("issueDate")),
        req.get("policyCarrier") != null ? String.valueOf(req.get("policyCarrier")) : null,
        req.get("policyNumber") != null ? String.valueOf(req.get("policyNumber")) : null);
  }

  @PostMapping("/admin/contractors/{id}/compliance/documents/{type}/reject")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> reject(
      @PathVariable Long id,
      @PathVariable String type,
      @RequestBody(required = false) Map<String, Object> body) {
    SecurityUtils.requireAdminRole();
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    String reason = body != null && body.get("reason") != null ? String.valueOf(body.get("reason")).trim() : "";
    return complianceService.rejectDocument(id, type, principal.getId(), reason);
  }

  @GetMapping("/admin/contractors/{id}/compliance/dispatch-checklist")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> dispatchChecklist(
      @PathVariable Long id,
      @RequestParam(required = false) String jobTier,
      @RequestParam(required = false) String tier) {
    SecurityUtils.requireAdminRole();
    return complianceService.dispatchChecklist(id, jobTier != null ? jobTier : tier);
  }

  @PostMapping("/admin/contractors/{id}/compliance/recalculate")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> recalculate(@PathVariable Long id) {
    SecurityUtils.requireAdminRole();
    return Map.of("ok", true, "summary", complianceService.recalculate(id));
  }

  private static LocalDate parseDate(Object value) {
    if (value == null) {
      return null;
    }
    String s = String.valueOf(value).trim();
    if (s.isEmpty()) {
      return null;
    }
    try {
      return LocalDate.parse(s.substring(0, Math.min(10, s.length())));
    } catch (Exception e) {
      return null;
    }
  }
}
