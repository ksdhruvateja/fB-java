package com.fixbridge.payment.service;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.payment.entity.DiscountCodeEntity;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.job.mapper.ManagedJobMapper;
import com.fixbridge.payment.repository.DiscountCodeRepository;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.authorization.ManagedJobAccess;
import com.fixbridge.security.authorization.RbacPermissions;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import com.fixbridge.common.util.DiscountMath;
import com.fixbridge.common.util.MoneyUtil;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.fixbridge.admin.service.AuditService;
@Service
public class DiscountService {

  private final DiscountCodeRepository discountCodeRepository;
  private final ManagedJobRepository managedJobRepository;
  private final UserRepository userRepository;
  private final CheckoutPricingService checkoutPricingService;
  private final ManagedJobMapper managedJobMapper;
  private final AuditService auditService;

  public DiscountService(
      DiscountCodeRepository discountCodeRepository,
      ManagedJobRepository managedJobRepository,
      UserRepository userRepository,
      CheckoutPricingService checkoutPricingService,
      ManagedJobMapper managedJobMapper,
      AuditService auditService) {
    this.discountCodeRepository = discountCodeRepository;
    this.managedJobRepository = managedJobRepository;
    this.userRepository = userRepository;
    this.checkoutPricingService = checkoutPricingService;
    this.managedJobMapper = managedJobMapper;
    this.auditService = auditService;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> lookupPublic(String code) {
    String normalized = DiscountMath.normalizeDiscountCode(code);
    if (!StringUtils.hasText(normalized)) {
      return Map.of("ok", true, "discount", null, "message", "Enter a coupon code.");
    }
    DiscountCodeEntity row =
        discountCodeRepository.findActiveByCodeIgnoreCase(normalized).orElse(null);
    Map<String, Object> validated = validateRow(row);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    if (!Boolean.TRUE.equals(validated.get("ok"))) {
      body.put("discount", null);
      body.put("message", validated.get("message"));
      return body;
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> discount = (Map<String, Object>) validated.get("discount");
    body.put("discount", publicView(discount));
    return body;
  }

  @Transactional
  public Map<String, Object> applyCouponToJob(Long jobId, Map<String, Object> body) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job = requireJobOwnerOrAdmin(jobId, principal);
    if (Boolean.TRUE.equals(job.getVisitFeeAuthorized()) || job.getCouponRedeemedAt() != null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Coupon can no longer be changed on this job.");
    }
    String code =
        body != null && body.get("code") != null
            ? DiscountMath.normalizeDiscountCode(String.valueOf(body.get("code")))
            : "";
    if (!StringUtils.hasText(code)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Coupon code is required.");
    }
    DiscountCodeEntity row =
        discountCodeRepository
            .findActiveByCodeIgnoreCase(code)
            .orElseThrow(
                () ->
                    new ApiException(
                        HttpStatus.BAD_REQUEST, "This coupon is not valid for this service."));
    Map<String, Object> validated = validateRow(row);
    if (!Boolean.TRUE.equals(validated.get("ok"))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, String.valueOf(validated.get("message")));
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> discount = (Map<String, Object>) validated.get("discount");
    persistJobDiscount(job, discount);
    ObjectNode snapshot = checkoutPricingService.buildCheckoutBreakdown(job);
    job.setCheckoutSnapshot(snapshot);
    job.setCouponDiscountAmount(snapshot.path("couponDiscount").decimalValue());
    job.setServiceFeeAmount(snapshot.path("serviceFee").decimalValue());
    job.setFinalCustomerAmount(snapshot.path("finalAmount").decimalValue());
    job.setUpdatedAt(OffsetDateTime.now());
    managedJobRepository.save(job);

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("ok", true);
    response.put("job", managedJobMapper.toDto(job, principal));
    response.put("breakdown", snapshot);
    response.put("snapshot", snapshot);
    response.put("discount", publicView(discount));
    return response;
  }

  @Transactional
  public Map<String, Object> clearCouponFromJob(Long jobId) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job = requireJobOwnerOrAdmin(jobId, principal);
    if (Boolean.TRUE.equals(job.getVisitFeeAuthorized()) || job.getCouponRedeemedAt() != null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Coupon can no longer be changed on this job.");
    }
    job.setDiscountCode(null);
    job.setDiscountType(null);
    job.setDiscountValue(null);
    job.setDiscountLabel(null);
    job.setCouponDiscountAmount(null);
    job.setCheckoutSnapshot(null);
    job.setUpdatedAt(OffsetDateTime.now());
    managedJobRepository.save(job);
    ObjectNode snapshot = checkoutPricingService.buildCheckoutBreakdown(job);
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("ok", true);
    response.put("job", managedJobMapper.toDto(job, principal));
    response.put("breakdown", snapshot);
    return response;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> listAdmin() {
    requireAdmin();
    List<Map<String, Object>> discounts =
        discountCodeRepository.findAllNotDeleted().stream()
            .map(this::adminView)
            .collect(Collectors.toList());
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("discounts", discounts);
    return body;
  }

  @Transactional
  public Map<String, Object> createAdmin(Map<String, Object> body) {
    UserPrincipal principal = requireAdminWrite();
    if (body == null || body.get("code") == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "code is required.");
    }
    String code = DiscountMath.normalizeDiscountCode(String.valueOf(body.get("code")));
    if (code.length() < 3) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Coupon code must be at least 3 characters.");
    }
    if (discountCodeRepository.findActiveByCodeIgnoreCase(code).isPresent()) {
      throw new ApiException(HttpStatus.CONFLICT, "A coupon with this code already exists.");
    }
    String type = normalizeType(body.get("discountType") != null ? body.get("discountType") : body.get("type"));
    BigDecimal value =
        body.get("value") != null
            ? new BigDecimal(String.valueOf(body.get("value")))
            : BigDecimal.ZERO;
    if (value.compareTo(BigDecimal.ZERO) <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "value must be positive.");
    }
    if ("percent".equals(type) && value.compareTo(BigDecimal.valueOf(90)) > 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Percent coupons cannot exceed 90%.");
    }

    DiscountCodeEntity row = new DiscountCodeEntity();
    row.setCode(code);
    row.setLabel(body.get("label") != null ? String.valueOf(body.get("label")).trim() : code);
    row.setDiscountType(type);
    row.setValue(MoneyUtil.dollars(value));
    row.setActive(body.get("active") == null || Boolean.parseBoolean(String.valueOf(body.get("active"))));
    row.setMaxUses(parseIntOrNull(body.get("maxUses")));
    row.setPerUserLimit(parseIntOrNull(body.get("perUserLimit")));
    row.setNotes(body.get("notes") != null ? String.valueOf(body.get("notes")) : null);
    row.setStartsAt(parseTime(body.get("startsAt")));
    row.setExpiresAt(parseTime(body.get("expiresAt")));
    row.setCreatedBy(principal.getId());
    row = discountCodeRepository.save(row);
    auditService.write(principal.getId(), "referral_code_create", "discount", row.getId(), adminView(row));

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("ok", true);
    response.put("discount", adminView(row));
    return response;
  }

  @Transactional
  public Map<String, Object> updateAdmin(Long id, Map<String, Object> body) {
    UserPrincipal principal = requireAdminWrite();
    DiscountCodeEntity row =
        discountCodeRepository
            .findById(id)
            .filter(d -> d.getDeletedAt() == null)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Discount not found."));
    if (body != null) {
      if (body.containsKey("active")) {
        row.setActive(Boolean.parseBoolean(String.valueOf(body.get("active"))));
      }
      if (body.get("label") != null) {
        row.setLabel(String.valueOf(body.get("label")).trim());
      }
      if (body.get("discountType") != null || body.get("type") != null) {
        row.setDiscountType(
            normalizeType(body.get("discountType") != null ? body.get("discountType") : body.get("type")));
      }
      if (body.get("value") != null) {
        BigDecimal value = new BigDecimal(String.valueOf(body.get("value")));
        if ("percent".equals(row.getDiscountType()) && value.compareTo(BigDecimal.valueOf(90)) > 0) {
          throw new ApiException(HttpStatus.BAD_REQUEST, "Percent coupons cannot exceed 90%.");
        }
        row.setValue(MoneyUtil.dollars(value));
      }
      if (body.containsKey("maxUses")) {
        row.setMaxUses(parseIntOrNull(body.get("maxUses")));
      }
      if (body.containsKey("notes")) {
        row.setNotes(body.get("notes") == null ? null : String.valueOf(body.get("notes")));
      }
    }
    row = discountCodeRepository.save(row);
    auditService.write(principal.getId(), "referral_code_update", "discount", row.getId(), adminView(row));
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("ok", true);
    response.put("discount", adminView(row));
    return response;
  }

  @Transactional
  public Map<String, Object> deleteAdmin(Long id) {
    UserPrincipal principal = requireAdminWrite();
    DiscountCodeEntity row =
        discountCodeRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Discount not found."));
    int uses = row.getUsesCount() == null ? 0 : row.getUsesCount();
    if (uses > 0) {
      row.setDeletedAt(OffsetDateTime.now());
      row.setActive(false);
      discountCodeRepository.save(row);
    } else {
      discountCodeRepository.delete(row);
    }
    auditService.write(principal.getId(), "referral_code_delete", "discount", id, Map.of("uses", uses));
    return Map.of("ok", true);
  }

  /** Apply catalog coupon fields onto a job during prepare-checkout when discountCode provided. */
  @Transactional
  public void applyCodeOntoJobIfPresent(ManagedJobEntity job, String rawCode) {
    String code = DiscountMath.normalizeDiscountCode(rawCode);
    if (!StringUtils.hasText(code)) {
      return;
    }
    DiscountCodeEntity row = discountCodeRepository.findActiveByCodeIgnoreCase(code).orElse(null);
    Map<String, Object> validated = validateRow(row);
    if (!Boolean.TRUE.equals(validated.get("ok"))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, String.valueOf(validated.get("message")));
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> discount = (Map<String, Object>) validated.get("discount");
    persistJobDiscount(job, discount);
  }

  @Transactional
  public void redeemIfNeeded(ManagedJobEntity job) {
    if (job == null || job.getCouponRedeemedAt() != null || !StringUtils.hasText(job.getDiscountCode())) {
      return;
    }
    DiscountCodeEntity row =
        discountCodeRepository.findActiveByCodeIgnoreCase(job.getDiscountCode()).orElse(null);
    if (row == null) {
      job.setCouponRedeemedAt(OffsetDateTime.now());
      return;
    }
    Integer maxUses = row.getMaxUses();
    int uses = row.getUsesCount() == null ? 0 : row.getUsesCount();
    if (maxUses != null && uses >= maxUses) {
      return;
    }
    if (row.getPerUserLimit() != null
        && row.getPerUserLimit() > 0
        && job.getHomeownerUserId() != null) {
      long redeemed =
          managedJobRepository.countRedeemedByUserAndCode(job.getHomeownerUserId(), row.getCode());
      if (redeemed >= row.getPerUserLimit()) {
        return;
      }
    }
    row.setUsesCount(uses + 1);
    discountCodeRepository.save(row);
    job.setCouponRedeemedAt(OffsetDateTime.now());
  }

  public Map<String, Object> validateRow(DiscountCodeEntity row) {
    Map<String, Object> out = new LinkedHashMap<>();
    if (row == null || row.getDeletedAt() != null) {
      out.put("ok", false);
      out.put("message", "This coupon is not valid for this service.");
      return out;
    }
    if (Boolean.FALSE.equals(row.getActive())) {
      out.put("ok", false);
      out.put("message", "This coupon is not valid for this service.");
      return out;
    }
    OffsetDateTime now = OffsetDateTime.now();
    if (row.getStartsAt() != null && row.getStartsAt().isAfter(now)) {
      out.put("ok", false);
      out.put("message", "This coupon is not valid for this service.");
      return out;
    }
    if (row.getExpiresAt() != null && row.getExpiresAt().isBefore(now)) {
      out.put("ok", false);
      out.put("message", "This coupon has expired.");
      return out;
    }
    Integer maxUses = row.getMaxUses();
    int uses = row.getUsesCount() == null ? 0 : row.getUsesCount();
    if (maxUses != null && uses >= maxUses) {
      out.put("ok", false);
      out.put("message", "This coupon is not valid for this service.");
      return out;
    }
    String type = normalizeType(row.getDiscountType());
    BigDecimal value = row.getValue();
    if (value == null || value.compareTo(BigDecimal.ZERO) <= 0) {
      out.put("ok", false);
      out.put("message", "This coupon is not valid for this service.");
      return out;
    }
    if ("percent".equals(type) && value.compareTo(BigDecimal.valueOf(90)) > 0) {
      out.put("ok", false);
      out.put("message", "This coupon is not valid for this service.");
      return out;
    }
    Map<String, Object> discount = new LinkedHashMap<>();
    discount.put("id", row.getId());
    discount.put("code", row.getCode().toUpperCase(Locale.ROOT));
    discount.put("label", row.getLabel());
    discount.put("discountType", type);
    discount.put("value", value);
    out.put("ok", true);
    out.put("discount", discount);
    return out;
  }

  private void persistJobDiscount(ManagedJobEntity job, Map<String, Object> discount) {
    job.setDiscountCode(String.valueOf(discount.get("code")));
    job.setDiscountType(String.valueOf(discount.get("discountType")));
    job.setDiscountValue(new BigDecimal(String.valueOf(discount.get("value"))));
    job.setDiscountLabel(
        discount.get("label") != null ? String.valueOf(discount.get("label")) : null);
  }

  private Map<String, Object> publicView(Map<String, Object> discount) {
    if (discount == null) {
      return null;
    }
    String type = String.valueOf(discount.get("discountType"));
    BigDecimal value = new BigDecimal(String.valueOf(discount.get("value")));
    Map<String, Object> view = new LinkedHashMap<>();
    view.put("code", discount.get("code"));
    view.put("label", discount.get("label"));
    view.put("discountType", type);
    view.put("value", value);
    view.put(
        "summary",
        "amount".equals(type)
            ? ("$" + value.setScale(0, java.math.RoundingMode.HALF_UP) + " off")
            : (value.setScale(0, java.math.RoundingMode.HALF_UP) + "% off"));
    return view;
  }

  private Map<String, Object> adminView(DiscountCodeEntity row) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", row.getId());
    m.put("code", row.getCode());
    m.put("label", row.getLabel());
    m.put("discountType", row.getDiscountType());
    m.put("value", row.getValue());
    m.put("active", row.getActive());
    m.put("maxUses", row.getMaxUses());
    m.put("usesCount", row.getUsesCount());
    m.put("perUserLimit", row.getPerUserLimit());
    m.put("startsAt", row.getStartsAt() != null ? row.getStartsAt().toString() : null);
    m.put("expiresAt", row.getExpiresAt() != null ? row.getExpiresAt().toString() : null);
    m.put("notes", row.getNotes());
    m.put("createdAt", row.getCreatedAt() != null ? row.getCreatedAt().toString() : null);
    return m;
  }

  private ManagedJobEntity requireJobOwnerOrAdmin(Long jobId, UserPrincipal principal) {
    ManagedJobEntity job =
        managedJobRepository
            .findById(jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found."));
    boolean allowed =
        ManagedJobAccess.isAdminRole(principal)
            || ManagedJobAccess.isHomeownerOwner(principal, job.getHomeownerUserId());
    if (!allowed) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }
    return job;
  }

  private UserPrincipal requireAdmin() {
    SecurityUtils.requireAdminRole();
    return SecurityUtils.requirePrincipal();
  }

  private UserPrincipal requireAdminWrite() {
    UserPrincipal principal = requireAdmin();
    UserEntity admin =
        userRepository
            .findById(principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "Admin access required."));
    String level =
        RbacPermissions.presetToAccessLevel(
            RbacPermissions.resolveAdminPreset(
                admin.getRole(), admin.getAdminRolePreset(), admin.getAdminAccessLevel()));
    if ("read".equals(level)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Read-only admin cannot modify discounts.");
    }
    return principal;
  }

  private static String normalizeType(Object raw) {
    String t = raw == null ? "percent" : String.valueOf(raw).toLowerCase(Locale.ROOT);
    if ("amount".equals(t) || "fixed".equals(t)) {
      return "amount";
    }
    return "percent";
  }

  private static Integer parseIntOrNull(Object raw) {
    if (raw == null || String.valueOf(raw).isBlank()) {
      return null;
    }
    try {
      return Integer.parseInt(String.valueOf(raw).trim());
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private static OffsetDateTime parseTime(Object raw) {
    if (raw == null || String.valueOf(raw).isBlank()) {
      return null;
    }
    try {
      return OffsetDateTime.parse(String.valueOf(raw).trim());
    } catch (Exception e) {
      return null;
    }
  }
}
