package com.fixbridge.dispatch.controller;

import com.fixbridge.job.dto.request.InvitationRespondRequest;
import com.fixbridge.dispatch.service.ContractorOpsService;
import com.fixbridge.payout.service.PayoutOpsService;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/contractor")
@PreAuthorize("hasRole('CONTRACTOR')")
public class ContractorController {

  private final ContractorOpsService contractorOpsService;
  private final PayoutOpsService payoutOpsService;

  public ContractorController(
      ContractorOpsService contractorOpsService, PayoutOpsService payoutOpsService) {
    this.contractorOpsService = contractorOpsService;
    this.payoutOpsService = payoutOpsService;
  }

  @GetMapping("/invitations")
  public Map<String, Object> invitations() {
    return contractorOpsService.listInvitations();
  }

  @PostMapping("/invitations/{id}/respond")
  public Map<String, Object> respond(
      @PathVariable Long id, @RequestBody(required = false) InvitationRespondRequest request) {
    return contractorOpsService.respond(id, request);
  }

  @PostMapping("/managed/jobs/{id}/mark-travel")
  public Map<String, Object> markTravel(@PathVariable Long id) {
    return contractorOpsService.markTravel(id);
  }

  @PostMapping("/managed/jobs/{id}/mark-arrived")
  public Map<String, Object> markArrived(@PathVariable Long id) {
    return contractorOpsService.markArrived(id);
  }

  @PostMapping("/managed/jobs/{id}/mark-started")
  public Map<String, Object> markStarted(@PathVariable Long id) {
    return contractorOpsService.markStarted(id);
  }

  @GetMapping("/performance")
  public Map<String, Object> performance() {
    return contractorOpsService.performance();
  }

  @GetMapping("/payouts")
  public Map<String, Object> payouts() {
    return payoutOpsService.listContractorPayouts();
  }

  @GetMapping("/payout-account")
  public Map<String, Object> payoutAccount() {
    return payoutOpsService.contractorPayoutAccount();
  }
}
