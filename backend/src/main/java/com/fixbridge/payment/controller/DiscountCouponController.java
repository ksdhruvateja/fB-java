package com.fixbridge.payment.controller;

import com.fixbridge.payment.service.DiscountService;
import com.fixbridge.payment.service.JobTipService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DiscountCouponController {

  private final DiscountService discountService;
  private final JobTipService jobTipService;

  public DiscountCouponController(DiscountService discountService, JobTipService jobTipService) {
    this.discountService = discountService;
    this.jobTipService = jobTipService;
  }

  @GetMapping("/api/discounts/lookup")
  public Map<String, Object> lookup(@RequestParam(required = false) String code) {
    return discountService.lookupPublic(code);
  }

  @PostMapping("/api/managed/jobs/{id}/apply-coupon")
  public Map<String, Object> applyCoupon(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return discountService.applyCouponToJob(id, body);
  }

  @PostMapping("/api/managed/jobs/{id}/clear-coupon")
  public Map<String, Object> clearCoupon(@PathVariable Long id) {
    return discountService.clearCouponFromJob(id);
  }

  @PostMapping("/api/managed/jobs/{id}/tips")
  public Map<String, Object> tipCheckout(
      @PathVariable Long id,
      @RequestBody(required = false) Map<String, Object> body,
      HttpServletRequest request) {
    String origin = request.getHeader("Origin");
    if (origin == null || origin.isBlank()) {
      origin = request.getHeader("Referer");
    }
    return jobTipService.createTipCheckout(id, body, origin);
  }
}
