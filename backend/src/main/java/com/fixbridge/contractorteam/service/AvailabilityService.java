package com.fixbridge.contractorteam.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fixbridge.contractorteam.entity.ContractorAvailabilityEntity;
import com.fixbridge.contractorteam.entity.ContractorEmployeeEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.contractorteam.repository.ContractorAvailabilityRepository;
import com.fixbridge.contractorteam.repository.ContractorEmployeeRepository;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class AvailabilityService {

  private static final Map<String, Object> DEFAULT_WORKING_DAYS = defaultWorkingDays();
  private static final Set<String> ACTIVE_CONTRACTOR_STATUSES =
      Set.of("scheduled", "contractor_en_route", "work_started", "approved");
  private static final Set<String> ACTIVE_EMPLOYEE_STATUSES =
      Set.of("scheduled", "contractor_en_route", "work_started");

  private final ContractorAvailabilityRepository availabilityRepository;
  private final ContractorEmployeeRepository employeeRepository;
  private final ManagedJobRepository managedJobRepository;
  private final ObjectMapper objectMapper;

  public AvailabilityService(
      ContractorAvailabilityRepository availabilityRepository,
      ContractorEmployeeRepository employeeRepository,
      ManagedJobRepository managedJobRepository,
      ObjectMapper objectMapper) {
    this.availabilityRepository = availabilityRepository;
    this.employeeRepository = employeeRepository;
    this.managedJobRepository = managedJobRepository;
    this.objectMapper = objectMapper;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> getContractorAvailability(Long contractorUserId) {
    ContractorAvailabilityEntity row =
        availabilityRepository.findById(contractorUserId).orElse(null);
    Map<String, Object> availability = new LinkedHashMap<>();
    availability.put("contractorUserId", contractorUserId);
    availability.put("timezone", row != null && row.getTimezone() != null ? row.getTimezone() : "America/New_York");
    availability.put("workingDays", row != null ? parseWorkingDays(row.getWorkingDays()) : DEFAULT_WORKING_DAYS);
    availability.put("sameDayAvailable", row != null && Boolean.TRUE.equals(row.getSameDayAvailable()));
    availability.put("emergencyAvailable", row != null && Boolean.TRUE.equals(row.getEmergencyAvailable()));
    availability.put("maxJobsPerDay", row != null ? row.getMaxJobsPerDay() : null);
    availability.put(
        "temporaryUnavailable", row != null && Boolean.TRUE.equals(row.getTemporaryUnavailable()));
    return Map.of("ok", true, "availability", availability);
  }

  @Transactional
  public Map<String, Object> putContractorAvailability(Map<String, Object> body) {
    SecurityUtils.requireContractorRole();
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    Long uid = principal.getId();
    ContractorAvailabilityEntity row =
        availabilityRepository.findById(uid).orElseGet(ContractorAvailabilityEntity::new);
    row.setContractorUserId(uid);
    String tz = String.valueOf(body.getOrDefault("timezone", "America/New_York")).trim();
    row.setTimezone(tz.length() > 60 ? tz.substring(0, 60) : tz);
    Object workingDays = body.get("workingDays");
    try {
      row.setWorkingDays(
          objectMapper.writeValueAsString(workingDays != null ? workingDays : DEFAULT_WORKING_DAYS));
    } catch (Exception e) {
      row.setWorkingDays(writeDefaultWorkingDays());
    }
    row.setSameDayAvailable(Boolean.TRUE.equals(body.get("sameDayAvailable")));
    row.setEmergencyAvailable(Boolean.TRUE.equals(body.get("emergencyAvailable")));
    row.setMaxJobsPerDay(
        body.get("maxJobsPerDay") != null
            ? Integer.parseInt(String.valueOf(body.get("maxJobsPerDay")))
            : null);
    row.setTemporaryUnavailable(Boolean.TRUE.equals(body.get("temporaryUnavailable")));
    availabilityRepository.save(row);
    return Map.of("ok", true);
  }

  @Transactional(readOnly = true)
  public Map<String, Object> adminDispatchAvailability(Long contractorUserId, Long employeeId) {
    SecurityUtils.requireAdminRole();
    if (contractorUserId == null || contractorUserId <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "contractorUserId required.");
    }
    ContractorAvailabilityEntity row =
        availabilityRepository.findById(contractorUserId).orElse(null);
    long jobCount =
        managedJobRepository.countByAssignedContractorUserIdAndStatusIn(
            contractorUserId, ACTIVE_CONTRACTOR_STATUSES);
    Map<String, Object> contractor = formatSummary(row, (int) jobCount);

    Map<String, Object> employee = null;
    if (employeeId != null) {
      ContractorEmployeeEntity emp = employeeRepository.findById(employeeId).orElse(null);
      long eJobs =
          managedJobRepository.countByAssignedEmployeeIdAndStatusIn(
              employeeId, ACTIVE_EMPLOYEE_STATUSES);
      employee = new LinkedHashMap<>();
      employee.put("employeeId", employeeId);
      employee.put("name", emp != null ? emp.getFullName() : null);
      employee.putAll(formatSummary(row, (int) eJobs));
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("contractor", contractor);
    body.put("employee", employee);
    return body;
  }

  private Map<String, Object> formatSummary(ContractorAvailabilityEntity row, int assignedJobs) {
    Map<String, Object> out = new LinkedHashMap<>();
    if (row == null) {
      out.put("label", "No schedule set");
      out.put("availableToday", false);
      out.put("assignedJobs", assignedJobs);
      out.put("timezone", "America/New_York");
      return out;
    }
    Map<String, Object> days = parseWorkingDays(row.getWorkingDays());
    String todayKey = dayKey(LocalDate.now().getDayOfWeek());
    @SuppressWarnings("unchecked")
    Map<String, Object> todayCfg =
        days.get(todayKey) instanceof Map<?, ?> m
            ? (Map<String, Object>) m
            : Map.of("enabled", false);
    boolean enabled = Boolean.TRUE.equals(todayCfg.get("enabled"));
    boolean availableToday = enabled && !Boolean.TRUE.equals(row.getTemporaryUnavailable());
    String label = availableToday ? "Available today" : "Not available today";
    if (enabled && todayCfg.get("start") != null && todayCfg.get("end") != null) {
      label = "Available " + todayCfg.get("start") + "–" + todayCfg.get("end");
    }
    if (Boolean.TRUE.equals(row.getSameDayAvailable())) {
      label += " · same-day OK";
    }
    if (Boolean.TRUE.equals(row.getEmergencyAvailable())) {
      label += " · emergency";
    }
    out.put("label", label);
    out.put("availableToday", availableToday);
    out.put("assignedJobs", assignedJobs);
    out.put("timezone", row.getTimezone() != null ? row.getTimezone() : "America/New_York");
    return out;
  }

  private Map<String, Object> parseWorkingDays(String json) {
    if (!StringUtils.hasText(json)) {
      return DEFAULT_WORKING_DAYS;
    }
    try {
      return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
    } catch (Exception e) {
      return DEFAULT_WORKING_DAYS;
    }
  }

  private String writeDefaultWorkingDays() {
    try {
      return objectMapper.writeValueAsString(DEFAULT_WORKING_DAYS);
    } catch (Exception e) {
      return "{}";
    }
  }

  private static String dayKey(DayOfWeek day) {
    return switch (day) {
      case MONDAY -> "mon";
      case TUESDAY -> "tue";
      case WEDNESDAY -> "wed";
      case THURSDAY -> "thu";
      case FRIDAY -> "fri";
      case SATURDAY -> "sat";
      case SUNDAY -> "sun";
    };
  }

  private static Map<String, Object> defaultWorkingDays() {
    Map<String, Object> days = new LinkedHashMap<>();
    for (String d : List.of("mon", "tue", "wed", "thu", "fri")) {
      days.put(d, Map.of("enabled", true, "start", "08:00", "end", "17:00"));
    }
    days.put("sat", Map.of("enabled", false, "start", "09:00", "end", "13:00"));
    days.put("sun", Map.of("enabled", false, "start", "09:00", "end", "13:00"));
    return days;
  }
}
