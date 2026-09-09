package com.fixbridge.admin.service;

import com.fixbridge.config.FixbridgeProperties;
import com.fixbridge.admin.entity.PartnerEntity;
import com.fixbridge.admin.entity.PartnerUserEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.admin.repository.PartnerRepository;
import com.fixbridge.admin.repository.PartnerUserRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Date;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import javax.crypto.SecretKey;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class PartnerService {

  private final PartnerRepository partnerRepository;
  private final PartnerUserRepository partnerUserRepository;
  private final UserRepository userRepository;
  private final PasswordEncoder passwordEncoder;
  private final FixbridgeProperties properties;
  private final SecureRandom random = new SecureRandom();

  public PartnerService(
      PartnerRepository partnerRepository,
      PartnerUserRepository partnerUserRepository,
      UserRepository userRepository,
      PasswordEncoder passwordEncoder,
      FixbridgeProperties properties) {
    this.partnerRepository = partnerRepository;
    this.partnerUserRepository = partnerUserRepository;
    this.userRepository = userRepository;
    this.passwordEncoder = passwordEncoder;
    this.properties = properties;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> lookup(String codeRaw) {
    String code = codeRaw == null ? "" : codeRaw.trim();
    if (!StringUtils.hasText(code)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Partner code required.");
    }
    PartnerEntity partner =
        partnerRepository.findByCodeIgnoreCaseAndDeletedAtIsNullAndActiveTrue(code).orElse(null);
    if (partner != null) {
      return Map.of("ok", true, "partner", publicView(partner));
    }
    UserEntity user = userRepository.findByReferralCodeIgnoreCase(code).orElse(null);
    if (user != null) {
      Map<String, Object> view = new LinkedHashMap<>();
      view.put("code", user.getReferralCode());
      view.put("name", user.getName());
      view.put(
          "company",
          "contractor".equals(user.getRole()) ? "Contractor Partner" : "Homeowner Referral");
      return Map.of("ok", true, "partner", view);
    }
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("partner", null);
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> adminList() {
    SecurityUtils.requireAdminRole();
    String appUrl =
        properties.getAppUrl() != null ? properties.getAppUrl().replaceAll("/$", "") : "";
    List<Map<String, Object>> partners =
        partnerRepository.findByDeletedAtIsNullOrderByCreatedAtDesc().stream()
            .map(
                p -> {
                  Map<String, Object> row = serialize(p);
                  row.put("intakeUrl", appUrl + "/?partner=" + p.getCode());
                  return row;
                })
            .toList();
    return Map.of("ok", true, "partners", partners);
  }

  @Transactional
  public Map<String, Object> adminCreate(Map<String, Object> body) {
    SecurityUtils.requireAdminRole();
    String requested = body.get("code") != null ? String.valueOf(body.get("code")).trim() : "";
    String code =
        StringUtils.hasText(requested)
            ? normalizeCode(requested)
            : randomCode();
    if (!StringUtils.hasText(code) || code.length() < 3) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "Enter a referral code with at least 3 characters.");
    }
    if (partnerRepository.existsByCodeIgnoreCase(code)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "This referral code already exists.");
    }
    PartnerEntity partner = new PartnerEntity();
    partner.setCode(code);
    partner.setName(
        StringUtils.hasText(str(body, "name"))
            ? str(body, "name")
            : (StringUtils.hasText(str(body, "label")) ? str(body, "label") : "Partner"));
    partner.setCompany(blankToNull(str(body, "company")));
    partner.setEmail(blankToNull(str(body, "email")));
    partner.setPhone(blankToNull(str(body, "phone")));
    partner.setNotes(blankToNull(str(body, "notes")));
    partner.setActive(true);
    PartnerEntity saved = partnerRepository.save(partner);
    Map<String, Object> row = serialize(saved);
    String appUrl =
        properties.getAppUrl() != null ? properties.getAppUrl().replaceAll("/$", "") : "";
    row.put("intakeUrl", appUrl + "/?partner=" + saved.getCode());
    return Map.of("ok", true, "partner", row);
  }

  @Transactional
  public Map<String, Object> adminUpdate(Long id, Map<String, Object> body) {
    SecurityUtils.requireAdminRole();
    PartnerEntity partner =
        partnerRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Referral code not found."));
    if (partner.getDeletedAt() != null) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Referral code not found.");
    }
    if (!(body.get("active") instanceof Boolean active)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unable to update referral code.");
    }
    partner.setActive(active);
    if (body.containsKey("name") && StringUtils.hasText(str(body, "name"))) {
      partner.setName(str(body, "name"));
    }
    if (body.containsKey("notes")) {
      partner.setNotes(blankToNull(str(body, "notes")));
    }
    partnerRepository.save(partner);
    return Map.of("ok", true, "active", active);
  }

  @Transactional
  public Map<String, Object> adminDelete(Long id) {
    SecurityUtils.requireAdminRole();
    PartnerEntity partner =
        partnerRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Referral code not found."));
    if (partner.getDeletedAt() != null) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Referral code not found.");
    }
    partner.setDeletedAt(OffsetDateTime.now());
    partner.setActive(false);
    partnerRepository.save(partner);
    return Map.of("ok", true, "archived", true);
  }

  @Transactional(readOnly = true)
  public Map<String, Object> login(String emailRaw, String password) {
    String secret = System.getenv("PARTNER_JWT_SECRET");
    if (!StringUtils.hasText(secret)) {
      secret = properties.getJwt().getSecret();
    }
    if (!StringUtils.hasText(secret)) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Partner auth is not configured.");
    }
    String email = emailRaw == null ? "" : emailRaw.trim().toLowerCase(Locale.ROOT);
    PartnerUserEntity pu =
        partnerUserRepository
            .findByEmailIgnoreCase(email)
            .orElseThrow(
                () -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid partner credentials."));
    if (!StringUtils.hasText(pu.getPasswordHash())
        || !passwordEncoder.matches(password, pu.getPasswordHash())) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid partner credentials.");
    }
    PartnerEntity partner =
        partnerRepository
            .findById(pu.getPartnerId())
            .orElseThrow(
                () -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid partner credentials."));

    Instant now = Instant.now();
    byte[] secretBytes = secret.getBytes(StandardCharsets.UTF_8);
    if (secretBytes.length < 32) {
      byte[] padded = new byte[32];
      System.arraycopy(secretBytes, 0, padded, 0, Math.min(secretBytes.length, 32));
      secretBytes = padded;
    }
    SecretKey key = Keys.hmacShaKeyFor(secretBytes);
    String token =
        Jwts.builder()
            .claim("typ", "partner")
            .claim("partnerUserId", pu.getId())
            .claim("partnerId", partner.getId())
            .claim("code", partner.getCode() == null ? "" : partner.getCode().toUpperCase(Locale.ROOT))
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(Duration.ofDays(7))))
            .signWith(key, Jwts.SIG.HS256)
            .compact();

    Map<String, Object> partnerView = new LinkedHashMap<>();
    partnerView.put("id", partner.getId());
    partnerView.put("code", partner.getCode());
    partnerView.put("name", partner.getName());
    partnerView.put("email", pu.getEmail());

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("token", token);
    body.put("partner", partnerView);
    return body;
  }

  private Map<String, Object> publicView(PartnerEntity p) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("code", p.getCode());
    out.put("name", p.getName());
    out.put("company", p.getCompany());
    return out;
  }

  private Map<String, Object> serialize(PartnerEntity p) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", p.getId());
    out.put("code", p.getCode());
    out.put("name", p.getName());
    out.put("company", p.getCompany());
    out.put("email", p.getEmail());
    out.put("phone", p.getPhone());
    out.put("notes", p.getNotes());
    out.put("active", !Boolean.FALSE.equals(p.getActive()));
    out.put("createdAt", p.getCreatedAt());
    return out;
  }

  private String randomCode() {
    byte[] bytes = new byte[4];
    random.nextBytes(bytes);
    return HexFormat.of().withUpperCase().formatHex(bytes);
  }

  private static String normalizeCode(String raw) {
    return raw.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9_-]", "");
  }

  private static String str(Map<String, Object> body, String key) {
    Object v = body.get(key);
    return v == null ? "" : String.valueOf(v).trim();
  }

  private static String blankToNull(String value) {
    return StringUtils.hasText(value) ? value : null;
  }
}
