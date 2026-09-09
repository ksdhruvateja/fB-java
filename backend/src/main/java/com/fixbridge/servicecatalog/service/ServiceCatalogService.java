package com.fixbridge.servicecatalog.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fixbridge.servicecatalog.dto.ServiceOfferingDto;
import com.fixbridge.servicecatalog.dto.ServiceOfferingUpdateRequest;
import com.fixbridge.servicecatalog.entity.ServiceOfferingEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.servicecatalog.repository.ServiceOfferingRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class ServiceCatalogService implements ApplicationRunner {

  private static final Logger log = LoggerFactory.getLogger(ServiceCatalogService.class);

  private final ServiceOfferingRepository repository;
  private final ObjectMapper objectMapper;

  public ServiceCatalogService(ServiceOfferingRepository repository, ObjectMapper objectMapper) {
    this.repository = repository;
    this.objectMapper = objectMapper;
  }

  @Override
  @Transactional
  public void run(ApplicationArguments args) {
    long count = repository.count();
    if (count > 0) {
      log.info("Service catalog already seeded ({} offerings).", count);
      return;
    }
    List<ServiceOfferingEntity> seeds = buildSeedOfferings();
    repository.saveAll(seeds);
    log.info("Seeded {} service offerings.", seeds.size());
  }

  @Transactional(readOnly = true)
  public List<ServiceOfferingDto> listPublicOfferings() {
    return repository.findByActiveTrueAndHomeownerVisibleTrueOrderBySortOrderAscNameAsc().stream()
        .map(this::toDto)
        .collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public List<ServiceOfferingDto> listAdminOfferings() {
    return repository.findAllByOrderBySortOrderAscNameAsc().stream()
        .map(this::toDto)
        .collect(Collectors.toList());
  }

  @Transactional
  public ServiceOfferingDto update(String id, ServiceOfferingUpdateRequest request) {
    if (!StringUtils.hasText(id)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Service id is required.");
    }
    ServiceOfferingEntity entity =
        repository
            .findById(id.trim())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Service not found."));
    if (request == null) {
      return toDto(entity);
    }
    if (StringUtils.hasText(request.getName())) {
      entity.setName(truncate(request.getName().trim(), 120));
    }
    if (request.getDescription() != null) {
      entity.setDescription(truncate(request.getDescription().trim(), 512));
    }
    if (request.getIconKey() != null) {
      entity.setIconKey(blankToNull(request.getIconKey(), 64));
    }
    if (request.getOneTimeProfessional() != null) {
      entity.setOneTimeProfessional(request.getOneTimeProfessional());
    }
    if (request.getDiyEligible() != null) {
      entity.setDiyEligible(request.getDiyEligible());
    }
    if (request.getAiAssessmentEligible() != null) {
      entity.setAiAssessmentEligible(request.getAiAssessmentEligible());
    }
    if (request.getSubscriptionEligible() != null) {
      entity.setSubscriptionEligible(request.getSubscriptionEligible());
    }
    if (request.getEmergencyEligible() != null) {
      entity.setEmergencyEligible(request.getEmergencyEligible());
    }
    if (request.getActive() != null) {
      entity.setActive(request.getActive());
    }
    if (request.getHomeownerVisible() != null) {
      entity.setHomeownerVisible(request.getHomeownerVisible());
    }
    if (request.getPricingMetadata() != null) {
      entity.setPricingMetadata(request.getPricingMetadata());
    }
    if (request.getSortOrder() != null) {
      entity.setSortOrder(request.getSortOrder());
    }
    return toDto(repository.save(entity));
  }

  private ServiceOfferingDto toDto(ServiceOfferingEntity entity) {
    ServiceOfferingDto dto = new ServiceOfferingDto();
    dto.setId(entity.getId());
    dto.setSlug(entity.getSlug());
    dto.setName(entity.getName());
    dto.setDescription(entity.getDescription());
    dto.setIconKey(entity.getIconKey());
    dto.setOneTimeProfessional(entity.getOneTimeProfessional());
    dto.setDiyEligible(entity.getDiyEligible());
    dto.setAiAssessmentEligible(entity.getAiAssessmentEligible());
    dto.setSubscriptionEligible(entity.getSubscriptionEligible());
    dto.setEmergencyEligible(entity.getEmergencyEligible());
    dto.setActive(entity.getActive());
    dto.setHomeownerVisible(entity.getHomeownerVisible());
    dto.setPricingMetadata(entity.getPricingMetadata());
    dto.setSortOrder(entity.getSortOrder());
    return dto;
  }

  private List<ServiceOfferingEntity> buildSeedOfferings() {
    List<SeedSpec> specs = defaultSpecs();
    List<ServiceOfferingEntity> out = new ArrayList<>(specs.size());
    int order = 10;
    for (SeedSpec spec : specs) {
      ServiceOfferingEntity e = new ServiceOfferingEntity();
      e.setId(spec.slug);
      e.setSlug(spec.slug);
      e.setName(spec.name);
      e.setDescription(spec.description);
      e.setIconKey(spec.slug);
      e.setOneTimeProfessional(true);
      e.setDiyEligible(spec.diyEligible);
      e.setAiAssessmentEligible(true);
      e.setSubscriptionEligible(spec.subscriptionEligible);
      e.setEmergencyEligible(spec.emergencyEligible);
      e.setActive(true);
      e.setHomeownerVisible(true);
      e.setSortOrder(order);
      order += 10;
      if (spec.subServices != null && !spec.subServices.isEmpty()) {
        e.setPricingMetadata(subServicesMetadata(spec.subServices));
      }
      out.add(e);
    }
    return out;
  }

  private JsonNode subServicesMetadata(List<Map.Entry<String, String>> subServices) {
    ObjectNode root = objectMapper.createObjectNode();
    ArrayNode arr = root.putArray("subServices");
    for (Map.Entry<String, String> row : subServices) {
      ObjectNode item = arr.addObject();
      item.put("id", row.getKey());
      item.put("label", row.getValue());
    }
    return root;
  }

  private static List<SeedSpec> defaultSpecs() {
    List<SeedSpec> list = new ArrayList<>();
    list.add(spec("appliances", "Appliances", "Kitchen and home appliance repair and install.", true, false, true));
    list.add(spec("awnings", "Awnings", "Awning repair, install, and seasonal service.", true, false, false));
    list.add(spec("carpentry", "Carpentry", "Framing, trim, cabinets, and woodwork.", true, false, false));
    list.add(spec("concrete_asphalt", "Concrete / Asphalt", "Driveways, slabs, patching, and asphalt work.", false, false, false));
    list.add(spec("doors_hardware", "Doors / Hardware", "Door install, hardware, and adjustments.", true, false, false));
    list.add(spec("electrical", "Electrical", "Outlets, panels, lighting circuits, and troubleshooting.", true, false, true));
    list.add(spec("environmental", "Environmental", "Environmental remediation and related services.", false, false, true));
    list.add(spec("equipment", "Equipment", "Specialty equipment service and install.", true, false, false));
    list.add(spec("finishes_fixtures", "Finishes / Fixtures", "Interior finishes, fixtures, and trim-out.", true, false, false));
    list.add(spec("fire_life_safety", "Fire Life Safety", "Alarms, extinguishers, and life-safety systems.", false, false, true));
    list.add(spec("flooring", "Flooring", "Floor repair, install, and refinishing.", true, false, false));
    list.add(spec("gates_fences", "Gates / Fences", "Fence and gate repair, install, and operators.", true, false, false));
    list.add(spec("general_contractor", "General Contractor", "Multi-trade coordination and general contracting.", false, false, false));
    list.add(spec("handyman", "Handyman", "Small repairs and general home maintenance.", true, false, false));
    list.add(spec("hvac", "HVAC", "Heating, cooling, ventilation repair and maintenance.", true, true, true));
    list.add(spec("janitorial", "Janitorial", "Commercial-style janitorial and facility cleaning.", false, true, false));
    list.add(
        spec(
            "landscaping",
            "Landscaping",
            "Outdoor maintenance and lawn care.",
            false,
            true,
            false,
            landscapingSubServices()));
    list.add(spec("lighting", "Lighting", "Interior and exterior lighting service.", true, false, false));
    list.add(spec("locks", "Locks", "Locksets, rekeying, and access hardware.", true, false, true));
    list.add(spec("painting", "Painting", "Interior and exterior painting.", true, false, false));
    list.add(spec("pest_control", "Pest Control", "Prevention and treatment for common pests.", false, true, true));
    list.add(spec("plumbing", "Plumbing", "Leaks, drains, fixtures, and water systems.", true, true, true));
    list.add(spec("professional_services", "Professional Services", "Inspections and professional consulting services.", false, false, false));
    list.add(spec("refrigeration", "Refrigeration", "Commercial and specialty refrigeration service.", false, false, true));
    list.add(spec("roofing_siding", "Roofing / Siding", "Roof and siding repair, leaks, and inspections.", false, true, true));
    list.add(spec("security", "Security", "Security systems, cameras, and monitoring setup.", false, false, true));
    list.add(spec("signage", "Signage", "Sign install, repair, and wayfinding.", true, false, false));
    list.add(
        spec(
            "snow_removal",
            "Snow Removal",
            "Driveways, walkways, and seasonal snow care.",
            false,
            true,
            true,
            snowRemovalSubServices()));
    list.add(spec("technology", "Technology", "Smart home, low-voltage, and technology installs.", true, false, false));
    list.add(spec("temporary_protection", "Temporary Protection", "Temporary barriers, covers, and site protection.", false, false, true));
    list.add(spec("waste_management", "Waste Management", "Junk removal and waste haul-away.", false, false, false));
    list.add(spec("welding", "Welding", "On-site welding and metal fabrication repairs.", false, false, false));
    list.add(spec("windows_glass", "Windows / Glass", "Window and glass repair or replacement.", true, false, false));
    list.add(
        spec(
            "cleaning_service",
            "Cleaning Service",
            "Home cleaning for routine, deep, and recurring needs.",
            false,
            true,
            false,
            cleaningSubServices()));
    return list;
  }

  private static SeedSpec spec(
      String slug,
      String name,
      String description,
      boolean diyEligible,
      boolean subscriptionEligible,
      boolean emergencyEligible) {
    return spec(slug, name, description, diyEligible, subscriptionEligible, emergencyEligible, null);
  }

  private static SeedSpec spec(
      String slug,
      String name,
      String description,
      boolean diyEligible,
      boolean subscriptionEligible,
      boolean emergencyEligible,
      List<Map.Entry<String, String>> subServices) {
    return new SeedSpec(slug, name, description, diyEligible, subscriptionEligible, emergencyEligible, subServices);
  }

  /** Ported from api/service-catalog.js SNOW_REMOVAL_SUB_SERVICES */
  private static List<Map.Entry<String, String>> snowRemovalSubServices() {
    return List.of(
        entry("residential_snow_removal", "Residential snow removal"),
        entry("driveway_snow_removal", "Driveway snow removal"),
        entry("sidewalk_walkway_clearing", "Sidewalk / walkway clearing"),
        entry("snow_shoveling", "Snow shoveling"),
        entry("snow_plowing", "Snow plowing"),
        entry("deicing_salting", "De-icing / salting"),
        entry("ice_management", "Ice management"),
        entry("commercial_snow_removal", "Commercial snow removal"));
  }

  /** Ported from api/service-catalog.js LANDSCAPING_SUB_SERVICES */
  private static List<Map.Entry<String, String>> landscapingSubServices() {
    return List.of(
        entry("lawn_mowing", "Lawn mowing"),
        entry("lawn_maintenance", "Lawn maintenance"),
        entry("yard_cleanup", "Yard cleanup"),
        entry("leaf_removal", "Leaf removal"),
        entry("hedge_bush_trimming", "Hedge / bush trimming"),
        entry("mulching", "Mulching"),
        entry("garden_maintenance", "Garden maintenance"),
        entry("seasonal_cleanup", "Seasonal cleanup"),
        entry("lawn_edging", "Lawn edging"),
        entry("general_landscaping", "General landscaping"),
        entry("landscape_maintenance", "Small landscape maintenance"));
  }

  /** Ported from api/service-catalog.js CLEANING_SUB_SERVICES */
  private static List<Map.Entry<String, String>> cleaningSubServices() {
    return List.of(
        entry("general_home_cleaning", "General home cleaning"),
        entry("deep_cleaning", "Deep cleaning"),
        entry("move_in_cleaning", "Move-in cleaning"),
        entry("move_out_cleaning", "Move-out cleaning"),
        entry("kitchen_cleaning", "Kitchen cleaning"),
        entry("bathroom_cleaning", "Bathroom cleaning"),
        entry("apartment_cleaning", "Apartment cleaning"),
        entry("post_renovation_cleanup", "Post-renovation cleanup"),
        entry("recurring_cleaning", "Recurring cleaning"),
        entry("one_time_cleaning", "One-time cleaning"));
  }

  private static Map.Entry<String, String> entry(String id, String label) {
    return Map.entry(id, label);
  }

  private static String truncate(String value, int max) {
    if (value == null) {
      return null;
    }
    return value.length() <= max ? value : value.substring(0, max);
  }

  private static String blankToNull(String value, int max) {
    if (!StringUtils.hasText(value)) {
      return null;
    }
    return truncate(value.trim(), max);
  }

  private record SeedSpec(
      String slug,
      String name,
      String description,
      boolean diyEligible,
      boolean subscriptionEligible,
      boolean emergencyEligible,
      List<Map.Entry<String, String>> subServices) {}
}
