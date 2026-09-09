package com.fixbridge.payment.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fixbridge.payment.entity.PaymentEntity;
import com.fixbridge.payment.repository.PaymentRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class PaymentService {

  private final PaymentRepository paymentRepository;

  public PaymentService(PaymentRepository paymentRepository) {
    this.paymentRepository = paymentRepository;
  }

  @Transactional
  public Map<String, Object> listMine() {
    Long userId = SecurityUtils.requireUserId();
    List<PaymentEntity> rows = paymentRepository.findTop100ByUserIdOrderByCreatedAtDesc(userId);
    List<Map<String, Object>> transactions = new ArrayList<>();
    for (PaymentEntity p : rows) {
      if (!StringUtils.hasText(p.getPublicId())) {
        String publicId = "TXN-" + String.format(Locale.ROOT, "%05d", p.getId());
        p.setPublicId(publicId);
        paymentRepository.save(p);
      }
      transactions.add(toTransaction(p));
    }
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("transactions", transactions);
    return body;
  }

  private static Map<String, Object> toTransaction(PaymentEntity p) {
    JsonNode meta = p.getMeta();
    String planCode = meta != null && meta.has("planCode") ? meta.path("planCode").asText(null) : null;
    String description = "Payment";
    String typeLabel = p.getPaymentType();
    String paymentType = p.getPaymentType() == null ? "" : p.getPaymentType();
    if ("subscription".equals(paymentType)) {
      description = planCode != null ? planCode : "Subscription";
      typeLabel = "Subscription Payment";
    } else if ("dispatch_fee".equals(paymentType)) {
      description = "Dispatch / visit fee";
      typeLabel = "Service Payment";
    } else if ("retail_payment".equals(paymentType) || "invoice_payment".equals(paymentType)) {
      description = "Service payment";
      typeLabel = "Service Payment";
    } else if ("tip".equals(paymentType)) {
      description = "Tip";
      typeLabel = "Tip";
    } else if (p.getStatus() != null && p.getStatus().contains("refund")) {
      typeLabel = "Refund";
    }

    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", p.getId());
    row.put("transactionId", p.getPublicId());
    row.put("paymentType", p.getPaymentType());
    row.put("typeLabel", typeLabel);
    row.put("description", description);
    row.put("amount", p.getAmount());
    row.put("currency", (p.getCurrency() == null ? "usd" : p.getCurrency()).toUpperCase(Locale.ROOT));
    row.put("status", p.getStatus());
    row.put("provider", p.getProvider() != null ? p.getProvider() : "stripe");
    row.put("jobId", p.getJobId());
    row.put("stripeSessionId", p.getStripeSessionId());
    row.put("stripePaymentIntent", p.getStripePaymentIntent());
    row.put("stripeSubscriptionId", p.getStripeSubscriptionId());
    row.put("planCode", planCode);
    row.put("createdAt", p.getCreatedAt());
    row.put("receiptUrl", null);
    return row;
  }
}
