package com.fixbridge.payment.controller;

import com.fixbridge.payment.service.PaymentService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PaymentController {

  private final PaymentService paymentService;

  public PaymentController(PaymentService paymentService) {
    this.paymentService = paymentService;
  }

  @GetMapping("/api/payments/mine")
  public Map<String, Object> mine() {
    return paymentService.listMine();
  }
}
