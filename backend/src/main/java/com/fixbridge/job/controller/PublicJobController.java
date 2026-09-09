package com.fixbridge.job.controller;

import com.fixbridge.job.dto.request.PublicJobRequest;
import com.fixbridge.job.service.ManagedJobService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public")
public class PublicJobController {

  private final ManagedJobService managedJobService;

  public PublicJobController(ManagedJobService managedJobService) {
    this.managedJobService = managedJobService;
  }

  @PostMapping("/jobs")
  public Map<String, Object> createPublicJob(@RequestBody PublicJobRequest request) {
    return managedJobService.createPublicJob(request);
  }
}
