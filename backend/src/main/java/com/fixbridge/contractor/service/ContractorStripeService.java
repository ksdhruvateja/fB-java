package com.fixbridge.contractor.service;

import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.payment.stripe.common.StripeService;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class ContractorStripeService {

  private final UserRepository userRepository;
  private final StripeService stripeService;

  public ContractorStripeService(UserRepository userRepository, StripeService stripeService) {
    this.userRepository = userRepository;
    this.stripeService = stripeService;
  }

  @Transactional
  public Map<String, Object> onboard() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    if (!"contractor".equals(principal.getRole())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Contractors only.");
    }

    UserEntity user =
        userRepository
            .findById(principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found."));

    stripeService.assertPaymentsAvailable();

    String accountId = user.getStripeAccountId();
    if (!StringUtils.hasText(accountId)) {
      accountId = stripeService.createExpressAccount(user.getEmail());
      user.setStripeAccountId(accountId);
      user.setStripeOnboardingStatus("pending");
      userRepository.save(user);
    }

    String url = stripeService.createConnectAccountLink(accountId, "/?stripe=refresh", "/?stripe=return");
    if (!StringUtils.hasText(url)) {
      throw new ApiException(HttpStatus.BAD_GATEWAY, "Could not create Stripe onboarding link.");
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("url", url);
    body.put("accountId", accountId);
    return body;
  }
}
