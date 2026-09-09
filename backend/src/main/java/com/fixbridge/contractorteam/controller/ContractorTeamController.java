package com.fixbridge.contractorteam.controller;

import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import com.fixbridge.contractorteam.service.AvailabilityService;
import com.fixbridge.contractorteam.service.ContractorEmployeeService;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ContractorTeamController {

  private final ContractorEmployeeService employeeService;
  private final AvailabilityService availabilityService;

  public ContractorTeamController(
      ContractorEmployeeService employeeService, AvailabilityService availabilityService) {
    this.employeeService = employeeService;
    this.availabilityService = availabilityService;
  }

  @GetMapping("/contractor/employees")
  @PreAuthorize("hasRole('CONTRACTOR')")
  public Map<String, Object> listEmployees() {
    SecurityUtils.requireContractorRole();
    return employeeService.listForContractor(SecurityUtils.requireUserId());
  }

  @PostMapping("/contractor/employees")
  @PreAuthorize("hasRole('CONTRACTOR')")
  public Map<String, Object> createEmployee(@RequestBody(required = false) Map<String, Object> body) {
    return employeeService.create(body != null ? body : Map.of());
  }

  @GetMapping("/contractor/employees/{id}")
  @PreAuthorize("hasRole('CONTRACTOR')")
  public Map<String, Object> getEmployee(@PathVariable Long id) {
    return employeeService.getOne(id);
  }

  @PutMapping("/contractor/employees/{id}")
  @PreAuthorize("hasRole('CONTRACTOR')")
  public Map<String, Object> updateEmployee(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return employeeService.update(id, body != null ? body : Map.of());
  }

  @PostMapping("/contractor/managed/jobs/{id}/assign-technician")
  @PreAuthorize("hasRole('CONTRACTOR')")
  public Map<String, Object> assignTechnician(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    Long employeeId = null;
    if (body != null && body.get("employeeId") != null) {
      try {
        employeeId = Long.parseLong(String.valueOf(body.get("employeeId")));
      } catch (Exception ignored) {
        employeeId = null;
      }
    }
    return employeeService.assignTechnician(id, employeeId);
  }

  @GetMapping("/admin/contractors/{contractorId}/employees")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminEmployees(@PathVariable Long contractorId) {
    SecurityUtils.requireAdminRole();
    return employeeService.listForContractor(contractorId);
  }

  @GetMapping("/contractor/availability")
  @PreAuthorize("hasRole('CONTRACTOR')")
  public Map<String, Object> getAvailability() {
    SecurityUtils.requireContractorRole();
    return availabilityService.getContractorAvailability(SecurityUtils.requireUserId());
  }

  @PutMapping("/contractor/availability")
  @PreAuthorize("hasRole('CONTRACTOR')")
  public Map<String, Object> putAvailability(@RequestBody(required = false) Map<String, Object> body) {
    return availabilityService.putContractorAvailability(body != null ? body : Map.of());
  }

  @GetMapping("/admin/dispatch/availability")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> dispatchAvailability(
      @RequestParam Long contractorUserId,
      @RequestParam(required = false) Long employeeId) {
    return availabilityService.adminDispatchAvailability(contractorUserId, employeeId);
  }
}
