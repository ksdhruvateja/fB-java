package com.fixbridge.payment.controller;

import com.fixbridge.payment.service.CheckoutService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/managed/jobs")
public class CheckoutController {

  private final CheckoutService checkoutService;

  public CheckoutController(CheckoutService checkoutService) {
    this.checkoutService = checkoutService;
  }

  @PostMapping("/{id}/prepare-checkout")
  public Map<String, Object> prepareCheckout(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return checkoutService.prepareCheckout(id, body);
  }

  @PostMapping("/{id}/pay-dispatch")
  public Map<String, Object> payDispatch(
      @PathVariable Long id,
      @RequestBody(required = false) Map<String, Object> body,
      HttpServletRequest request) {
    String origin = request.getHeader("Origin");
    if (origin == null || origin.isBlank()) {
      origin = request.getHeader("Referer");
    }
    return checkoutService.payDispatch(id, body, origin);
  }
}
