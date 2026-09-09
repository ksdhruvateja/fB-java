package com.fixbridge.security.jwt;

import com.fixbridge.config.FixbridgeProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

import com.fixbridge.security.principal.UserPrincipal;
@Service
public class JwtService {

  public static final String AUTH_STAGE_COMPLETE = "complete";
  public static final String AUTH_STAGE_MFA_PENDING = "mfa_pending";

  private final FixbridgeProperties properties;
  private final SecretKey key;

  public JwtService(FixbridgeProperties properties) {
    this.properties = properties;
    byte[] secretBytes = properties.getJwt().getSecret().getBytes(StandardCharsets.UTF_8);
    if (secretBytes.length < 32) {
      // HS256 requires >= 256-bit key; pad for local defaults that are short.
      byte[] padded = new byte[32];
      System.arraycopy(secretBytes, 0, padded, 0, Math.min(secretBytes.length, 32));
      for (int i = secretBytes.length; i < 32; i++) {
        padded[i] = (byte) i;
      }
      secretBytes = padded;
    }
    this.key = Keys.hmacShaKeyFor(secretBytes);
  }

  public String createToken(UserPrincipal principal) {
    return createToken(principal, AUTH_STAGE_COMPLETE, properties.getJwt().getExpiration());
  }

  public String createMfaPendingToken(UserPrincipal principal) {
    return createToken(principal, AUTH_STAGE_MFA_PENDING, properties.getJwt().getMfaPendingExpiration());
  }

  public String createGooglePendingSignupToken(
      String providerUserId,
      String email,
      String name,
      String givenName,
      String familyName,
      String picture,
      String targetRole) {
    Instant now = Instant.now();
    Map<String, Object> claims = new HashMap<>();
    claims.put("typ", "google_pending");
    claims.put("provider", "google");
    claims.put("providerUserId", providerUserId);
    claims.put("email", email);
    claims.put("name", name);
    claims.put("firstName", givenName);
    claims.put("lastName", familyName);
    claims.put("picture", picture);
    claims.put("targetRole", targetRole);
    return Jwts.builder()
        .claims(claims)
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plus(Duration.ofMinutes(15))))
        .signWith(key, Jwts.SIG.HS256)
        .compact();
  }

  public Claims parseClaims(String token) {
    return Jwts.parser()
        .verifyWith(key)
        .build()
        .parseSignedClaims(token)
        .getPayload();
  }

  public String createToken(UserPrincipal principal, String authStage, String expiresIn) {
    Instant now = Instant.now();
    Duration ttl = parseDuration(expiresIn);
    Map<String, Object> claims = new HashMap<>();
    claims.put("id", principal.getId());
    claims.put("role", principal.getRole());
    claims.put("email", principal.getEmail());
    // Persist claim for compatibility, but authorization must still require role == admin.
    claims.put("isAdmin", "admin".equals(principal.getRole()));
    claims.put("authStage", authStage != null ? authStage : AUTH_STAGE_COMPLETE);

    return Jwts.builder()
        .claims(claims)
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plus(ttl)))
        .signWith(key, Jwts.SIG.HS256)
        .compact();
  }

  public UserPrincipal parseToken(String token) {
    Claims claims = Jwts.parser()
        .verifyWith(key)
        .build()
        .parseSignedClaims(token)
        .getPayload();

    Long id = toLong(claims.get("id"));
    String role = stringClaim(claims.get("role"));
    String email = stringClaim(claims.get("email"));
    String authStage = stringClaim(claims.get("authStage"));
    if (authStage == null || authStage.isBlank()) {
      authStage = AUTH_STAGE_COMPLETE;
    }
    // Never trust isAdmin claim alone — derive from role.
    boolean isAdmin = "admin".equals(role);
    return new UserPrincipal(id, role, email, isAdmin, authStage);
  }

  public Duration parseDuration(String value) {
    if (value == null || value.isBlank()) {
      return Duration.ofDays(7);
    }
    String v = value.trim().toLowerCase();
    try {
      if (v.endsWith("d")) {
        return Duration.ofDays(Long.parseLong(v.substring(0, v.length() - 1)));
      }
      if (v.endsWith("h")) {
        return Duration.ofHours(Long.parseLong(v.substring(0, v.length() - 1)));
      }
      if (v.endsWith("m")) {
        return Duration.ofMinutes(Long.parseLong(v.substring(0, v.length() - 1)));
      }
      if (v.endsWith("s")) {
        return Duration.ofSeconds(Long.parseLong(v.substring(0, v.length() - 1)));
      }
      if (v.startsWith("p") || v.startsWith("pt")) {
        return Duration.parse(v.toUpperCase());
      }
      return Duration.ofSeconds(Long.parseLong(v));
    } catch (Exception e) {
      return Duration.ofDays(7);
    }
  }

  private static Long toLong(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof Number n) {
      return n.longValue();
    }
    return Long.parseLong(String.valueOf(value));
  }

  private static String stringClaim(Object value) {
    return value == null ? null : String.valueOf(value);
  }
}
