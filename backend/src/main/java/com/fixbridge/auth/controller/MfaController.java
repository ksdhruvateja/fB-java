package com.fixbridge.auth.controller;

import com.fixbridge.auth.service.MfaService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth/mfa")
public class MfaController {

  private final MfaService mfaService;

  public MfaController(MfaService mfaService) {
    this.mfaService = mfaService;
  }

  @PostMapping("/start")
  public Map<String, Object> start(@RequestBody(required = false) Map<String, Object> body) {
    boolean force = body != null && Boolean.TRUE.equals(body.get("force"));
    return mfaService.start(force);
  }

  @PostMapping("/verify")
  public Map<String, Object> verify(@RequestBody(required = false) Map<String, Object> body) {
    String code = body == null || body.get("code") == null ? "" : String.valueOf(body.get("code"));
    return mfaService.verify(code);
  }
}
