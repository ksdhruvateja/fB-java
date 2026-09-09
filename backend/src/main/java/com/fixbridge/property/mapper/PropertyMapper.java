package com.fixbridge.property.mapper;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fixbridge.property.dto.response.PropertyDto;
import com.fixbridge.property.entity.PropertyEntity;
import java.math.BigDecimal;
import java.util.Collections;
import org.springframework.stereotype.Component;

@Component
public class PropertyMapper {

  private final ObjectMapper objectMapper;

  public PropertyMapper(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public PropertyDto toDto(PropertyEntity entity) {
    if (entity == null) {
      return null;
    }
    PropertyDto dto = new PropertyDto();
    dto.setId(entity.getId());
    dto.setLabel(entity.getLabel());
    dto.setAddressLine1(entity.getAddressLine1());
    dto.setAddressLine2(entity.getAddressLine2());
    dto.setCity(entity.getCity());
    dto.setState(entity.getState());
    dto.setZip(entity.getZip());
    dto.setPostalCodePlus4(entity.getPostalCodePlus4());
    dto.setAddressVerified(Boolean.TRUE.equals(entity.getAddressVerified()));
    if (entity.getAddressVerifiedAt() != null) {
      dto.setAddressVerifiedAt(entity.getAddressVerifiedAt().toString());
    }
    dto.setAddressVerificationProvider(entity.getAddressVerificationProvider());
    dto.setPropertyType(entity.getPropertyType());
    dto.setAccessNotes(entity.getAccessNotes());
    dto.setPropertyPurpose(entity.getPropertyPurpose());
    dto.setTransactionStage(entity.getTransactionStage());
    dto.setCountry(entity.getCountry() != null ? entity.getCountry() : "US");
    dto.setStreetAddress(
        entity.getStreetAddress() != null ? entity.getStreetAddress() : entity.getAddressLine1());
    dto.setYearBuilt(entity.getYearBuilt());

    JsonNode health = entity.getHealthProfile();
    dto.setBeds(firstDouble(entity.getBeds(), health, "beds"));
    dto.setBaths(firstDouble(entity.getBaths(), health, "baths"));
    Integer sqft = entity.getSqft();
    if (sqft == null && health != null && health.hasNonNull("sqft")) {
      sqft = health.get("sqft").asInt();
    }
    dto.setSqft(sqft);

    JsonNode systems = entity.getHomeSystems();
    if (systems == null || systems.isNull()) {
      systems = emptyArray();
    }
    dto.setHomeSystems(systems);
    dto.setHealthProfile(health);
    dto.setTimezone(entity.getTimezone());
    dto.setLatitude(entity.getLatitude());
    dto.setLongitude(entity.getLongitude());
    dto.setDocuments(Collections.emptyList());
    return dto;
  }

  private ArrayNode emptyArray() {
    return objectMapper.createArrayNode();
  }

  private static Double firstDouble(BigDecimal primary, JsonNode health, String field) {
    if (primary != null) {
      return primary.doubleValue();
    }
    if (health != null && health.hasNonNull(field)) {
      return health.get(field).asDouble();
    }
    return null;
  }
}
