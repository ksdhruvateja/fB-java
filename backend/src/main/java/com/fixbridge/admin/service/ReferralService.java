package com.fixbridge.admin.service;

import com.fixbridge.config.FixbridgeProperties;
import com.fixbridge.admin.entity.ReferralCodeMetaEntity;
import com.fixbridge.admin.entity.ReferralCreditEntity;
import com.fixbridge.admin.entity.ReferralRelationshipEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.admin.repository.ReferralCodeMetaRepository;
import com.fixbridge.admin.repository.ReferralCreditRepository;
import com.fixbridge.admin.repository.ReferralRelationshipRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class ReferralService {

  private static final int DEFAULT_REWARD_CENTS = 10_000;

  private final UserRepository userRepository;
  private final ReferralRelationshipRepository relationshipRepository;
  private final ReferralCreditRepository creditRepository;
  private final ReferralCodeMetaRepository codeMetaRepository;
  private final FixbridgeProperties properties;
  private final SecureRandom random = new SecureRandom();

  public ReferralService(
      UserRepository userRepository,
      ReferralRelationshipRepository relationshipRepository,
      ReferralCreditRepository creditRepository,
      ReferralCodeMetaRepository codeMetaRepository,
      FixbridgeProperties properties) {
    this.userRepository = userRepository;
    this.relationshipRepository = relationshipRepository;
    this.creditRepository = creditRepository;
    this.codeMetaRepository = codeMetaRepository;
    this.properties = properties;
  }

  @Transactional
  public Map<String, Object> me() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    UserEntity user =
        userRepository
            .findById(principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found."));
    String code = ensureReferralCode(user);
    List<ReferralRelationshipEntity> referrals =
        relationshipRepository.findByReferrerUserIdOrderByCreatedAtDesc(user.getId());
    if ("contractor".equals(user.getRole())) {
      referrals =
          referrals.stream().filter(r -> "contractor_customer".equals(r.getType())).toList();
    }
    Map<String, Object> credits = creditBalances(user.getId());
    String origin =
        properties.getAppUrl() != null
            ? properties.getAppUrl().replaceAll("/$", "")
            : "";
    String sharePath = "/?ref=" + (code == null ? "" : code);
    String link = origin.isBlank() ? sharePath : origin + sharePath;

    Map<String, Object> offer = new LinkedHashMap<>();
    if ("contractor".equals(user.getRole())) {
      offer.put("customerRewardCents", DEFAULT_REWARD_CENTS);
    } else {
      offer.put("youEarnCents", DEFAULT_REWARD_CENTS);
      offer.put("friendEarnsCents", DEFAULT_REWARD_CENTS);
    }

    List<Map<String, Object>> rows = new ArrayList<>();
    for (ReferralRelationshipEntity r : referrals) {
      rows.add(serialize(r));
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("code", code);
    body.put("link", link);
    body.put(
        "shareMessage",
        "I use FixBridge for home services. Use my referral code " + code + " when you sign up.");
    body.put("offer", offer);
    body.put("credits", credits);
    body.put("bonuses", "contractor".equals(user.getRole()) ? Map.of("availableCents", 0) : null);
    body.put("referrals", rows);
    body.put(
        "config",
        Map.of("combineWithCoupons", false, "maxCreditPerInvoiceCents", DEFAULT_REWARD_CENTS));
    return body;
  }

  @Transactional
  public Map<String, Object> applyCode(String rawCode) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    String code = rawCode == null ? "" : rawCode.trim().toUpperCase(Locale.ROOT);
    if (!StringUtils.hasText(code)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Referral code is required.");
    }
    UserEntity referred =
        userRepository
            .findById(principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found."));

    var existing = relationshipRepository.findByReferredUserId(referred.getId());
    if (existing.isPresent()) {
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("ok", true);
      body.put("alreadyApplied", true);
      body.put("relationship", serialize(existing.get()));
      body.put("message", "Referral already applied to this account.");
      return body;
    }

    if (StringUtils.hasText(referred.getReferredByCode())
        && !code.equalsIgnoreCase(referred.getReferredByCode())) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "This account is already attributed to another referral.");
    }

    ReferralCodeMetaEntity meta = codeMetaRepository.findByCodeIgnoreCase(code).orElse(null);
    if (meta != null && Boolean.TRUE.equals(meta.getDisabled())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "This referral code is disabled.");
    }

    UserEntity referrer =
        userRepository
            .findByReferralCodeIgnoreCase(code)
            .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Referral code not found."));
    if (referrer.getId().equals(referred.getId())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot use your own referral code.");
    }
    if (referrer.getEmail() != null
        && referrer.getEmail().equalsIgnoreCase(referred.getEmail())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot refer yourself.");
    }

    String type = resolveType(referrer.getRole(), referred.getRole());
    ReferralRelationshipEntity rel = new ReferralRelationshipEntity();
    rel.setPublicId("ref_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12));
    rel.setType(type);
    rel.setReferrerUserId(referrer.getId());
    rel.setReferredUserId(referred.getId());
    rel.setReferralCode(code);
    rel.setStatus("pending_qualification");
    if ("homeowner_homeowner".equals(type)) {
      rel.setReferrerRewardCents(DEFAULT_REWARD_CENTS);
      rel.setReferredRewardCents(DEFAULT_REWARD_CENTS);
      rel.setRewardType("credit");
    } else {
      rel.setReferrerRewardCents(DEFAULT_REWARD_CENTS);
      rel.setReferredRewardCents(0);
      rel.setRewardType("payout_bonus");
    }
    relationshipRepository.save(rel);
    referred.setReferredByCode(code);
    userRepository.save(referred);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("relationship", serialize(rel));
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> adminList(String type, String status) {
    SecurityUtils.requireAdminRole();
    List<Map<String, Object>> rows = new ArrayList<>();
    for (ReferralRelationshipEntity r :
        relationshipRepository.findAdminFiltered(
            StringUtils.hasText(type) ? type : null,
            StringUtils.hasText(status) ? status : null)) {
      Map<String, Object> row = serialize(r);
      userRepository
          .findById(r.getReferrerUserId())
          .ifPresent(
              u -> {
                row.put("referrerName", u.getName());
                row.put("referrerEmail", u.getEmail());
                row.put("referrerRole", u.getRole());
              });
      if (r.getReferredUserId() != null) {
        userRepository
            .findById(r.getReferredUserId())
            .ifPresent(
                u -> {
                  row.put("referredName", u.getName());
                  row.put("referredEmail", u.getEmail());
                  row.put("referredRole", u.getRole());
                });
      }
      rows.add(row);
    }
    return Map.of("ok", true, "referrals", rows);
  }

  public String ensureReferralCode(UserEntity user) {
    if (StringUtils.hasText(user.getReferralCode())) {
      upsertMeta(user.getId(), user.getReferralCode());
      return user.getReferralCode();
    }
    for (int i = 0; i < 12; i++) {
      String code = "FB" + Integer.toHexString(random.nextInt()).toUpperCase(Locale.ROOT);
      if (!userRepository.existsByReferralCodeIgnoreCase(code)) {
        user.setReferralCode(code);
        userRepository.save(user);
        upsertMeta(user.getId(), code);
        return code;
      }
    }
    return user.getReferralCode();
  }

  private void upsertMeta(Long userId, String code) {
    ReferralCodeMetaEntity meta =
        codeMetaRepository.findById(userId).orElseGet(ReferralCodeMetaEntity::new);
    meta.setUserId(userId);
    meta.setCode(code);
    if (meta.getDisabled() == null) {
      meta.setDisabled(false);
    }
    codeMetaRepository.save(meta);
  }

  private Map<String, Object> creditBalances(Long userId) {
    int available = 0;
    int pending = 0;
    int used = 0;
    for (ReferralCreditEntity c : creditRepository.findByUserIdOrderByCreatedAtDesc(userId)) {
      int amt = c.getAmountCents() == null ? 0 : c.getAmountCents();
      if ("earn".equals(c.getKind())) {
        if ("available".equals(c.getStatus())) {
          available += amt;
        } else if ("pending".equals(c.getStatus())) {
          pending += amt;
        } else if ("used".equals(c.getStatus())) {
          used += amt;
        }
      }
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("availableCents", available);
    out.put("pendingCents", pending);
    out.put("usedCents", used);
    return out;
  }

  private Map<String, Object> serialize(ReferralRelationshipEntity r) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", r.getId());
    out.put("publicId", r.getPublicId());
    out.put("type", r.getType());
    out.put("referrerUserId", r.getReferrerUserId());
    out.put("referredUserId", r.getReferredUserId());
    out.put("referralCode", r.getReferralCode());
    out.put("status", r.getStatus());
    out.put("statusLabel", statusLabel(r.getStatus()));
    out.put("referrerRewardCents", r.getReferrerRewardCents());
    out.put("referredRewardCents", r.getReferredRewardCents());
    out.put("rewardType", r.getRewardType());
    out.put("relatedJobId", r.getRelatedJobId());
    out.put("createdAt", r.getCreatedAt());
    out.put("updatedAt", r.getUpdatedAt());
    return out;
  }

  private static String resolveType(String referrerRole, String referredRole) {
    if ("contractor".equals(referrerRole) && "contractor".equals(referredRole)) {
      return "contractor_contractor";
    }
    if ("contractor".equals(referrerRole)) {
      return "contractor_customer";
    }
    return "homeowner_homeowner";
  }

  private static String statusLabel(String status) {
    if (!StringUtils.hasText(status)) {
      return "";
    }
    String[] parts = status.split("_");
    StringBuilder sb = new StringBuilder();
    for (String p : parts) {
      if (!sb.isEmpty()) {
        sb.append(' ');
      }
      sb.append(Character.toUpperCase(p.charAt(0))).append(p.substring(1));
    }
    return sb.toString();
  }
}
