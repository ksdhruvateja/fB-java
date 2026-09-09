package com.fixbridge.security.authorization;

import com.fixbridge.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import com.fixbridge.security.principal.UserPrincipal;
public final class SecurityUtils {

  private SecurityUtils() {}

  public static UserPrincipal currentPrincipalOrNull() {
    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    if (auth == null || !auth.isAuthenticated()) {
      return null;
    }
    Object principal = auth.getPrincipal();
    if (principal instanceof UserPrincipal userPrincipal) {
      return userPrincipal;
    }
    return null;
  }

  public static UserPrincipal requirePrincipal() {
    UserPrincipal principal = currentPrincipalOrNull();
    if (principal == null) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Authentication required.");
    }
    return principal;
  }

  public static Long requireUserId() {
    return requirePrincipal().getId();
  }

  public static boolean isAdminRole(UserPrincipal principal) {
    return principal != null && "admin".equals(principal.getRole());
  }

  public static void requireAdminRole() {
    UserPrincipal principal = requirePrincipal();
    if (!isAdminRole(principal)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Admin access required. Use the staff admin login.");
    }
    requireAuthComplete(principal);
  }

  /** Reject MFA-pending tokens for privileged APIs. */
  public static void requireAuthComplete(UserPrincipal principal) {
    if (principal != null && principal.isMfaPending()) {
      throw new ApiException(
          HttpStatus.FORBIDDEN,
          "Multi-factor authentication required before accessing admin APIs.",
          "mfa_required");
    }
  }

  public static void requireContractorRole() {
    UserPrincipal principal = requirePrincipal();
    if (!"contractor".equals(principal.getRole())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Contractors only.");
    }
  }
}
