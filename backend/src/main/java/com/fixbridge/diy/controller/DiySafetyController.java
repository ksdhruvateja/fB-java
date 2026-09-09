package com.fixbridge.diy.controller;

import com.fixbridge.diy.service.DiySafetyService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/homeowner/diy-safety")
public class DiySafetyController {

  private final DiySafetyService diySafetyService;

  public DiySafetyController(DiySafetyService diySafetyService) {
    this.diySafetyService = diySafetyService;
  }

  @PostMapping("/start")
  public Map<String, Object> start(
      @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
    return diySafetyService.start(body, request);
  }

  @PostMapping("/feedback")
  public Map<String, Object> feedback(
      @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
    return diySafetyService.feedback(body, request);
  }

  @PostMapping("/stop")
  public Map<String, Object> stop(
      @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
    return diySafetyService.stop(body, request);
  }

  @PostMapping("/incident")
  public Map<String, Object> incident(
      @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
    return diySafetyService.incident(body, request);
  }
}
