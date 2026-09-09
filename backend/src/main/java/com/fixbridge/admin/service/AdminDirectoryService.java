package com.fixbridge.admin.service;

import com.fixbridge.auth.dto.response.UserDto;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.auth.mapper.UserMapper;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.authorization.RbacPermissions;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class AdminDirectoryService {

  private final UserRepository userRepository;
  private final ManagedJobRepository managedJobRepository;
  private final UserMapper userMapper;
  private final AuditService auditService;

  public AdminDirectoryService(
      UserRepository userRepository,
      ManagedJobRepository managedJobRepository,
      UserMapper userMapper,
      AuditService auditService) {
    this.userRepository = userRepository;
    this.managedJobRepository = managedJobRepository;
    this.userMapper = userMapper;
    this.auditService = auditService;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> listUsers(String role, String q) {
    SecurityUtils.requireAdminRole();
    String roleFilter = StringUtils.hasText(role) ? role.trim().toLowerCase(Locale.ROOT) : null;
    String query = StringUtils.hasText(q) ? clampQ(q) : null;
    List<UserEntity> rows;
    if (roleFilter == null && (query == null || query.length() < 2)) {
      rows = userRepository.findAllByOrderByCreatedAtDesc();
      if (rows.size() > 500) {
        rows = rows.subList(0, 500);
      }
    } else {
      rows = userRepository.searchUsers(roleFilter, query == null ? "" : query);
      if (rows.size() > 500) {
        rows = rows.subList(0, 500);
      }
    }
    List<UserDto> users = rows.stream().map(userMapper::toDto).collect(Collectors.toList());
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("users", users);
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> getUser(Long id) {
    SecurityUtils.requireAdminRole();
    UserEntity user =
        userRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found."));
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("user", userMapper.toDto(user));
    return body;
  }

  @Transactional
  public Map<String, Object> blockUser(Long id, Map<String, Object> body) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    SecurityUtils.requireAdminRole();
    requireAdminWrite(principal);
    UserEntity user =
        userRepository
            .findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found."));
    boolean blocked =
        body != null
            && (Boolean.TRUE.equals(body.get("blocked"))
                || "true".equalsIgnoreCase(String.valueOf(body.get("blocked"))));
    user.setBlocked(blocked);
    userRepository.save(user);
    auditService.write(
        principal.getId(),
        blocked ? "user_block" : "user_unblock",
        "user",
        id,
        Map.of("blocked", blocked, "role", user.getRole()));
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("ok", true);
    response.put("user", userMapper.toDto(user));
    return response;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> search(String q) {
    SecurityUtils.requireAdminRole();
    String query = clampQ(q);
    Map<String, Object> results = new LinkedHashMap<>();
    if (query.length() < 2) {
      results.put("jobs", List.of());
      results.put("homeowners", List.of());
      results.put("contractors", List.of());
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("ok", true);
      body.put("query", query);
      body.put("results", results);
      return body;
    }

    String like = query.replace("%", "").replace("_", "");
    List<Map<String, Object>> jobs = new ArrayList<>();
    for (ManagedJobEntity j : managedJobRepository.searchAdmin(like)) {
      if (jobs.size() >= 8) {
        break;
      }
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("id", j.getId());
      item.put(
          "label",
          StringUtils.hasText(j.getBookingId()) ? j.getBookingId() : ("Job #" + j.getId()));
      item.put(
          "subtitle",
          (j.getTitle() != null ? j.getTitle() : j.getCategory())
              + (j.getStatus() != null ? " · " + j.getStatus() : ""));
      item.put("status", j.getStatus());
      item.put("href", Map.of("tab", "jobs", "jobId", j.getId()));
      jobs.add(item);
    }

    List<Map<String, Object>> homeowners = new ArrayList<>();
    List<Map<String, Object>> contractors = new ArrayList<>();
    for (UserEntity u : userRepository.searchUsers(null, like)) {
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("id", u.getId());
      item.put("label", u.getName());
      item.put("subtitle", u.getEmail());
      item.put("status", u.isBlocked() ? "blocked" : "active");
      if ("homeowner".equals(u.getRole()) && homeowners.size() < 8) {
        item.put("href", Map.of("tab", "homeowners", "userId", u.getId()));
        homeowners.add(item);
      } else if ("contractor".equals(u.getRole()) && contractors.size() < 8) {
        item.put("href", Map.of("tab", "contractors", "userId", u.getId()));
        contractors.add(item);
      }
    }

    results.put("jobs", jobs);
    results.put("homeowners", homeowners);
    results.put("contractors", contractors);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("query", query);
    body.put("results", results);
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> listStaff() {
    SecurityUtils.requireAdminRole();
    requirePermission(SecurityUtils.requirePrincipal(), "staff.view");
    List<UserDto> staff =
        userRepository.findStaffAdmins().stream().map(userMapper::toDto).collect(Collectors.toList());
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("staff", staff);
    body.put("presets", RbacPermissions.VALID_ROLE_PRESETS);
    return body;
  }

  @Transactional
  public Map<String, Object> setStaffAccess(Map<String, Object> body) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    SecurityUtils.requireAdminRole();
    requirePermission(principal, "staff.edit");
    if (body == null || body.get("userId") == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "userId is required.");
    }
    Long userId = Long.valueOf(String.valueOf(body.get("userId")));
    if (userId.equals(principal.getId())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot change your own staff access.");
    }
    UserEntity target =
        userRepository
            .findById(userId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found."));
    if (!"admin".equals(target.getRole())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Target user is not staff.");
    }

    UserEntity actor =
        userRepository
            .findById(principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "Admin required."));
    String actorPreset =
        RbacPermissions.resolveAdminPreset(
            actor.getRole(), actor.getAdminRolePreset(), actor.getAdminAccessLevel());

    String preset = null;
    if (body.get("rolePreset") != null) {
      preset = String.valueOf(body.get("rolePreset")).trim().toLowerCase(Locale.ROOT);
    } else if (body.get("accessLevel") != null) {
      preset = RbacPermissions.legacyAccessToPreset(String.valueOf(body.get("accessLevel")));
    }
    if (preset == null || !RbacPermissions.VALID_ROLE_PRESETS.contains(preset)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid role preset.");
    }
    if ("super_admin".equals(preset) && !"super_admin".equals(actorPreset)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Only super admins can assign super_admin.");
    }

    String previous =
        RbacPermissions.resolveAdminPreset(
            target.getRole(), target.getAdminRolePreset(), target.getAdminAccessLevel());
    if ("super_admin".equals(previous)
        && !"super_admin".equals(preset)
        && userRepository.countActiveByRoleAndPreset("admin", "super_admin")
            <= 1) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "Cannot demote the last super_admin.");
    }

    target.setAdminRolePreset(preset);
    target.setAdminAccessLevel(RbacPermissions.presetToAccessLevel(preset));
    userRepository.save(target);
    auditService.write(
        principal.getId(),
        "staff_access_update",
        "user",
        userId,
        Map.of("previous", previous, "preset", preset));

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("ok", true);
    response.put("user", userMapper.toDto(target));
    return response;
  }

  private void requireAdminWrite(UserPrincipal principal) {
    UserEntity admin =
        userRepository
            .findById(principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "Admin required."));
    String level =
        RbacPermissions.presetToAccessLevel(
            RbacPermissions.resolveAdminPreset(
                admin.getRole(), admin.getAdminRolePreset(), admin.getAdminAccessLevel()));
    if ("read".equals(level)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Read-only admin cannot modify users.");
    }
  }

  private void requirePermission(UserPrincipal principal, String permission) {
    UserEntity admin =
        userRepository
            .findById(principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "Admin required."));
    if (!RbacPermissions.userHasPermission(
        admin.getRole(), admin.getAdminRolePreset(), admin.getAdminAccessLevel(), permission)) {
      throw new ApiException(
          HttpStatus.FORBIDDEN, "Missing permission: " + permission, "FORBIDDEN_PERMISSION");
    }
  }

  private static String clampQ(String q) {
    if (q == null) {
      return "";
    }
    String t = q.trim();
    return t.length() > 120 ? t.substring(0, 120) : t;
  }
}
