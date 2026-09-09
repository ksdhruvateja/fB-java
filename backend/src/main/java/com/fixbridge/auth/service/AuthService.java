package com.fixbridge.auth.service;

import com.fixbridge.auth.dto.response.AuthResponse;
import com.fixbridge.auth.dto.request.ForgotPasswordRequest;
import com.fixbridge.auth.dto.request.ProfileUpdateRequest;
import com.fixbridge.auth.dto.request.ResetPasswordRequest;
import com.fixbridge.auth.dto.request.SignInRequest;
import com.fixbridge.auth.dto.request.SignUpRequest;
import com.fixbridge.auth.dto.response.UserDto;
import com.fixbridge.auth.entity.PasswordResetTokenEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.integration.email.MailService;
import com.fixbridge.integration.highlevel.HighLevelClient;
import com.fixbridge.auth.mapper.UserMapper;
import com.fixbridge.auth.repository.PasswordResetTokenRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.jwt.JwtService;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import com.fixbridge.config.FixbridgeProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class AuthService {

  private static final Logger log = LoggerFactory.getLogger(AuthService.class);

  private static final Set<String> VALID_ROLES = Set.of("homeowner", "contractor", "admin");
  private static final Set<String> PUBLIC_SIGNUP_ROLES = Set.of("homeowner", "contractor");
  private static final Set<String> OAUTH_SENTINELS = Set.of("GOOGLE_OAUTH", "APPLE_OAUTH", "AUTH0_OAUTH");
  private static final Set<String> RESET_ROLES = Set.of("homeowner", "contractor", "admin", "partner");
  private static final int MIN_SIGNUP_PASSWORD = 6;
  private static final int MIN_RESET_PASSWORD = 8;
  private static final long RESET_TTL_HOURS = 1;

  private final UserRepository userRepository;
  private final PasswordResetTokenRepository passwordResetTokenRepository;
  private final PasswordEncoder passwordEncoder;
  private final JwtService jwtService;
  private final UserMapper userMapper;
  private final MailService mailService;
  private final FixbridgeProperties properties;
  private final HighLevelClient highLevelClient;
  private final SecureRandom secureRandom = new SecureRandom();

  public AuthService(
      UserRepository userRepository,
      PasswordResetTokenRepository passwordResetTokenRepository,
      PasswordEncoder passwordEncoder,
      JwtService jwtService,
      UserMapper userMapper,
      MailService mailService,
      FixbridgeProperties properties,
      HighLevelClient highLevelClient) {
    this.userRepository = userRepository;
    this.passwordResetTokenRepository = passwordResetTokenRepository;
    this.passwordEncoder = passwordEncoder;
    this.jwtService = jwtService;
    this.userMapper = userMapper;
    this.mailService = mailService;
    this.properties = properties;
    this.highLevelClient = highLevelClient;
  }

  @Transactional(readOnly = true)
  public AuthResponse signIn(SignInRequest request) {
    String role = normalize(request.getRole());
    String email = normalizeEmail(request.getEmail());
    String password = request.getPassword();

    if (!StringUtils.hasText(role) || !StringUtils.hasText(email) || !StringUtils.hasText(password)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "All fields are required.");
    }
    if (!VALID_ROLES.contains(role)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid account type.");
    }

    UserEntity user = userRepository.findByRoleAndEmailIgnoreCase(role, email)
        .orElseThrow(() -> new ApiException(
            HttpStatus.UNAUTHORIZED,
            "Incorrect email or password. Use the demo login or sign up first."));

    if (user.isBlocked()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "This account has been blocked. Please contact support.");
    }

    if (OAUTH_SENTINELS.contains(String.valueOf(user.getPassword()))) {
      throw new ApiException(
          HttpStatus.UNAUTHORIZED,
          "Social login has been removed. Use Forgot password to set a password for this account, or contact support.");
    }

    if (!passwordEncoder.matches(password, user.getPassword())) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Incorrect email or password.");
    }

    ensureReferralCode(user);
    UserDto dto = userMapper.toDto(user);
    UserPrincipal principal = toPrincipal(user, JwtService.AUTH_STAGE_COMPLETE);

    if ("admin".equals(role)) {
      String token = jwtService.createMfaPendingToken(principal);
      return AuthResponse.mfaPending(
          token,
          dto,
          "Credentials verified. Complete MFA to finish sign-in.");
    }

    String token = jwtService.createToken(principal);
    return AuthResponse.success(token, dto);
  }

  @Transactional
  public AuthResponse signUp(SignUpRequest request) {
    String role = normalize(request.getRole());
    String name = request.getName() == null ? "" : request.getName().trim();
    String email = normalizeEmail(request.getEmail());
    String password = request.getPassword();

    if (!StringUtils.hasText(role) || !StringUtils.hasText(name) || !StringUtils.hasText(email) || !StringUtils.hasText(password)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "All required fields must be filled.");
    }
    if (!PUBLIC_SIGNUP_ROLES.contains(role)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Public signup is only available for homeowners and contractors.");
    }
    if (password.length() < MIN_SIGNUP_PASSWORD) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Password must be at least 6 characters.");
    }
    if (userRepository.existsByRoleAndEmailIgnoreCase(role, email)) {
      throw new ApiException(HttpStatus.CONFLICT, "An account with that email already exists.");
    }

    UserEntity entity = new UserEntity();
    entity.setRole(role);
    entity.setName(name);
    entity.setEmail(email);
    entity.setPassword(passwordEncoder.encode(password));
    entity.setAdmin(false);
    entity.setBlocked(false);
    entity.setSignupMethod("email");
    if (StringUtils.hasText(request.getPhone())) {
      entity.setPhone(request.getPhone().trim());
    }
    if (StringUtils.hasText(request.getAddress())) {
      entity.setAddress(request.getAddress().trim());
    }
    if (StringUtils.hasText(request.getReferredByCode())) {
      entity.setReferredByCode(request.getReferredByCode().trim().toUpperCase(Locale.ROOT));
    }
    if ("contractor".equals(role)) {
      entity.setComplianceStatus("under_review");
    }

    UserEntity saved = userRepository.save(entity);
    ensureReferralCode(saved);
    try {
      Map<String, Object> contact = new LinkedHashMap<>();
      contact.put("email", saved.getEmail());
      contact.put("name", saved.getName());
      contact.put("phone", saved.getPhone());
      contact.put("tags", List.of("signup", saved.getRole()));
      contact.put("source", "fixbridge_signup");
      highLevelClient.upsertContact(contact);
      highLevelClient.trackEvent(
          "user_signup",
          Map.of(
              "userId", saved.getId(),
              "role", saved.getRole(),
              "email", saved.getEmail()));
    } catch (Exception e) {
      log.debug("HighLevel signup hook skipped: {}", e.getMessage());
    }
    UserDto dto = userMapper.toDto(saved);
    String token = jwtService.createToken(toPrincipal(saved, JwtService.AUTH_STAGE_COMPLETE));
    return AuthResponse.success(token, dto);
  }

  @Transactional(readOnly = true)
  public AuthResponse me() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    UserEntity user = userRepository.findById(principal.getId())
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "User not found."));
    if (user.isBlocked()) {
      throw new ApiException(HttpStatus.FORBIDDEN, "This account has been blocked. Please contact support.");
    }
    return AuthResponse.success(null, userMapper.toDto(user));
  }

  @Transactional
  public AuthResponse updateProfile(ProfileUpdateRequest request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    UserEntity user = userRepository.findById(principal.getId())
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "User not found."));

    String name = request.getName() == null ? "" : request.getName().trim();
    if (!StringUtils.hasText(name)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Name is required.");
    }
    user.setName(name);

    if (request.getPhone() != null) {
      user.setPhone(request.getPhone().trim());
    }
    if (request.getAddress() != null) {
      user.setAddress(request.getAddress().trim());
    }
    if (request.getContactEmail() != null) {
      user.setContactEmail(request.getContactEmail().trim());
    }
    if (request.getGender() != null) {
      user.setGender(request.getGender().trim());
    }
    if (request.getDob() != null) {
      user.setDob(request.getDob().trim());
    }
    if (request.getPhotoDataUrl() != null) {
      String photo = request.getPhotoDataUrl();
      if (photo.length() > 2_500_000) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Photo is too large. Please use a smaller image.");
      }
      if (!photo.isEmpty() && !photo.startsWith("data:image/")) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Photo must be an image data URL.");
      }
      user.setPhotoDataUrl(photo.isEmpty() ? null : photo);
    }

    UserEntity saved = userRepository.save(user);
    return AuthResponse.success(null, userMapper.toDto(saved));
  }

  /**
   * Enumeration-safe forgot-password. Always returns ok even if the account does not exist
   * or email delivery is not wired.
   */
  @Transactional
  public void forgotPassword(ForgotPasswordRequest request) {
    try {
      String email = normalizeEmail(request.getEmail());
      String role = normalize(request.getRole());
      if (!StringUtils.hasText(email) || !RESET_ROLES.contains(role) || "partner".equals(role)) {
        return;
      }
      userRepository.findByRoleAndEmailIgnoreCase(role, email).ifPresent(user -> {
        try {
          issuePasswordReset(user);
        } catch (Exception e) {
          log.warn("forgot-password token issue failed for {}: {}", email, e.getMessage());
        }
      });
    } catch (Exception e) {
      log.warn("forgot-password: {}", e.getMessage());
    }
  }

  @Transactional
  public void resetPassword(ResetPasswordRequest request) {
    String role = normalize(request.getRole());
    String rawToken = request.getToken() == null ? "" : request.getToken();
    String password = request.getPassword() == null ? "" : request.getPassword();

    if (!RESET_ROLES.contains(role) || "partner".equals(role)) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "This reset link has expired or is no longer valid.",
          "invalid");
    }
    if (password.length() < MIN_RESET_PASSWORD) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Password must be at least 8 characters.",
          "weak_password");
    }

    String tokenHash = hashResetToken(rawToken);
    PasswordResetTokenEntity tokenRow = passwordResetTokenRepository
        .findFirstByRoleAndTokenAndUsedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
            role, tokenHash, OffsetDateTime.now())
        .orElseThrow(() -> new ApiException(
            HttpStatus.BAD_REQUEST,
            "This reset link has expired or is no longer valid.",
            "invalid"));

    UserEntity user = userRepository.findByRoleAndEmailIgnoreCase(role, tokenRow.getEmail())
        .orElseThrow(() -> new ApiException(
            HttpStatus.BAD_REQUEST,
            "This reset link has expired or is no longer valid.",
            "invalid"));

    user.setPassword(passwordEncoder.encode(password));
    userRepository.save(user);

    tokenRow.setUsed(true);
    passwordResetTokenRepository.save(tokenRow);
    passwordResetTokenRepository.invalidateUnused(tokenRow.getEmail(), role);
  }

  private void issuePasswordReset(UserEntity user) {
    String raw = createRawResetToken();
    String hash = hashResetToken(raw);
    passwordResetTokenRepository.invalidateUnused(user.getEmail(), user.getRole());

    PasswordResetTokenEntity row = new PasswordResetTokenEntity();
    row.setEmail(user.getEmail());
    row.setRole(user.getRole());
    row.setToken(hash);
    row.setExpiresAt(OffsetDateTime.now().plusHours(RESET_TTL_HOURS));
    row.setUsed(false);
    passwordResetTokenRepository.save(row);

    String base = properties.getAppUrl() != null ? properties.getAppUrl().replaceAll("/$", "") : "http://localhost:5000";
    String link = base + "/reset-password?role=" + user.getRole() + "&token=" + raw;
    String subject = "Reset your FixBridge password";
    String text = "Reset your password using this link (expires in 1 hour):\n\n" + link + "\n";
    String html = "<p>Reset your password using this link (expires in 1 hour):</p><p><a href=\""
        + link + "\">" + link + "</a></p>";
    mailService.send(user.getEmail(), subject, html, text);
  }

  private void ensureReferralCode(UserEntity user) {
    if (StringUtils.hasText(user.getReferralCode())) {
      return;
    }
    for (int i = 0; i < 8; i++) {
      String code = "FB" + Integer.toHexString(secureRandom.nextInt()).toUpperCase(Locale.ROOT);
      if (!userRepository.existsByReferralCodeIgnoreCase(code)) {
        user.setReferralCode(code);
        userRepository.save(user);
        return;
      }
    }
  }

  private UserPrincipal toPrincipal(UserEntity user, String authStage) {
    return new UserPrincipal(
        user.getId(),
        user.getRole(),
        user.getEmail(),
        "admin".equals(user.getRole()),
        authStage);
  }

  private static String normalize(String value) {
    return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
  }

  private static String normalizeEmail(String value) {
    return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
  }

  private String createRawResetToken() {
    byte[] bytes = new byte[32];
    secureRandom.nextBytes(bytes);
    return HexFormat.of().formatHex(bytes);
  }

  private static String hashResetToken(String rawToken) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] hashed = digest.digest(String.valueOf(rawToken).getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(hashed);
    } catch (Exception e) {
      throw new IllegalStateException("Unable to hash reset token", e);
    }
  }
}
