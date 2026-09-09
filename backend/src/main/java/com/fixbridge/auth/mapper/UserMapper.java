package com.fixbridge.auth.mapper;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fixbridge.auth.dto.response.UserDto;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.security.authorization.RbacPermissions;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class UserMapper {

  private final ObjectMapper objectMapper;

  public UserMapper(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public UserDto toDto(UserEntity entity) {
    if (entity == null) {
      return null;
    }
    UserDto dto = new UserDto();
    dto.setId(entity.getId());
    dto.setRole(entity.getRole());
    dto.setName(entity.getName());
    dto.setEmail(entity.getEmail());
    // Never trust is_admin column alone for admin access.
    dto.setIsAdmin("admin".equals(entity.getRole()));
    dto.setTrade(blankToNull(entity.getTrade()));
    dto.setLicenseNumber(blankToNull(entity.getLicenseNumber()));
    if (entity.getLicenseExpiresAt() != null) {
      dto.setLicenseExpiresAt(entity.getLicenseExpiresAt().toString());
    }
    if (entity.getInsuranceExpiresAt() != null) {
      dto.setInsuranceExpiresAt(entity.getInsuranceExpiresAt().toString());
    }
    dto.setComplianceStatus(blankToNull(entity.getComplianceStatus()));
    dto.setDispatchEligible(Boolean.TRUE.equals(entity.getDispatchEligible()));
    dto.setLevel1Eligible(Boolean.TRUE.equals(entity.getLevel1Eligible()));
    dto.setLevel2Eligible(Boolean.TRUE.equals(entity.getLevel2Eligible()));
    dto.setOverallComplianceStatus(blankToNull(entity.getOverallComplianceStatus()));
    dto.setLicenseDocumentName(blankToNull(entity.getLicenseDocumentName()));
    dto.setInsuranceDocumentName(blankToNull(entity.getInsuranceDocumentName()));
    dto.setIdDocumentName(blankToNull(entity.getIdDocumentName()));
    dto.setPhotoDataUrl(blankToNull(entity.getPhotoDataUrl()));
    dto.setPhone(blankToNull(entity.getPhone()));
    dto.setAddress(blankToNull(entity.getAddress()));
    dto.setAddressVerified(Boolean.TRUE.equals(entity.getAddressVerified()));
    dto.setPostalCodePlus4(blankToNull(entity.getPostalCodePlus4()));
    dto.setAddressVerificationProvider(blankToNull(entity.getAddressVerificationProvider()));
    dto.setContactEmail(blankToNull(entity.getContactEmail()));
    dto.setCompanyName(blankToNull(entity.getCompanyName()));
    dto.setCompanyDetails(blankToNull(entity.getCompanyDetails()));
    dto.setInsuranceDetails(blankToNull(entity.getInsuranceDetails()));
    dto.setIsBlocked(entity.isBlocked());
    dto.setIsGoogleAccount(
        entity.getOauthGoogleSub() != null && !entity.getOauthGoogleSub().isBlank()
            || "google".equalsIgnoreCase(entity.getSignupMethod()));
    dto.setIsAppleAccount("APPLE_OAUTH".equals(entity.getPassword()));
    dto.setIsAuth0Account("AUTH0_OAUTH".equals(entity.getPassword()));
    dto.setPlanCode(blankToNull(entity.getPlanCode()));
    dto.setServiceZips(parseStringList(entity.getServiceZips()));
    dto.setTravelRadiusMiles(entity.getTravelRadiusMiles());
    dto.setVisitFee(toDouble(entity.getVisitFee()));
    dto.setEmergencyVisitFee(toDouble(entity.getEmergencyVisitFee()));
    dto.setAfterHoursFee(toDouble(entity.getAfterHoursFee()));
    dto.setWeekendFee(toDouble(entity.getWeekendFee()));
    dto.setCancellationFee(toDouble(entity.getCancellationFee()));
    dto.setMinimumLaborFee(toDouble(entity.getMinimumLaborFee()));
    dto.setFreeEstimate(Boolean.TRUE.equals(entity.getFreeEstimate()));
    dto.setVisitAppliesToRepair(Boolean.TRUE.equals(entity.getVisitAppliesToRepair()));
    dto.setGender(blankToNull(entity.getGender()));
    dto.setDob(blankToNull(entity.getDob()));
    dto.setReferralCode(blankToNull(entity.getReferralCode()));
    dto.setReferredByCode(blankToNull(entity.getReferredByCode()));
    dto.setAdminAccessLevel(entity.getAdminAccessLevel() != null ? entity.getAdminAccessLevel() : "read-write");
    String preset = RbacPermissions.resolveAdminPreset(
        entity.getRole(), entity.getAdminRolePreset(), entity.getAdminAccessLevel());
    dto.setAdminRolePreset(preset);
    if ("admin".equals(entity.getRole())) {
      dto.setPermissions(new ArrayList<>(RbacPermissions.permissionsForPreset(preset)));
    }
    dto.setStripeAccountId(blankToNull(entity.getStripeAccountId()));
    dto.setStripeOnboardingStatus(blankToNull(entity.getStripeOnboardingStatus()));
    return dto;
  }

  private List<String> parseStringList(String json) {
    if (json == null || json.isBlank()) {
      return null;
    }
    try {
      return objectMapper.readValue(json, new TypeReference<List<String>>() {});
    } catch (Exception e) {
      return null;
    }
  }

  private static Double toDouble(BigDecimal value) {
    return value == null ? null : value.doubleValue();
  }

  private static String blankToNull(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value;
  }
}
