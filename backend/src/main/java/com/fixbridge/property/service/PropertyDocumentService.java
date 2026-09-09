package com.fixbridge.property.service;

import com.fixbridge.property.entity.PropertyDocumentEntity;
import com.fixbridge.property.entity.PropertyEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.property.repository.PropertyDocumentRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class PropertyDocumentService {

  private static final Set<String> CATEGORIES =
      Set.of(
          "appliance",
          "hvac",
          "plumbing",
          "electrical",
          "roof",
          "warranty",
          "inspection",
          "insurance",
          "receipt",
          "manual",
          "other");

  private static final int MAX_DATA_URL_CHARS = 3 * 1024 * 1024;
  private static final int MAX_DOCS_PER_PROPERTY = 100;

  private final PropertyDocumentRepository documentRepository;
  private final PropertyService propertyService;

  public PropertyDocumentService(
      PropertyDocumentRepository documentRepository, PropertyService propertyService) {
    this.documentRepository = documentRepository;
    this.propertyService = propertyService;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> list(Long propertyId) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    PropertyEntity property = propertyService.loadOwnedOrAdmin(propertyId, principal);
    Long ownerId = property.getOwnerUserId();
    // Non-admins may only list their own docs; admins list by property owner scope.
    if (!SecurityUtils.isAdminRole(principal) && !ownerId.equals(principal.getId())) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Property not found.");
    }
    Long docOwner = SecurityUtils.isAdminRole(principal) ? ownerId : principal.getId();
    List<Map<String, Object>> docs =
        documentRepository
            .findByPropertyIdAndOwnerUserIdOrderByCreatedAtDesc(propertyId, docOwner)
            .stream()
            .map(d -> toDto(d, false))
            .collect(Collectors.toList());
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("documents", docs);
    return body;
  }

  @Transactional
  public Map<String, Object> upload(Long propertyId, Map<String, Object> body) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    PropertyEntity property = propertyService.loadOwnedOrAdmin(propertyId, principal);
    if (!SecurityUtils.isAdminRole(principal) && !property.getOwnerUserId().equals(principal.getId())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }
    Long ownerId = property.getOwnerUserId();
    if (documentRepository.countByPropertyId(propertyId) >= MAX_DOCS_PER_PROPERTY) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Document limit reached for this property.");
    }
    if (body == null || body.get("dataUrl") == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "dataUrl is required.");
    }
    String dataUrl = String.valueOf(body.get("dataUrl"));
    if (!dataUrl.startsWith("data:")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "dataUrl must be a data URL.");
    }
    if (dataUrl.length() > MAX_DATA_URL_CHARS) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "File is too large (max ~3MB).");
    }
    String category =
        body.get("category") != null
            ? String.valueOf(body.get("category")).trim().toLowerCase(Locale.ROOT)
            : "other";
    if (!CATEGORIES.contains(category)) {
      category = "other";
    }
    String mime = detectMime(dataUrl, body.get("mimeType"));
    String fileName =
        sanitizeFileName(
            body.get("fileName") != null
                ? String.valueOf(body.get("fileName"))
                : (body.get("filename") != null ? String.valueOf(body.get("filename")) : "document"));

    PropertyDocumentEntity doc = new PropertyDocumentEntity();
    doc.setPropertyId(propertyId);
    doc.setOwnerUserId(ownerId);
    doc.setCategory(category);
    doc.setTitle(
        body.get("title") != null
            ? truncate(String.valueOf(body.get("title")), 255)
            : fileName);
    doc.setFileName(fileName);
    doc.setMimeType(mime);
    doc.setDataUrl(dataUrl);
    doc.setNotes(body.get("notes") != null ? truncate(String.valueOf(body.get("notes")), 2000) : null);
    doc.setSystemKey(
        body.get("systemKey") != null ? truncate(String.valueOf(body.get("systemKey")), 128) : null);
    doc = documentRepository.save(doc);

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("ok", true);
    response.put("document", toDto(doc, true));
    return response;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> get(Long propertyId, Long docId) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    PropertyEntity property = propertyService.loadOwnedOrAdmin(propertyId, principal);
    Long ownerScope =
        SecurityUtils.isAdminRole(principal) ? property.getOwnerUserId() : principal.getId();
    PropertyDocumentEntity doc =
        documentRepository
            .findByIdAndPropertyIdAndOwnerUserId(docId, propertyId, ownerScope)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Document not found."));
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("document", toDto(doc, true));
    return body;
  }

  @Transactional
  public Map<String, Object> delete(Long propertyId, Long docId) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    PropertyEntity property = propertyService.loadOwnedOrAdmin(propertyId, principal);
    Long ownerScope =
        SecurityUtils.isAdminRole(principal) ? property.getOwnerUserId() : principal.getId();
    if (!SecurityUtils.isAdminRole(principal) && !property.getOwnerUserId().equals(principal.getId())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }
    PropertyDocumentEntity doc =
        documentRepository
            .findByIdAndPropertyIdAndOwnerUserId(docId, propertyId, ownerScope)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Document not found."));
    documentRepository.delete(doc);
    return Map.of("ok", true);
  }

  private Map<String, Object> toDto(PropertyDocumentEntity d, boolean includeDataUrl) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", d.getId());
    m.put("propertyId", d.getPropertyId());
    m.put("category", d.getCategory());
    m.put("title", d.getTitle());
    m.put("fileName", d.getFileName());
    m.put("mimeType", d.getMimeType());
    m.put("hasFile", StringUtils.hasText(d.getDataUrl()));
    m.put("notes", d.getNotes());
    m.put("systemKey", d.getSystemKey());
    m.put("createdAt", d.getCreatedAt() != null ? d.getCreatedAt().toString() : null);
    if (includeDataUrl) {
      m.put("dataUrl", d.getDataUrl());
    }
    return m;
  }

  private static String detectMime(String dataUrl, Object override) {
    if (override != null && StringUtils.hasText(String.valueOf(override))) {
      return String.valueOf(override).trim();
    }
    int semi = dataUrl.indexOf(';');
    if (dataUrl.startsWith("data:") && semi > 5) {
      return dataUrl.substring(5, semi);
    }
    return "application/octet-stream";
  }

  private static String sanitizeFileName(String raw) {
    String name = raw == null ? "document" : raw.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
    if (name.isEmpty()) {
      name = "document";
    }
    return truncate(name, 200);
  }

  private static String truncate(String value, int max) {
    if (value == null) {
      return null;
    }
    String t = value.trim();
    return t.length() <= max ? t : t.substring(0, max);
  }
}
