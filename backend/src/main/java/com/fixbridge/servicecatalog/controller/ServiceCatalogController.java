package com.fixbridge.servicecatalog.controller;

import com.fixbridge.servicecatalog.dto.ServiceOfferingDto;
import com.fixbridge.servicecatalog.dto.ServiceOfferingUpdateRequest;
import com.fixbridge.servicecatalog.service.ServiceCatalogService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ServiceCatalogController {

  private final ServiceCatalogService serviceCatalogService;

  public ServiceCatalogController(ServiceCatalogService serviceCatalogService) {
    this.serviceCatalogService = serviceCatalogService;
  }

  /** Public (or authenticated) homeowner-visible catalog. */
  @GetMapping("/api/home-services")
  public Map<String, Object> homeServices() {
    List<ServiceOfferingDto> offerings = serviceCatalogService.listPublicOfferings();
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("offerings", offerings);
    return body;
  }

  @GetMapping("/api/admin/services")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminList() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("offerings", serviceCatalogService.listAdminOfferings());
    return body;
  }

  @PutMapping("/api/admin/services/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminUpdate(
      @PathVariable String id, @RequestBody(required = false) ServiceOfferingUpdateRequest request) {
    ServiceOfferingDto updated = serviceCatalogService.update(id, request);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("offering", updated);
    return body;
  }
}
