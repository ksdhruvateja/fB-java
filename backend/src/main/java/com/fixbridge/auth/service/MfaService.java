package com.fixbridge.auth.service;

import com.fixbridge.auth.dto.response.AuthResponse;
import com.fixbridge.auth.dto.response.UserDto;
import com.fixbridge.auth.entity.MfaChallengeEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.integration.email.MailResult;
import com.fixbridge.integration.email.MailService;
import com.fixbridge.auth.mapper.UserMapper;
import com.fixbridge.auth.repository.MfaChallengeRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.jwt.JwtService;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MfaService {

  private static final Logger log = LoggerFactory.getLogger(MfaService.class);

  private final MfaChallengeRepository mfaChallengeRepository;
  private final UserRepository userRepository;
  private final PasswordEncoder passwordEncoder;
  private final JwtService jwtService;
  private final UserMapper userMapper;
  private final MailService mailService;
  private final Environment environment;
  private final SecureRandom secureRandom = new SecureRandom();

  public MfaService(
      MfaChallengeRepository mfaChallengeRepository,
      UserRepository userRepository,
      PasswordEncoder passwordEncoder,
      JwtService jwtService,
      UserMapper userMapper,
      MailService mailService,
      Environment environment) {
    this.mfaChallengeRepository = mfaChallengeRepository;
    this.userRepository = userRepository;
    this.passwordEncoder = passwordEncoder;
    this.jwtService = jwtService;
    this.userMapper = userMapper;
    this.mailService = mailService;
    this.environment = environment;
  }

  @Transactional
  public Map<String, Object> start(boolean force) {
    UserPrincipal principal = requireMfaPending();
    if (!"admin".equals(principal.getRole()) && !force) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Admin MFA only in pilot.");
    }

    UserEntity user = userRepository.findById(principal.getId())
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "User not found."));

    String code = String.format("%06d", 100000 + secureRandom.nextInt(900000));
    MfaChallengeEntity challenge = new MfaChallengeEntity();
    challenge.setUserId(user.getId());
    challenge.setCodeHash(passwordEncoder.encode(code));
    challenge.setExpiresAt(OffsetDateTime.now().plusMinutes(10));
    challenge.setConsumed(false);
    mfaChallengeRepository.save(challenge);

    MailResult emailResult = mailService.sendAdminMfaCode(user.getEmail(), user.getName(), code);
    if (!emailResult.delivered()) {
      log.info("[MFA] code for userId={} email={} (outbound not delivered): {}",
          user.getId(), user.getEmail(), code);
    }

    user.setMfaEnabled(true);
    userRepository.save(user);

    boolean emailDelivered = emailResult.delivered();
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("sent", true);
    body.put("emailDelivered", emailDelivered);
    body.put("emailConfigured", emailDelivered);
    if (!emailDelivered) {
      body.put("fallbackCode", code);
    }
    if (!isProduction()) {
      body.put("demoCode", code);
    }
    return body;
  }

  @Transactional
  public Map<String, Object> verify(String rawCode) {
    UserPrincipal principal = requireMfaPending();
    String code = rawCode == null ? "" : rawCode.trim();

    MfaChallengeEntity challenge = mfaChallengeRepository
        .findFirstByUserIdAndConsumedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
            principal.getId(), OffsetDateTime.now())
        .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "No active challenge."));

    if (!passwordEncoder.matches(code, challenge.getCodeHash())) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid code.");
    }

    challenge.setConsumed(true);
    mfaChallengeRepository.save(challenge);

    UserEntity user = userRepository.findById(principal.getId())
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "User not found."));
    UserDto dto = userMapper.toDto(user);
    UserPrincipal complete = new UserPrincipal(
        user.getId(), user.getRole(), user.getEmail(), "admin".equals(user.getRole()),
        JwtService.AUTH_STAGE_COMPLETE);
    String token = jwtService.createToken(complete);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("verified", true);
    body.put("token", token);
    body.put("user", dto);
    return body;
  }

  private UserPrincipal requireMfaPending() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    if (!principal.isMfaPending()) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "MFA start/verify requires an mfa_pending token.",
          "mfa_required");
    }
    return principal;
  }

  private boolean isProduction() {
    for (String profile : environment.getActiveProfiles()) {
      if ("prod".equalsIgnoreCase(profile) || "production".equalsIgnoreCase(profile)) {
        return true;
      }
    }
    return false;
  }
}
