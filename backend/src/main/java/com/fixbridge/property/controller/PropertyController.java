package com.fixbridge.property.controller;

import com.fixbridge.property.dto.request.PropertyCreateRequest;
import com.fixbridge.property.dto.response.PropertyDto;
import com.fixbridge.property.dto.request.PropertyUpdateRequest;
import com.fixbridge.property.service.PropertyDocumentService;
import com.fixbridge.property.service.PropertyService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/properties")
public class PropertyController {

  private final PropertyService propertyService;
  private final PropertyDocumentService propertyDocumentService;

  public PropertyController(
      PropertyService propertyService, PropertyDocumentService propertyDocumentService) {
    this.propertyService = propertyService;
    this.propertyDocumentService = propertyDocumentService;
  }

  @GetMapping
  public Map<String, Object> list() {
    List<PropertyDto> properties = propertyService.listMine();
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("properties", properties);
    return body;
  }

  @PostMapping
  public Map<String, Object> create(@RequestBody PropertyCreateRequest request) {
    PropertyDto property = propertyService.create(request);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("property", property);
    return body;
  }

  @GetMapping("/{id}")
  public Map<String, Object> get(@PathVariable Long id) {
    PropertyDto property = propertyService.getById(id);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("property", property);
    return body;
  }

  @PutMapping("/{id}")
  public Map<String, Object> update(@PathVariable Long id, @RequestBody PropertyUpdateRequest request) {
    PropertyDto property = propertyService.update(id, request);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("property", property);
    return body;
  }

  @GetMapping("/{id}/documents")
  public Map<String, Object> listDocuments(@PathVariable Long id) {
    return propertyDocumentService.list(id);
  }

  @PostMapping("/{id}/documents")
  public Map<String, Object> uploadDocument(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return propertyDocumentService.upload(id, body);
  }

  @GetMapping("/{id}/documents/{docId}")
  public Map<String, Object> getDocument(@PathVariable Long id, @PathVariable Long docId) {
    return propertyDocumentService.get(id, docId);
  }

  @DeleteMapping("/{id}/documents/{docId}")
  public Map<String, Object> deleteDocument(@PathVariable Long id, @PathVariable Long docId) {
    return propertyDocumentService.delete(id, docId);
  }
}
