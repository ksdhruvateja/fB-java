package com.fixbridge.admin.controller;

import com.fixbridge.admin.service.PricingRulesService;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/pricing")
public class PricingRulesController {

  private final PricingRulesService pricingRulesService;

  public PricingRulesController(PricingRulesService pricingRulesService) {
    this.pricingRulesService = pricingRulesService;
  }

  @GetMapping("/rules")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> getRules() {
    return pricingRulesService.getRules();
  }

  @PutMapping("/rules")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> putRules(@RequestBody(required = false) Map<String, Object> body) {
    return pricingRulesService.putRules(body);
  }
}
