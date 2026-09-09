package com.fixbridge.property.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.property.dto.request.PropertyCreateRequest;
import com.fixbridge.property.dto.response.PropertyDto;
import com.fixbridge.property.dto.request.PropertyUpdateRequest;
import com.fixbridge.property.entity.PropertyEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.property.mapper.PropertyMapper;
import com.fixbridge.property.repository.PropertyRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class PropertyService {

  private final PropertyRepository propertyRepository;
  private final PropertyMapper propertyMapper;
  private final ObjectMapper objectMapper;

  public PropertyService(
      PropertyRepository propertyRepository,
      PropertyMapper propertyMapper,
      ObjectMapper objectMapper) {
    this.propertyRepository = propertyRepository;
    this.propertyMapper = propertyMapper;
    this.objectMapper = objectMapper;
  }

  @Transactional(readOnly = true)
  public List<PropertyDto> listMine() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    Long ownerId = resolveOwnerScope(principal);
    return propertyRepository.findByOwnerUserIdOrderByCreatedAtAscIdAsc(ownerId).stream()
        .map(propertyMapper::toDto)
        .collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public PropertyDto getById(Long id) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    PropertyEntity property = loadOwnedOrAdmin(id, principal);
    return propertyMapper.toDto(property);
  }

  @Transactional
  public PropertyDto create(PropertyCreateRequest request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    if (request == null
        || !StringUtils.hasText(request.getAddressLine1())
        || !StringUtils.hasText(request.getCity())
        || !StringUtils.hasText(request.getState())
        || !StringUtils.hasText(request.getZip())) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Address Line 1, City, State, and ZIP Code are required.");
    }

    Long ownerId = principal.getId();
    long count = propertyRepository.countByOwnerUserId(ownerId);
    String label =
        StringUtils.hasText(request.getLabel())
            ? request.getLabel().trim()
            : "My Home " + (count + 1);

    PropertyEntity entity = new PropertyEntity();
    entity.setOwnerUserId(ownerId);
    entity.setLabel(truncate(label, 80));
    entity.setAddressLine1(truncate(request.getAddressLine1().trim(), 200));
    entity.setAddressLine2(blankToNull(request.getAddressLine2(), 200));
    entity.setCity(truncate(request.getCity().trim(), 80));
    entity.setState(truncate(request.getState().trim(), 40));
    entity.setZip(zip5(request.getZip()));
    entity.setPropertyType(blankToNull(request.getPropertyType(), 60));
    entity.setAccessNotes(blankToNull(request.getAccessNotes(), 500));
    entity.setPropertyPurpose(blankToNull(request.getPropertyPurpose(), 80));
    entity.setTransactionStage(blankToNull(request.getTransactionStage(), 80));
    entity.setCountry(
        StringUtils.hasText(request.getCountry()) ? truncate(request.getCountry().trim(), 40) : "US");
    entity.setStreetAddress(
        StringUtils.hasText(request.getStreetAddress())
            ? truncate(request.getStreetAddress().trim(), 200)
            : entity.getAddressLine1());
    entity.setYearBuilt(request.getYearBuilt());
    entity.setBeds(toDecimal(request.getBeds()));
    entity.setBaths(toDecimal(request.getBaths()));
    entity.setSqft(request.getSqft());
    entity.setHomeSystems(
        request.getHomeSystems() != null ? request.getHomeSystems() : objectMapper.createArrayNode());
    entity.setPostalCodePlus4(blankToNull(request.getPostalCodePlus4(), 16));
    entity.setTimezone(blankToNull(request.getTimezone(), 64));
    entity.setLatitude(request.getLatitude());
    entity.setLongitude(request.getLongitude());

    return propertyMapper.toDto(propertyRepository.save(entity));
  }

  @Transactional
  public PropertyDto update(Long id, PropertyUpdateRequest request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    PropertyEntity cur = loadOwnedOrAdmin(id, principal);
    if (request == null) {
      return propertyMapper.toDto(cur);
    }

    if (request.getLabel() != null) {
      cur.setLabel(truncate(request.getLabel(), 80));
    }
    if (request.getAddressLine1() != null) {
      cur.setAddressLine1(truncate(request.getAddressLine1(), 200));
    }
    if (request.getAddressLine2() != null) {
      cur.setAddressLine2(
          StringUtils.hasText(request.getAddressLine2())
              ? truncate(request.getAddressLine2(), 200)
              : null);
    }
    if (request.getCity() != null) {
      cur.setCity(truncate(request.getCity(), 80));
    }
    if (request.getState() != null) {
      cur.setState(truncate(request.getState(), 40));
    }
    if (request.getZip() != null) {
      cur.setZip(zip5(request.getZip()));
    }
    if (request.getCountry() != null) {
      cur.setCountry(truncate(request.getCountry(), 40));
    }
    if (request.getStreetAddress() != null) {
      cur.setStreetAddress(truncate(request.getStreetAddress(), 200));
    }
    if (request.getPropertyType() != null) {
      cur.setPropertyType(truncate(request.getPropertyType(), 60));
    }
    if (request.getAccessNotes() != null) {
      cur.setAccessNotes(
          StringUtils.hasText(request.getAccessNotes())
              ? truncate(request.getAccessNotes(), 500)
              : null);
    }
    if (request.getYearBuilt() != null || requestContainsExplicitNull(request.getYearBuilt())) {
      cur.setYearBuilt(request.getYearBuilt());
    }
    if (request.getBeds() != null) {
      cur.setBeds(toDecimal(request.getBeds()));
    }
    if (request.getBaths() != null) {
      cur.setBaths(toDecimal(request.getBaths()));
    }
    if (request.getSqft() != null) {
      cur.setSqft(request.getSqft());
    }
    if (request.getHomeSystems() != null) {
      cur.setHomeSystems(request.getHomeSystems());
    }
    if (request.getPostalCodePlus4() != null) {
      cur.setPostalCodePlus4(blankToNull(request.getPostalCodePlus4(), 16));
    }
    if (request.getTimezone() != null) {
      cur.setTimezone(blankToNull(request.getTimezone(), 64));
    }
    if (request.getLatitude() != null) {
      cur.setLatitude(request.getLatitude());
    }
    if (request.getLongitude() != null) {
      cur.setLongitude(request.getLongitude());
    }

    if (request.getBeds() != null || request.getBaths() != null || request.getSqft() != null) {
      ObjectNode health =
          cur.getHealthProfile() != null && cur.getHealthProfile().isObject()
              ? (ObjectNode) cur.getHealthProfile().deepCopy()
              : objectMapper.createObjectNode();
      if (request.getBeds() != null) {
        health.put("beds", request.getBeds());
      }
      if (request.getBaths() != null) {
        health.put("baths", request.getBaths());
      }
      if (request.getSqft() != null) {
        health.put("sqft", request.getSqft());
      }
      cur.setHealthProfile(health);
    }

    return propertyMapper.toDto(propertyRepository.save(cur));
  }

  /**
   * Load property only if owned by the caller, or if caller is admin.
   * Never returns another homeowner's property to a non-admin.
   */
  public PropertyEntity loadOwnedOrAdmin(Long id, UserPrincipal principal) {
    if (id == null || id <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid property id.");
    }
    if (SecurityUtils.isAdminRole(principal)) {
      return propertyRepository
          .findById(id)
          .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Property not found."));
    }
    return propertyRepository
        .findByIdAndOwnerUserId(id, principal.getId())
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Property not found."));
  }

  private Long resolveOwnerScope(UserPrincipal principal) {
    // List is always scoped to the authenticated user (admins manage via other endpoints).
    return principal.getId();
  }

  private static boolean requestContainsExplicitNull(Integer ignored) {
    return false;
  }

  private static String zip5(String zip) {
    if (zip == null) {
      return null;
    }
    String digits = zip.replaceAll("\\D", "");
    if (digits.length() >= 5) {
      return digits.substring(0, 5);
    }
    return zip.trim();
  }

  private static String truncate(String value, int max) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
  }

  private static String blankToNull(String value, int max) {
    if (!StringUtils.hasText(value)) {
      return null;
    }
    return truncate(value, max);
  }

  private static BigDecimal toDecimal(Double value) {
    return value == null ? null : BigDecimal.valueOf(value);
  }

  public static String normalizeEmail(String email) {
    return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
  }
}
