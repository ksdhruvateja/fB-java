package com.fixbridge.diy.controller;

import com.fixbridge.diy.service.DiyProjectService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/diy/projects")
public class DiyProjectController {

  private final DiyProjectService diyProjectService;

  public DiyProjectController(DiyProjectService diyProjectService) {
    this.diyProjectService = diyProjectService;
  }

  @PostMapping
  public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body) {
    return diyProjectService.create(body);
  }

  @GetMapping
  public Map<String, Object> list() {
    return diyProjectService.listMine();
  }

  @PutMapping("/{id}/steps")
  public Map<String, Object> updateSteps(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return diyProjectService.updateSteps(id, body);
  }
}
