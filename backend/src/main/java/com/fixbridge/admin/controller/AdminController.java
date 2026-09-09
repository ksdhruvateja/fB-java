package com.fixbridge.admin.controller;

import com.fixbridge.job.dto.request.AssignContractorRequest;
import com.fixbridge.job.dto.request.InviteContractorRequest;
import com.fixbridge.admin.service.AdminDirectoryService;
import com.fixbridge.dispatch.service.AdminOpsService;
import com.fixbridge.admin.service.AuditService;
import com.fixbridge.payment.service.DiscountService;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

  private final AdminOpsService adminOpsService;
  private final AdminDirectoryService adminDirectoryService;
  private final AuditService auditService;
  private final DiscountService discountService;

  public AdminController(
      AdminOpsService adminOpsService,
      AdminDirectoryService adminDirectoryService,
      AuditService auditService,
      DiscountService discountService) {
    this.adminOpsService = adminOpsService;
    this.adminDirectoryService = adminDirectoryService;
    this.auditService = auditService;
    this.discountService = discountService;
  }

  @GetMapping("/verify")
  public Map<String, Object> verify() {
    return adminOpsService.verify();
  }

  @GetMapping("/work-queue")
  public Map<String, Object> workQueue() {
    return adminOpsService.workQueue();
  }

  @GetMapping("/managed/jobs")
  public Map<String, Object> listManagedJobs() {
    return adminOpsService.listManagedJobs();
  }

  @PostMapping("/managed/jobs/{id}/invite")
  public Map<String, Object> invite(
      @PathVariable Long id, @RequestBody(required = false) InviteContractorRequest request) {
    return adminOpsService.invite(id, request);
  }

  @PostMapping("/managed/jobs/{id}/assign")
  public Map<String, Object> assign(
      @PathVariable Long id, @RequestBody(required = false) AssignContractorRequest request) {
    return adminOpsService.assign(id, request);
  }

  @GetMapping("/users")
  public Map<String, Object> listUsers(
      @RequestParam(required = false) String role, @RequestParam(required = false) String q) {
    return adminDirectoryService.listUsers(role, q);
  }

  @GetMapping("/users/{id}")
  public Map<String, Object> getUser(@PathVariable Long id) {
    return adminDirectoryService.getUser(id);
  }

  @PutMapping("/users/{id}/block")
  public Map<String, Object> blockUser(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return adminDirectoryService.blockUser(id, body);
  }

  @GetMapping("/search")
  public Map<String, Object> search(@RequestParam(required = false) String q) {
    return adminDirectoryService.search(q);
  }

  @GetMapping("/staff")
  public Map<String, Object> listStaff() {
    return adminDirectoryService.listStaff();
  }

  @PostMapping("/staff/access")
  public Map<String, Object> staffAccess(@RequestBody(required = false) Map<String, Object> body) {
    return adminDirectoryService.setStaffAccess(body);
  }

  @GetMapping("/audit-logs")
  public Map<String, Object> auditLogs(@RequestParam(required = false) Integer limit) {
    return auditService.list(limit);
  }

  @GetMapping("/discounts")
  public Map<String, Object> listDiscounts() {
    return discountService.listAdmin();
  }

  @PostMapping("/discounts")
  public Map<String, Object> createDiscount(@RequestBody(required = false) Map<String, Object> body) {
    return discountService.createAdmin(body);
  }

  @PutMapping("/discounts/{id}")
  public Map<String, Object> updateDiscount(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return discountService.updateAdmin(id, body);
  }

  @DeleteMapping("/discounts/{id}")
  public Map<String, Object> deleteDiscount(@PathVariable Long id) {
    return discountService.deleteAdmin(id);
  }
}
