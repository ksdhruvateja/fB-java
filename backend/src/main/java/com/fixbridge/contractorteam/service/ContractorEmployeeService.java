package com.fixbridge.contractorteam.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fixbridge.contractorteam.entity.ContractorEmployeeEntity;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.job.mapper.ManagedJobMapper;
import com.fixbridge.contractorteam.repository.ContractorEmployeeRepository;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class ContractorEmployeeService {

  private static final Set<String> ALLOWED_PHOTO_MIMES =
      Set.of("image/jpeg", "image/png", "image/webp", "image/gif");
  private static final int MAX_PHOTO_BYTES = 2 * 1024 * 1024;
  private static final Pattern DATA_URL =
      Pattern.compile("^data:([^;]+);base64,(.+)$", Pattern.CASE_INSENSITIVE);

  private final ContractorEmployeeRepository employeeRepository;
  private final ManagedJobRepository managedJobRepository;
  private final ManagedJobMapper managedJobMapper;
  private final ObjectMapper objectMapper;

  public ContractorEmployeeService(
      ContractorEmployeeRepository employeeRepository,
      ManagedJobRepository managedJobRepository,
      ManagedJobMapper managedJobMapper,
      ObjectMapper objectMapper) {
    this.employeeRepository = employeeRepository;
    this.managedJobRepository = managedJobRepository;
    this.managedJobMapper = managedJobMapper;
    this.objectMapper = objectMapper;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> listForContractor(Long contractorUserId) {
    List<Map<String, Object>> employees =
        employeeRepository.findByContractorUserIdOrderByActiveDescFullNameAsc(contractorUserId).stream()
            .map(e -> serialize(e, true))
            .toList();
    return Map.of("ok", true, "employees", employees);
  }

  @Transactional(readOnly = true)
  public Map<String, Object> getOne(Long id) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ContractorEmployeeEntity emp =
        employeeRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found."));
    boolean owner = emp.getContractorUserId().equals(principal.getId());
    boolean admin = "admin".equals(principal.getRole());
    if (!owner && !admin) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }
    return Map.of("ok", true, "employee", serialize(emp, owner || admin));
  }

  @Transactional
  public Map<String, Object> create(Map<String, Object> body) {
    SecurityUtils.requireContractorRole();
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    String fullName = str(body, "fullName", "name");
    if (!StringUtils.hasText(fullName)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Full name is required.");
    }
    PhotoCheck photo = validatePhoto(body.get("photoData"), body.get("photoMime"));
    if (!photo.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, photo.message);
    }
    ContractorEmployeeEntity emp = new ContractorEmployeeEntity();
    emp.setContractorUserId(principal.getId());
    emp.setFullName(fullName.trim());
    emp.setJobTitle(blankToNull(str(body, "jobTitle")));
    emp.setBio(blankToNull(str(body, "bio")));
    emp.setTrade(blankToNull(str(body, "trade")));
    emp.setYearsExperience(intOrNull(body.get("yearsExperience")));
    emp.setEmployeeRef(blankToNull(str(body, "employeeRef")));
    emp.setPhotoData(photo.photoData);
    emp.setPhotoMime(photo.photoMime);
    emp.setCustomerDescription(blankToNull(str(body, "customerDescription")));
    emp.setInternalNotes(blankToNull(str(body, "internalNotes")));
    emp.setPhones(writeJson(normalizeContacts(body.get("phones"), "phone")));
    emp.setEmails(writeJson(normalizeContacts(body.get("emails"), "email")));
    emp.setActive(body.get("active") == null || Boolean.TRUE.equals(body.get("active")));
    ContractorEmployeeEntity saved = employeeRepository.save(emp);
    return Map.of("ok", true, "employee", serialize(saved, true));
  }

  @Transactional
  public Map<String, Object> update(Long id, Map<String, Object> body) {
    SecurityUtils.requireContractorRole();
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ContractorEmployeeEntity emp =
        employeeRepository
            .findByIdAndContractorUserId(id, principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Employee not found."));
    if (body.containsKey("fullName") || body.containsKey("name")) {
      String fullName = str(body, "fullName", "name");
      if (StringUtils.hasText(fullName)) {
        emp.setFullName(fullName.trim());
      }
    }
    if (body.containsKey("jobTitle")) {
      emp.setJobTitle(blankToNull(str(body, "jobTitle")));
    }
    if (body.containsKey("bio")) {
      emp.setBio(blankToNull(str(body, "bio")));
    }
    if (body.containsKey("trade")) {
      emp.setTrade(blankToNull(str(body, "trade")));
    }
    if (body.containsKey("yearsExperience")) {
      emp.setYearsExperience(intOrNull(body.get("yearsExperience")));
    }
    if (body.containsKey("employeeRef")) {
      emp.setEmployeeRef(blankToNull(str(body, "employeeRef")));
    }
    if (body.containsKey("photoData")) {
      PhotoCheck photo = validatePhoto(body.get("photoData"), body.get("photoMime"));
      if (!photo.ok) {
        throw new ApiException(HttpStatus.BAD_REQUEST, photo.message);
      }
      emp.setPhotoData(photo.photoData);
      emp.setPhotoMime(photo.photoMime);
    }
    if (body.containsKey("customerDescription")) {
      emp.setCustomerDescription(blankToNull(str(body, "customerDescription")));
    }
    if (body.containsKey("internalNotes")) {
      emp.setInternalNotes(blankToNull(str(body, "internalNotes")));
    }
    if (body.containsKey("phones")) {
      emp.setPhones(writeJson(normalizeContacts(body.get("phones"), "phone")));
    }
    if (body.containsKey("emails")) {
      emp.setEmails(writeJson(normalizeContacts(body.get("emails"), "email")));
    }
    if (body.containsKey("active")) {
      emp.setActive(!Boolean.FALSE.equals(body.get("active")));
    }
    return Map.of("ok", true, "employee", serialize(employeeRepository.save(emp), true));
  }

  @Transactional
  public Map<String, Object> assignTechnician(Long jobId, Long employeeId) {
    SecurityUtils.requireContractorRole();
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job =
        managedJobRepository
            .findById(jobId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found."));
    if (!principal.getId().equals(job.getAssignedContractorUserId())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }
    if (employeeId == null || employeeId <= 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Select a technician.");
    }
    ContractorEmployeeEntity emp = assertAssignable(employeeId, principal.getId());
    job.setAssignedEmployeeId(emp.getId());
    ManagedJobEntity saved = managedJobRepository.save(job);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("job", managedJobMapper.toDto(saved, principal));
    return body;
  }

  public ContractorEmployeeEntity assertAssignable(Long employeeId, Long contractorUserId) {
    ContractorEmployeeEntity emp =
        employeeRepository
            .findByIdAndContractorUserId(employeeId, contractorUserId)
            .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Technician not found on your team."));
    if (!Boolean.TRUE.equals(emp.getActive())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Technician is inactive.");
    }
    return emp;
  }

  private Map<String, Object> serialize(ContractorEmployeeEntity row, boolean includeInternal) {
    List<Map<String, Object>> phones = readContacts(row.getPhones());
    List<Map<String, Object>> emails = readContacts(row.getEmails());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", row.getId());
    out.put("contractorUserId", row.getContractorUserId());
    out.put("fullName", row.getFullName());
    out.put("jobTitle", row.getJobTitle());
    out.put("bio", row.getBio());
    out.put("trade", row.getTrade());
    out.put("yearsExperience", row.getYearsExperience());
    out.put("customerDescription", row.getCustomerDescription());
    out.put("active", !Boolean.FALSE.equals(row.getActive()));
    out.put("phones", phones);
    out.put("emails", emails);
    out.put("hasPhoto", StringUtils.hasText(row.getPhotoData()));
    out.put(
        "photoUrl",
        StringUtils.hasText(row.getPhotoData())
            ? "/api/contractor/employees/" + row.getId() + "/photo"
            : null);
    out.put("createdAt", row.getCreatedAt());
    out.put("updatedAt", row.getUpdatedAt());
    if (includeInternal) {
      out.put("employeeRef", row.getEmployeeRef());
      out.put("internalNotes", row.getInternalNotes());
    }
    return out;
  }

  private PhotoCheck validatePhoto(Object photoDataObj, Object photoMimeObj) {
    if (photoDataObj == null || !StringUtils.hasText(String.valueOf(photoDataObj))) {
      return PhotoCheck.ok(null, null);
    }
    String mime = photoMimeObj == null ? "" : String.valueOf(photoMimeObj).trim().toLowerCase(Locale.ROOT);
    if (!ALLOWED_PHOTO_MIMES.contains(mime)) {
      return PhotoCheck.fail("Photo must be JPEG, PNG, WebP, or GIF.");
    }
    String data = String.valueOf(photoDataObj);
    Matcher m = DATA_URL.matcher(data);
    if (m.matches()) {
      data = m.group(2);
    }
    try {
      byte[] bytes = Base64.getDecoder().decode(data);
      if (bytes.length > MAX_PHOTO_BYTES) {
        return PhotoCheck.fail("Photo must be 2 MB or smaller.");
      }
    } catch (IllegalArgumentException e) {
      return PhotoCheck.fail("Invalid photo data.");
    }
    return PhotoCheck.ok(data, mime);
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> normalizeContacts(Object raw, String kind) {
    List<Map<String, Object>> out = new ArrayList<>();
    if (!(raw instanceof List<?> list)) {
      return out;
    }
    for (Object item : list) {
      if (!(item instanceof Map<?, ?> map)) {
        continue;
      }
      Object valueObj = map.get("value");
      if (valueObj == null) {
        valueObj = "email".equals(kind) ? map.get("email") : map.get("phone");
      }
      String value = valueObj == null ? "" : String.valueOf(valueObj).trim();
      if ("email".equals(kind)) {
        value = value.toLowerCase(Locale.ROOT);
        if (!value.contains("@")) {
          continue;
        }
      } else {
        String digits = value.replaceAll("\\D", "");
        if (digits.length() < 10) {
          continue;
        }
        value = digits.length() == 10 ? "+1" + digits : "+" + digits;
      }
      Map<String, Object> entry = new LinkedHashMap<>();
      entry.put("value", value);
      entry.put("label", blankToNull(map.get("label") == null ? "" : String.valueOf(map.get("label"))));
      entry.put(
          "customerVisible",
          map.get("customerVisible") == null && map.get("customer_visible") == null
              || Boolean.TRUE.equals(map.get("customerVisible"))
              || Boolean.TRUE.equals(map.get("customer_visible")));
      entry.put(
          "isPrimary",
          Boolean.TRUE.equals(map.get("isPrimary")) || Boolean.TRUE.equals(map.get("is_primary")));
      out.add(entry);
    }
    return out;
  }

  private List<Map<String, Object>> readContacts(String json) {
    try {
      return objectMapper.readValue(
          json == null ? "[]" : json, new TypeReference<List<Map<String, Object>>>() {});
    } catch (Exception e) {
      return List.of();
    }
  }

  private String writeJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception e) {
      return "[]";
    }
  }

  private static String str(Map<String, Object> body, String... keys) {
    if (body == null) {
      return "";
    }
    for (String key : keys) {
      Object v = body.get(key);
      if (v != null && StringUtils.hasText(String.valueOf(v))) {
        return String.valueOf(v).trim();
      }
    }
    return "";
  }

  private static String blankToNull(String value) {
    return StringUtils.hasText(value) ? value.trim() : null;
  }

  private static Integer intOrNull(Object value) {
    if (value == null) {
      return null;
    }
    try {
      return Integer.parseInt(String.valueOf(value));
    } catch (Exception e) {
      return null;
    }
  }

  private record PhotoCheck(boolean ok, String message, String photoData, String photoMime) {
    static PhotoCheck ok(String data, String mime) {
      return new PhotoCheck(true, null, data, mime);
    }

    static PhotoCheck fail(String message) {
      return new PhotoCheck(false, message, null, null);
    }
  }
}
