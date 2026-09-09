package com.fixbridge.auth.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fixbridge.config.FixbridgeProperties;
import com.fixbridge.auth.dto.request.GoogleAuthRequest;
import com.fixbridge.auth.dto.response.UserDto;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.auth.mapper.UserMapper;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.jwt.JwtService;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import io.jsonwebtoken.Claims;
import java.net.URI;
import java.security.SecureRandom;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class GoogleAuthService {

  private static final Logger log = LoggerFactory.getLogger(GoogleAuthService.class);
  private static final Set<String> ROLES = Set.of("homeowner", "contractor", "admin");

  private final FixbridgeProperties properties;
  private final UserRepository userRepository;
  private final PasswordEncoder passwordEncoder;
  private final JwtService jwtService;
  private final UserMapper userMapper;
  private final RestTemplate restTemplate;
  private final SecureRandom secureRandom = new SecureRandom();

  public GoogleAuthService(
      FixbridgeProperties properties,
      UserRepository userRepository,
      PasswordEncoder passwordEncoder,
      JwtService jwtService,
      UserMapper userMapper,
      RestTemplate restTemplate) {
    this.properties = properties;
    this.userRepository = userRepository;
    this.passwordEncoder = passwordEncoder;
    this.jwtService = jwtService;
    this.userMapper = userMapper;
    this.restTemplate = restTemplate;
  }

  public Map<String, Object> publicConfig() {
    String clientId = resolvedClientId();
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    if (!StringUtils.hasText(clientId)) {
      body.put("googleOAuthEnabled", false);
      body.put("configured", false);
      return body;
    }
    body.put("googleOAuthEnabled", true);
    body.put("configured", true);
    body.put("clientId", clientId);
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> linkedStatus() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    UserEntity user = userRepository.findById(principal.getId())
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found."));
    boolean connected = StringUtils.hasText(user.getOauthGoogleSub());
    Map<String, Object> google = new LinkedHashMap<>();
    google.put("connected", connected);
    google.put("email", connected ? user.getEmail() : null);
    google.put("avatarUrl", user.getGoogleAvatarUrl());

    Map<String, Object> password = new LinkedHashMap<>();
    password.put("enabled", !"google".equalsIgnoreCase(String.valueOf(user.getSignupMethod())));

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("google", google);
    body.put("password", password);
    body.put("signupMethod", user.getSignupMethod() != null ? user.getSignupMethod() : "email");
    return body;
  }

  @Transactional
  public ResponseEntity<Map<String, Object>> authenticate(GoogleAuthRequest request) {
    if (!StringUtils.hasText(resolvedClientId())) {
      return error(HttpStatus.SERVICE_UNAVAILABLE, null, "Google sign-in is not configured.");
    }

    String role = normalize(request.getRole());
    if (!StringUtils.hasText(role)) {
      role = "homeowner";
    }
    if (!ROLES.contains(role)) {
      return error(HttpStatus.BAD_REQUEST, "INVALID_ROLE", "Invalid sign-in portal.");
    }

    GoogleIdentity googleUser = readPendingSignup(request.getPendingSignupToken(), role);
    if (googleUser == null) {
      String idToken = firstNonBlank(request.getCredential(), request.getIdToken());
      if (!StringUtils.hasText(idToken)) {
        return error(HttpStatus.BAD_REQUEST, null, "Google credential is required.");
      }
      Optional<GoogleIdentity> verified = verifyGoogleIdToken(idToken);
      if (verified.isEmpty()) {
        return error(
            HttpStatus.UNAUTHORIZED,
            "INVALID_GOOGLE_TOKEN",
            "We could not sign you in with Google. Please try again.");
      }
      googleUser = verified.get();
    }

    return switch (role) {
      case "contractor" -> handleContractor(request, googleUser);
      case "admin" -> handleAdmin(googleUser);
      default -> handleHomeowner(request, googleUser);
    };
  }

  private ResponseEntity<Map<String, Object>> handleHomeowner(
      GoogleAuthRequest request, GoogleIdentity googleUser) {
    FindResult found = findUserByGoogleIdentity("homeowner", googleUser);
    if (found.conflict != null) {
      return portalMismatch(found.user.getRole());
    }

    UserEntity user = found.user;
    boolean isNew = false;
    boolean needsOnboarding = false;

    if (user != null) {
      ResponseEntity<Map<String, Object>> blocked = assertAccountActive(user);
      if (blocked != null) {
        return blocked;
      }
      user = linkGoogle(user, googleUser);
      if (user == null) {
        return googleAlreadyLinked();
      }
    } else {
      if (!hasAccountSignupConsent(request)) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("code", "CONSENT_REQUIRED");
        body.put("message", "Your Google account was verified. Please complete your FixBridge registration.");
        body.put("missingAcceptanceTypes", List.of("ACCOUNT_TERMS", "PRIVACY_POLICY"));
        body.put("pendingSignupToken", signPending(googleUser, "homeowner"));
        body.put("googleProfile", googleProfile(googleUser));
        return ResponseEntity.badRequest().body(body);
      }

      try {
        user = createGoogleUser("homeowner", googleUser, request);
        isNew = true;
        needsOnboarding = true;
      } catch (DataIntegrityViolationException e) {
        FindResult retry = findUserByGoogleIdentity("homeowner", googleUser);
        if (retry.user != null) {
          user = linkGoogle(retry.user, googleUser);
          if (user == null) {
            return googleAlreadyLinked();
          }
          isNew = false;
        } else {
          return error(HttpStatus.CONFLICT, "ACCOUNT_CONFLICT",
              "An account with this email already exists. Please sign in instead.");
        }
      }
    }

    ensureReferralCode(user);
    UserDto dto = userMapper.toDto(user);
    String token = jwtService.createToken(toPrincipal(user, JwtService.AUTH_STAGE_COMPLETE));

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("token", token);
    body.put("user", dto);
    body.put("isNew", isNew);
    body.put("needsMarketingOnboarding", needsOnboarding);
    body.put("googleProfile", googleProfile(googleUser));
    return ResponseEntity.ok(body);
  }

  private ResponseEntity<Map<String, Object>> handleContractor(
      GoogleAuthRequest request, GoogleIdentity googleUser) {
    String intent = "signup".equalsIgnoreCase(normalize(request.getIntent())) ? "signup" : "login";
    FindResult found = findUserByGoogleIdentity("contractor", googleUser);
    if (found.conflict != null) {
      return portalMismatch(found.user.getRole());
    }

    UserEntity user = found.user;
    if (user != null) {
      ResponseEntity<Map<String, Object>> blocked = assertAccountActive(user);
      if (blocked != null) {
        return blocked;
      }
      user = linkGoogle(user, googleUser);
      if (user == null) {
        return googleAlreadyLinked();
      }
      UserDto dto = userMapper.toDto(user);
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("ok", true);
      body.put("token", jwtService.createToken(toPrincipal(user, JwtService.AUTH_STAGE_COMPLETE)));
      body.put("user", dto);
      body.put("isNew", false);
      body.put("needsContractorApplication", contractorNeedsApplication(user));
      return ResponseEntity.ok(body);
    }

    if ("login".equals(intent)) {
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("ok", false);
      body.put("code", "CONTRACTOR_SIGNUP_REQUIRED");
      body.put("message", "Your Google account was verified. Please complete your FixBridge contractor registration.");
      body.put("pendingSignupToken", signPending(googleUser, "contractor"));
      body.put("googleProfile", googleProfile(googleUser));
      return ResponseEntity.badRequest().body(body);
    }

    if (!Boolean.TRUE.equals(request.getAgreeContractorAgreementV4())) {
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("ok", false);
      body.put("code", "CONTRACTOR_AGREEMENT_REQUIRED");
      body.put("message",
          "Your Google account was verified. Accept the required contractor agreements to finish registration.");
      body.put("pendingSignupToken", signPending(googleUser, "contractor"));
      body.put("googleProfile", googleProfile(googleUser));
      return ResponseEntity.badRequest().body(body);
    }

    try {
      user = createGoogleUser("contractor", googleUser, request);
      user.setComplianceStatus("draft");
      user = userRepository.save(user);
    } catch (DataIntegrityViolationException e) {
      FindResult retry = findUserByGoogleIdentity("contractor", googleUser);
      if (retry.user != null) {
        user = linkGoogle(retry.user, googleUser);
        if (user == null) {
          return googleAlreadyLinked();
        }
        UserDto dto = userMapper.toDto(user);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("token", jwtService.createToken(toPrincipal(user, JwtService.AUTH_STAGE_COMPLETE)));
        body.put("user", dto);
        body.put("isNew", false);
        body.put("needsContractorApplication", contractorNeedsApplication(user));
        return ResponseEntity.ok(body);
      }
      return error(HttpStatus.CONFLICT, "ACCOUNT_CONFLICT",
          "An account with this email already exists. Please sign in instead.");
    }

    UserDto dto = userMapper.toDto(user);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("token", jwtService.createToken(toPrincipal(user, JwtService.AUTH_STAGE_COMPLETE)));
    body.put("user", dto);
    body.put("isNew", true);
    body.put("needsContractorApplication", true);
    body.put("googleProfile", Map.of(
        "email", googleUser.email(),
        "name", googleUser.name(),
        "givenName", googleUser.givenName() != null ? googleUser.givenName() : "",
        "familyName", googleUser.familyName() != null ? googleUser.familyName() : ""));
    return ResponseEntity.ok(body);
  }

  private ResponseEntity<Map<String, Object>> handleAdmin(GoogleIdentity googleUser) {
    FindResult found = findUserByGoogleIdentity("admin", googleUser);
    if (found.conflict != null) {
      return portalMismatch(found.user.getRole());
    }
    if (found.user == null) {
      return error(HttpStatus.FORBIDDEN, "ADMIN_NOT_AUTHORIZED",
          "This Google account is not authorized to access FixBridge Admin.");
    }
    ResponseEntity<Map<String, Object>> blocked = assertAccountActive(found.user);
    if (blocked != null) {
      return blocked;
    }
    UserEntity linked = linkGoogle(found.user, googleUser);
    if (linked == null) {
      return googleAlreadyLinked();
    }
    UserDto dto = userMapper.toDto(linked);
    String token = jwtService.createMfaPendingToken(toPrincipal(linked, JwtService.AUTH_STAGE_MFA_PENDING));
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("mfaRequired", true);
    body.put("token", token);
    body.put("user", dto);
    body.put("message", "Google identity verified. Complete MFA to finish sign-in.");
    return ResponseEntity.ok(body);
  }

  private UserEntity createGoogleUser(String role, GoogleIdentity googleUser, GoogleAuthRequest request) {
    UserEntity entity = new UserEntity();
    entity.setRole(role);
    entity.setName(googleUser.name());
    entity.setEmail(googleUser.email());
    entity.setPassword(passwordEncoder.encode("GOOGLE_OAUTH_" + googleUser.sub()));
    entity.setOauthGoogleSub(googleUser.sub());
    entity.setGoogleAvatarUrl(googleUser.picture());
    entity.setSignupMethod("google");
    entity.setAdmin(false);
    entity.setBlocked(false);
    if (StringUtils.hasText(request.getPhone())) {
      entity.setPhone(request.getPhone().trim());
    }
    if (StringUtils.hasText(request.getReferredByCode())) {
      entity.setReferredByCode(request.getReferredByCode().trim().toUpperCase(Locale.ROOT));
    }
    if ("contractor".equals(role)) {
      entity.setComplianceStatus("draft");
    }
    UserEntity saved = userRepository.save(entity);
    ensureReferralCode(saved);
    return saved;
  }

  private FindResult findUserByGoogleIdentity(String role, GoogleIdentity googleUser) {
    Optional<UserEntity> bySub = userRepository.findFirstByOauthGoogleSub(googleUser.sub());
    if (bySub.isPresent()) {
      UserEntity user = bySub.get();
      if (role != null && !role.equals(user.getRole())) {
        return FindResult.conflict("PROVIDER_LINKED_OTHER_ROLE", user);
      }
      return FindResult.ok(user);
    }
    Optional<UserEntity> byEmail = userRepository.findByRoleAndEmailIgnoreCase(role, googleUser.email());
    if (byEmail.isPresent()) {
      return FindResult.ok(byEmail.get());
    }
    Optional<UserEntity> other = userRepository.findFirstByRoleNotAndEmailIgnoreCase(role, googleUser.email());
    if (other.isPresent()) {
      return FindResult.conflict("ROLE_PORTAL_MISMATCH", other.get());
    }
    return FindResult.ok(null);
  }

  private UserEntity linkGoogle(UserEntity user, GoogleIdentity googleUser) {
    String existingSub = user.getOauthGoogleSub();
    if (StringUtils.hasText(existingSub) && !existingSub.equals(googleUser.sub())) {
      return null;
    }
    if (!StringUtils.hasText(user.getOauthGoogleSub())) {
      user.setOauthGoogleSub(googleUser.sub());
    }
    if (!StringUtils.hasText(user.getGoogleAvatarUrl()) && StringUtils.hasText(googleUser.picture())) {
      user.setGoogleAvatarUrl(googleUser.picture());
    }
    if (!StringUtils.hasText(user.getSignupMethod())) {
      user.setSignupMethod("google");
    }
    return userRepository.save(user);
  }

  private Optional<GoogleIdentity> verifyGoogleIdToken(String idToken) {
    String clientId = resolvedClientId();
    try {
      URI uri = UriComponentsBuilder
          .fromUriString("https://oauth2.googleapis.com/tokeninfo")
          .queryParam("id_token", idToken)
          .build(true)
          .toUri();
      ResponseEntity<JsonNode> response = restTemplate.getForEntity(uri, JsonNode.class);
      if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
        return Optional.empty();
      }
      JsonNode data = response.getBody();
      if (!clientId.equals(text(data, "aud"))) {
        log.info("[oauth_google] wrong_audience");
        return Optional.empty();
      }
      String iss = text(data, "iss");
      if (!"accounts.google.com".equals(iss) && !"https://accounts.google.com".equals(iss)) {
        return Optional.empty();
      }
      long exp = data.path("exp").asLong(0);
      if (exp * 1000L < System.currentTimeMillis()) {
        return Optional.empty();
      }
      String emailVerified = text(data, "email_verified");
      if (!"true".equalsIgnoreCase(emailVerified) && !data.path("email_verified").asBoolean(false)) {
        return Optional.empty();
      }
      String email = text(data, "email").trim().toLowerCase(Locale.ROOT);
      String sub = text(data, "sub").trim();
      if (!StringUtils.hasText(email) || !StringUtils.hasText(sub)) {
        return Optional.empty();
      }
      String given = blankToNull(text(data, "given_name"));
      String family = blankToNull(text(data, "family_name"));
      String name = text(data, "name");
      if (!StringUtils.hasText(name)) {
        name = given != null ? given : email.split("@")[0];
      }
      return Optional.of(new GoogleIdentity(
          sub, email, name, given, family, blankToNull(text(data, "picture"))));
    } catch (Exception e) {
      log.warn("[oauth_google] tokeninfo failed: {}", e.getMessage());
      return Optional.empty();
    }
  }

  private GoogleIdentity readPendingSignup(String token, String targetRole) {
    if (!StringUtils.hasText(token)) {
      return null;
    }
    try {
      Claims claims = jwtService.parseClaims(token.trim());
      if (!"google_pending".equals(stringClaim(claims.get("typ")))
          || !"google".equals(stringClaim(claims.get("provider")))) {
        return null;
      }
      if (targetRole != null && !targetRole.equals(stringClaim(claims.get("targetRole")))) {
        return null;
      }
      String email = stringClaim(claims.get("email"));
      String sub = stringClaim(claims.get("providerUserId"));
      if (!StringUtils.hasText(email) || !StringUtils.hasText(sub)) {
        return null;
      }
      email = email.trim().toLowerCase(Locale.ROOT);
      String given = blankToNull(stringClaim(claims.get("firstName")));
      String family = blankToNull(stringClaim(claims.get("lastName")));
      String name = stringClaim(claims.get("name"));
      if (!StringUtils.hasText(name)) {
        name = String.join(" ",
            given != null ? given : "",
            family != null ? family : "").trim();
        if (!StringUtils.hasText(name)) {
          name = email.split("@")[0];
        }
      }
      return new GoogleIdentity(sub, email, name, given, family, blankToNull(stringClaim(claims.get("picture"))));
    } catch (Exception e) {
      return null;
    }
  }

  private String signPending(GoogleIdentity googleUser, String targetRole) {
    return jwtService.createGooglePendingSignupToken(
        googleUser.sub(),
        googleUser.email(),
        googleUser.name(),
        googleUser.givenName(),
        googleUser.familyName(),
        googleUser.picture(),
        targetRole);
  }

  private String resolvedClientId() {
    String raw = properties.getGoogle().getClientId();
    if (!StringUtils.hasText(raw)) {
      return "";
    }
    String v = raw.trim();
    if (v.matches("(?i)^GOCSPX-.*") || v.matches("(?i)^(sk_|pk_|whsec_|rk_).*")) {
      return "";
    }
    if (!v.matches("(?i)^[\\w-]+\\.apps\\.googleusercontent\\.com$")) {
      return "";
    }
    return v;
  }

  private ResponseEntity<Map<String, Object>> assertAccountActive(UserEntity user) {
    if (user.isBlocked()) {
      return error(HttpStatus.FORBIDDEN, "ACCOUNT_SUSPENDED",
          "This account is not active. Contact support if you need help.");
    }
    String compliance = user.getComplianceStatus() == null ? "" : user.getComplianceStatus().toLowerCase(Locale.ROOT);
    if ("contractor".equals(user.getRole())
        && Set.of("suspended", "rejected", "blocked").contains(compliance)) {
      return error(HttpStatus.FORBIDDEN, "ACCOUNT_SUSPENDED",
          "This contractor account is suspended or not eligible to sign in.");
    }
    return null;
  }

  private boolean contractorNeedsApplication(UserEntity user) {
    String status = user.getComplianceStatus() == null ? "" : user.getComplianceStatus().toLowerCase(Locale.ROOT);
    return "draft".equals(status) || "incomplete".equals(status);
  }

  private boolean hasAccountSignupConsent(GoogleAuthRequest request) {
    if (Boolean.TRUE.equals(request.getAcceptTerms()) && Boolean.TRUE.equals(request.getAcceptPrivacy())) {
      return true;
    }
    Set<String> accepted = new java.util.HashSet<>();
    Object consents = request.getConsents();
    if (consents instanceof List<?> list) {
      for (Object item : list) {
        if (item instanceof Map<?, ?> map) {
          Object type = map.get("acceptanceType");
          if (type == null) {
            type = map.get("type");
          }
          boolean ok = map.get("accepted") == null
              || Boolean.TRUE.equals(map.get("accepted"))
              || "true".equalsIgnoreCase(String.valueOf(map.get("accepted")));
          if (type != null && ok) {
            accepted.add(String.valueOf(type).trim().toUpperCase(Locale.ROOT));
          }
        } else if (item != null) {
          accepted.add(String.valueOf(item).trim().toUpperCase(Locale.ROOT));
        }
      }
    } else if (consents instanceof Map<?, ?> map) {
      for (Map.Entry<?, ?> e : map.entrySet()) {
        if (Boolean.TRUE.equals(e.getValue()) || "true".equalsIgnoreCase(String.valueOf(e.getValue()))) {
          accepted.add(String.valueOf(e.getKey()).trim().toUpperCase(Locale.ROOT));
        }
      }
    }
    return accepted.contains("ACCOUNT_TERMS") && accepted.contains("PRIVACY_POLICY");
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

  private Map<String, Object> googleProfile(GoogleIdentity googleUser) {
    Map<String, Object> profile = new LinkedHashMap<>();
    profile.put("email", googleUser.email());
    profile.put("name", googleUser.name());
    profile.put("givenName", googleUser.givenName());
    profile.put("familyName", googleUser.familyName());
    profile.put("picture", googleUser.picture());
    return profile;
  }

  private ResponseEntity<Map<String, Object>> portalMismatch(String existingRole) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", false);
    body.put("code", "ROLE_PORTAL_MISMATCH");
    body.put("existingRole", existingRole);
    body.put("message",
        "This Google account is associated with a FixBridge " + existingRole
            + " account. Sign in on the " + portalLabel(existingRole) + " instead.");
    return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
  }

  private ResponseEntity<Map<String, Object>> googleAlreadyLinked() {
    return error(HttpStatus.CONFLICT, "GOOGLE_ALREADY_LINKED",
        "This email is already linked to a different Google account. Sign in with email and password, or use the originally linked Google account.");
  }

  private ResponseEntity<Map<String, Object>> error(HttpStatus status, String code, String message) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", false);
    body.put("message", message);
    if (code != null) {
      body.put("code", code);
    }
    return ResponseEntity.status(status).body(body);
  }

  private static String portalLabel(String role) {
    if ("contractor".equals(role)) {
      return "Contractor portal";
    }
    if ("admin".equals(role)) {
      return "Admin sign-in";
    }
    return "Homeowner portal";
  }

  private static String normalize(String value) {
    return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
  }

  private static String firstNonBlank(String a, String b) {
    if (StringUtils.hasText(a)) {
      return a.trim();
    }
    if (StringUtils.hasText(b)) {
      return b.trim();
    }
    return "";
  }

  private static String text(JsonNode node, String field) {
    JsonNode value = node.get(field);
    return value == null || value.isNull() ? "" : value.asText("");
  }

  private static String blankToNull(String value) {
    return StringUtils.hasText(value) ? value : null;
  }

  private static String stringClaim(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private record GoogleIdentity(
      String sub, String email, String name, String givenName, String familyName, String picture) {}

  private record FindResult(String conflict, UserEntity user) {
    static FindResult ok(UserEntity user) {
      return new FindResult(null, user);
    }

    static FindResult conflict(String code, UserEntity user) {
      return new FindResult(code, user);
    }
  }
}
