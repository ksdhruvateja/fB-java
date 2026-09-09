package com.fixbridge.job.controller;

import com.fixbridge.job.dto.request.CancelJobRequest;
import com.fixbridge.job.dto.request.HomeownerUpdateRequest;
import com.fixbridge.job.dto.request.ManagedJobCreateRequest;
import com.fixbridge.job.dto.response.ManagedJobDto;
import com.fixbridge.job.service.AssessmentService;
import com.fixbridge.changeorder.service.ChangeOrderService;
import com.fixbridge.dispute.service.DisputeOpsService;
import com.fixbridge.job.service.ManagedJobService;
import com.fixbridge.quote.service.QuoteService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/managed/jobs")
public class ManagedJobController {

  private final ManagedJobService managedJobService;
  private final AssessmentService assessmentService;
  private final QuoteService quoteService;
  private final ChangeOrderService changeOrderService;
  private final DisputeOpsService disputeOpsService;

  public ManagedJobController(
      ManagedJobService managedJobService,
      AssessmentService assessmentService,
      QuoteService quoteService,
      ChangeOrderService changeOrderService,
      DisputeOpsService disputeOpsService) {
    this.managedJobService = managedJobService;
    this.assessmentService = assessmentService;
    this.quoteService = quoteService;
    this.changeOrderService = changeOrderService;
    this.disputeOpsService = disputeOpsService;
  }

  @PostMapping
  public Map<String, Object> create(@RequestBody ManagedJobCreateRequest request) {
    ManagedJobDto job = managedJobService.create(request);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("job", job);
    return body;
  }

  @GetMapping("/my")
  public Map<String, Object> myJobs() {
    List<ManagedJobDto> jobs = managedJobService.listMine();
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("jobs", jobs);
    return body;
  }

  @GetMapping("/{id}")
  public Map<String, Object> get(@PathVariable Long id) {
    ManagedJobDto job = managedJobService.getById(id);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("job", job);
    return body;
  }

  @PutMapping("/{id}/homeowner-update")
  public Map<String, Object> homeownerUpdate(
      @PathVariable Long id, @RequestBody(required = false) HomeownerUpdateRequest request) {
    ManagedJobDto job = managedJobService.homeownerUpdate(id, request);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("job", job);
    return body;
  }

  @PostMapping("/{id}/cancel")
  public Map<String, Object> cancel(
      @PathVariable Long id, @RequestBody(required = false) CancelJobRequest request) {
    return managedJobService.cancel(id, request);
  }

  @DeleteMapping("/{id}")
  public Map<String, Object> delete(@PathVariable Long id) {
    return managedJobService.deleteJob(id);
  }

  @PostMapping("/{id}/request-professional")
  public Map<String, Object> requestProfessional(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return managedJobService.requestProfessional(id, body);
  }

  @GetMapping("/{id}/dispatch-pricing")
  public Map<String, Object> dispatchPricing(@PathVariable Long id) {
    return managedJobService.dispatchPricing(id);
  }

  @PostMapping("/{id}/complete")
  public Map<String, Object> complete(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return managedJobService.complete(id, body);
  }

  @PostMapping("/{id}/confirm-completion")
  public Map<String, Object> confirmCompletion(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return managedJobService.confirmCompletion(id, body);
  }

  @PostMapping("/{id}/report-problem")
  public Map<String, Object> reportProblem(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return disputeOpsService.reportProblem(id, body);
  }

  @PostMapping("/{id}/dispute")
  public Map<String, Object> openDispute(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return disputeOpsService.reportProblem(id, body);
  }

  @GetMapping("/{id}/dispute")
  public Map<String, Object> getDispute(@PathVariable Long id) {
    return disputeOpsService.getJobDispute(id);
  }

  @PostMapping("/{id}/assess")
  public ResponseEntity<Map<String, Object>> assess(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return assessmentService.startAssessment(id, body);
  }

  @GetMapping("/{id}/assessment-status")
  public Map<String, Object> assessmentStatus(@PathVariable Long id) {
    return assessmentService.assessmentStatus(id);
  }

  @GetMapping("/{id}/proposal")
  public Map<String, Object> proposal(@PathVariable Long id) {
    return quoteService.getProposal(id);
  }

  @GetMapping("/{id}/quote-options")
  public Map<String, Object> quoteOptions(@PathVariable Long id) {
    return quoteService.getQuoteOptions(id);
  }

  @PostMapping("/{id}/approve-proposal")
  public Map<String, Object> approveProposal(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return quoteService.approveProposal(id, body);
  }

  @GetMapping("/{id}/change-orders")
  public Map<String, Object> listChangeOrders(@PathVariable Long id) {
    return changeOrderService.list(id);
  }

  @PostMapping("/{id}/change-orders")
  public Map<String, Object> createChangeOrder(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return changeOrderService.create(id, body);
  }

  @PostMapping("/{id}/change-orders/{coId}/approve")
  public Map<String, Object> approveChangeOrder(@PathVariable Long id, @PathVariable Long coId) {
    return changeOrderService.approve(id, coId);
  }
}
