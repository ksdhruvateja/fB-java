package com.fixbridge.admin.controller;

import com.fixbridge.payment.service.AdminPaymentOpsService;
import com.fixbridge.quote.service.AdminQuoteWorkspaceService;
import com.fixbridge.dispute.service.DisputeOpsService;
import com.fixbridge.payout.service.PayoutOpsService;
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
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminFinanceController {

  private final AdminQuoteWorkspaceService adminQuoteWorkspaceService;
  private final PayoutOpsService payoutOpsService;
  private final DisputeOpsService disputeOpsService;
  private final AdminPaymentOpsService adminPaymentOpsService;

  public AdminFinanceController(
      AdminQuoteWorkspaceService adminQuoteWorkspaceService,
      PayoutOpsService payoutOpsService,
      DisputeOpsService disputeOpsService,
      AdminPaymentOpsService adminPaymentOpsService) {
    this.adminQuoteWorkspaceService = adminQuoteWorkspaceService;
    this.payoutOpsService = payoutOpsService;
    this.disputeOpsService = disputeOpsService;
    this.adminPaymentOpsService = adminPaymentOpsService;
  }

  @GetMapping("/quotes")
  public Map<String, Object> listQuotes(
      @RequestParam(required = false) String q, @RequestParam(required = false) String status) {
    return adminQuoteWorkspaceService.listQuotes(q, status);
  }

  @GetMapping("/quotes/{id}")
  public Map<String, Object> getQuote(@PathVariable String id) {
    return adminQuoteWorkspaceService.getQuote(id);
  }

  @PostMapping("/quotes/{id}/send")
  public Map<String, Object> sendQuote(@PathVariable String id) {
    return adminQuoteWorkspaceService.sendQuote(id);
  }

  @GetMapping("/managed/jobs/{id}/quote-builder")
  public Map<String, Object> quoteBuilder(
      @PathVariable Long id, @RequestParam(required = false) Long bidId) {
    return adminQuoteWorkspaceService.quoteBuilder(id, bidId);
  }

  @PostMapping("/managed/jobs/{id}/proposal")
  public Map<String, Object> createProposal(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return adminQuoteWorkspaceService.createOrUpdateProposal(id, body);
  }

  @GetMapping("/payouts")
  public Map<String, Object> listPayouts(@RequestParam(required = false) String status) {
    return payoutOpsService.listAdminPayouts(status);
  }

  @GetMapping("/payout-settings")
  public Map<String, Object> getPayoutSettings() {
    return payoutOpsService.getPayoutSettings();
  }

  @PutMapping("/payout-settings")
  public Map<String, Object> updatePayoutSettings(
      @RequestBody(required = false) Map<String, Object> body) {
    return payoutOpsService.updatePayoutSettings(body);
  }

  @PostMapping("/payouts/{id}/approve")
  public Map<String, Object> approvePayout(@PathVariable Long id) {
    return payoutOpsService.approvePayout(id);
  }

  @PostMapping("/payouts/{id}/adjust")
  public Map<String, Object> adjustPayout(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return payoutOpsService.adjustPayout(id, body);
  }

  @GetMapping("/disputes")
  public Map<String, Object> listDisputes(@RequestParam(required = false) String status) {
    return disputeOpsService.listAdminDisputes(status);
  }

  @GetMapping("/disputes/{id}")
  public Map<String, Object> getDispute(@PathVariable Long id) {
    return disputeOpsService.getAdminDispute(id);
  }

  @PostMapping("/disputes/{id}/actions")
  public Map<String, Object> disputeAction(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return disputeOpsService.adminAction(id, body);
  }

  @PostMapping("/payments/{id}/refund")
  public Map<String, Object> refund(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return adminPaymentOpsService.refundPayment(id, body);
  }

  @PostMapping("/payments/manual")
  public Map<String, Object> manualPayment(@RequestBody(required = false) Map<String, Object> body) {
    return adminPaymentOpsService.createManualPayment(body);
  }
}
