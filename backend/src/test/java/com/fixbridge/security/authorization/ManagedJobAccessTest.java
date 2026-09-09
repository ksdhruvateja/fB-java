package com.fixbridge.security.authorization;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fixbridge.job.entity.ManagedJobEntity;
import java.util.List;
import org.junit.jupiter.api.Test;

import com.fixbridge.security.principal.UserPrincipal;
class ManagedJobAccessTest {

  @Test
  void homeownerOwnerCanReadAndMutate() {
    ManagedJobEntity job = new ManagedJobEntity();
    job.setHomeownerUserId(10L);
    UserPrincipal homeowner = new UserPrincipal(10L, "homeowner", "h@x.com", false, "complete");

    assertTrue(ManagedJobAccess.canReadManagedJob(job, homeowner, List.of()));
    assertTrue(ManagedJobAccess.canMutateManagedJob(job, homeowner, false));
  }

  @Test
  void otherHomeownerCannotAccess() {
    ManagedJobEntity job = new ManagedJobEntity();
    job.setHomeownerUserId(10L);
    UserPrincipal other = new UserPrincipal(11L, "homeowner", "o@x.com", false, "complete");

    assertFalse(ManagedJobAccess.canReadManagedJob(job, other, List.of()));
    assertFalse(ManagedJobAccess.canMutateManagedJob(job, other, false));
  }

  @Test
  void assignedContractorCanRead_mutateOnlyWhenAllowed() {
    ManagedJobEntity job = new ManagedJobEntity();
    job.setHomeownerUserId(10L);
    job.setAssignedContractorUserId(20L);
    UserPrincipal contractor = new UserPrincipal(20L, "contractor", "c@x.com", false, "complete");

    assertTrue(ManagedJobAccess.canReadManagedJob(job, contractor, List.of()));
    assertFalse(ManagedJobAccess.canMutateManagedJob(job, contractor, false));
    assertTrue(ManagedJobAccess.canMutateManagedJob(job, contractor, true));
  }

  @Test
  void adminRoleBypassesOwnership() {
    ManagedJobEntity job = new ManagedJobEntity();
    job.setHomeownerUserId(10L);
    UserPrincipal admin = new UserPrincipal(1L, "admin", "a@x.com", true, "complete");

    assertTrue(ManagedJobAccess.canReadManagedJob(job, admin, List.of()));
    assertTrue(ManagedJobAccess.canMutateManagedJob(job, admin, false));
  }

  @Test
  void isAdminFlagWithoutAdminRoleDoesNotBypass() {
    ManagedJobEntity job = new ManagedJobEntity();
    job.setHomeownerUserId(10L);
    // Constructor forces isAdmin from role; simulate homeowner with isAdmin claim ignored.
    UserPrincipal homeowner = new UserPrincipal(99L, "homeowner", "h@x.com", true, "complete");

    assertFalse(ManagedJobAccess.canReadManagedJob(job, homeowner, List.of()));
  }

  @Test
  void invitedContractorCanRead_nonInvitedCannot() {
    ManagedJobEntity job = new ManagedJobEntity();
    job.setHomeownerUserId(10L);
    UserPrincipal invited = new UserPrincipal(30L, "contractor", "inv@x.com", false, "complete");
    UserPrincipal outsider = new UserPrincipal(31L, "contractor", "out@x.com", false, "complete");

    assertTrue(ManagedJobAccess.canReadManagedJob(job, invited, List.of(30L)));
    assertFalse(ManagedJobAccess.canReadManagedJob(job, invited, List.of()));
    assertFalse(ManagedJobAccess.canReadManagedJob(job, outsider, List.of(30L)));
    assertFalse(ManagedJobAccess.canMutateManagedJob(job, invited, true));
  }

  @Test
  void mfaPendingAdminStillHasAdminRoleButAccessHelpersTreatRoleOnly() {
    ManagedJobEntity job = new ManagedJobEntity();
    job.setHomeownerUserId(10L);
    UserPrincipal mfaAdmin = new UserPrincipal(1L, "admin", "a@x.com", true, "mfa_pending");

    assertTrue(ManagedJobAccess.isAdminRole(mfaAdmin));
    assertTrue(mfaAdmin.isMfaPending());
    assertTrue(ManagedJobAccess.canReadManagedJob(job, mfaAdmin, List.of()));
  }
}
