package com.fixbridge.admin.controller;

import com.fixbridge.admin.service.PartnerService;
import com.fixbridge.admin.service.ReferralService;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ReferralPartnerController {

  private final ReferralService referralService;
  private final PartnerService partnerService;

  public ReferralPartnerController(ReferralService referralService, PartnerService partnerService) {
    this.referralService = referralService;
    this.partnerService = partnerService;
  }

  @GetMapping("/referrals/me")
  public Map<String, Object> referralsMe() {
    return referralService.me();
  }

  @PostMapping("/referrals/apply")
  public Map<String, Object> applyReferral(@RequestBody(required = false) Map<String, Object> body) {
    Map<String, Object> req = body != null ? body : Map.of();
    Object code = req.get("code") != null ? req.get("code") : req.get("referralCode");
    return referralService.applyCode(code != null ? String.valueOf(code) : null);
  }

  @GetMapping("/admin/referrals")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminReferrals(
      @RequestParam(required = false) String type, @RequestParam(required = false) String status) {
    return referralService.adminList(type, status);
  }

  @GetMapping("/partners/lookup")
  public Map<String, Object> partnerLookup(@RequestParam(required = false) String code) {
    return partnerService.lookup(code);
  }

  @PostMapping("/partner/login")
  public Map<String, Object> partnerLogin(@RequestBody(required = false) Map<String, Object> body) {
    Map<String, Object> req = body != null ? body : Map.of();
    return partnerService.login(
        req.get("email") != null ? String.valueOf(req.get("email")) : null,
        req.get("password") != null ? String.valueOf(req.get("password")) : "");
  }

  @GetMapping("/admin/partners")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> adminPartners() {
    return partnerService.adminList();
  }

  @PostMapping("/admin/partners")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> createPartner(@RequestBody(required = false) Map<String, Object> body) {
    return partnerService.adminCreate(body != null ? body : Map.of());
  }

  @PutMapping("/admin/partners/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> updatePartner(
      @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    return partnerService.adminUpdate(id, body != null ? body : Map.of());
  }

  @DeleteMapping("/admin/partners/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public Map<String, Object> deletePartner(@PathVariable Long id) {
    return partnerService.adminDelete(id);
  }
}
