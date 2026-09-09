package com.fixbridge.integration.geoapify;

import com.fixbridge.integration.geoapify.ServiceAreaService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ServiceAreaController {

  private final ServiceAreaService serviceAreaService;

  public ServiceAreaController(ServiceAreaService serviceAreaService) {
    this.serviceAreaService = serviceAreaService;
  }

  @GetMapping("/api/service-area/check")
  public Map<String, Object> check(@RequestParam(value = "zip", required = false) String zip) {
    return serviceAreaService.checkZip(zip);
  }

  @GetMapping("/api/public/service-area/check")
  public Map<String, Object> publicCheck(@RequestParam(value = "zip", required = false) String zip) {
    return serviceAreaService.checkZip(zip);
  }
}
