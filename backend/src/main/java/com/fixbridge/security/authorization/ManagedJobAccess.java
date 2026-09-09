package com.fixbridge.security.authorization;

import com.fixbridge.job.entity.ManagedJobEntity;
import java.util.Collection;
import java.util.Collections;

import com.fixbridge.security.principal.UserPrincipal;
/**
 * Port of api/auth-helpers.js managed-job access checks.
 * Admin access requires role == "admin", never is_admin alone.
 */
public final class ManagedJobAccess {

  private ManagedJobAccess() {}

  public static boolean isAdminRole(UserPrincipal authUser) {
    return authUser != null && "admin".equals(authUser.getRole());
  }

  public static boolean isHomeownerOwner(UserPrincipal authUser, Long homeownerUserId) {
    return authUser != null
        && "homeowner".equals(authUser.getRole())
        && authUser.getId() != null
        && authUser.getId().equals(homeownerUserId);
  }

  public static boolean isAssignedContractor(UserPrincipal authUser, Long contractorUserId) {
    return authUser != null
        && "contractor".equals(authUser.getRole())
        && authUser.getId() != null
        && contractorUserId != null
        && authUser.getId().equals(contractorUserId);
  }

  public static boolean canReadManagedJob(
      ManagedJobEntity job, UserPrincipal authUser, Collection<Long> invitedContractorIds) {
    if (job == null || authUser == null) {
      return false;
    }
    Collection<Long> invited =
        invitedContractorIds != null ? invitedContractorIds : Collections.emptyList();
    if (isAdminRole(authUser)) {
      return true;
    }
    if (isHomeownerOwner(authUser, job.getHomeownerUserId())) {
      return true;
    }
    if (isAssignedContractor(authUser, job.getAssignedContractorUserId())) {
      return true;
    }
    return "contractor".equals(authUser.getRole())
        && authUser.getId() != null
        && invited.stream().anyMatch(id -> authUser.getId().equals(id));
  }

  public static boolean canMutateManagedJob(
      ManagedJobEntity job, UserPrincipal authUser, boolean contractorMayMutate) {
    if (job == null || authUser == null) {
      return false;
    }
    if (isAdminRole(authUser)) {
      return true;
    }
    if (isHomeownerOwner(authUser, job.getHomeownerUserId())) {
      return true;
    }
    return contractorMayMutate
        && isAssignedContractor(authUser, job.getAssignedContractorUserId());
  }
}
