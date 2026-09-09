package com.fixbridge.contractor.controller;

import com.fixbridge.contractor.service.ContractorStripeService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ContractorStripeController {

  private final ContractorStripeService contractorStripeService;

  public ContractorStripeController(ContractorStripeService contractorStripeService) {
    this.contractorStripeService = contractorStripeService;
  }

  @PostMapping("/api/contractor/stripe/onboard")
  public Map<String, Object> onboard() {
    return contractorStripeService.onboard();
  }
}
