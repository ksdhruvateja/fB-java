package com.fixbridge.dispatch.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fixbridge.job.dto.request.InvitationRespondRequest;
import com.fixbridge.job.entity.JobInvitationEntity;
import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.job.mapper.ManagedJobMapper;
import com.fixbridge.job.repository.JobInvitationRepository;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.security.principal.UserPrincipal;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

@ExtendWith(MockitoExtension.class)
class ContractorOpsServiceInvitationTest {

  @Mock
  private JobInvitationRepository jobInvitationRepository;
  @Mock
  private ManagedJobRepository managedJobRepository;
  @Mock
  private ManagedJobMapper managedJobMapper;

  private ContractorOpsService service;

  @BeforeEach
  void setUp() {
    service =
        new ContractorOpsService(jobInvitationRepository, managedJobRepository, managedJobMapper);
  }

  @AfterEach
  void tearDown() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void respond_rejectsInvitationOwnedByAnotherContractor() {
    setPrincipal(new UserPrincipal(20L, "contractor", "c@x.com", false, "complete"));
    when(jobInvitationRepository.findByIdAndContractorUserId(5L, 20L)).thenReturn(Optional.empty());

    InvitationRespondRequest req = new InvitationRespondRequest();
    req.setAction("accept");

    ApiException ex = assertThrows(ApiException.class, () -> service.respond(5L, req));
    assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
    assertEquals("Invitation not found.", ex.getMessage());
    verify(managedJobRepository, never()).save(any());
  }

  @Test
  void respond_acceptAssignsJobToContractor() {
    setPrincipal(new UserPrincipal(20L, "contractor", "c@x.com", false, "complete"));

    JobInvitationEntity inv = new JobInvitationEntity();
    inv.setId(5L);
    inv.setJobId(100L);
    inv.setContractorUserId(20L);
    inv.setStatus("invited");
    when(jobInvitationRepository.findByIdAndContractorUserId(5L, 20L)).thenReturn(Optional.of(inv));

    ManagedJobEntity job = new ManagedJobEntity();
    job.setId(100L);
    job.setStatus("contractor_invited");
    when(managedJobRepository.findById(100L)).thenReturn(Optional.of(job));
    when(jobInvitationRepository.save(any())).thenAnswer(a -> a.getArgument(0));
    when(managedJobRepository.save(any())).thenAnswer(a -> a.getArgument(0));

    InvitationRespondRequest req = new InvitationRespondRequest();
    req.setAction("accept");

    var body = service.respond(5L, req);
    assertEquals(true, body.get("ok"));
    assertEquals("accepted", body.get("status"));
    assertEquals(20L, job.getAssignedContractorUserId());
    assertEquals("awaiting_bid", job.getStatus());
  }

  @Test
  void respond_forbidsNonContractor() {
    setPrincipal(new UserPrincipal(10L, "homeowner", "h@x.com", false, "complete"));
    InvitationRespondRequest req = new InvitationRespondRequest();
    req.setAction("accept");
    ApiException ex = assertThrows(ApiException.class, () -> service.respond(1L, req));
    assertEquals(HttpStatus.FORBIDDEN, ex.getStatus());
  }

  private static void setPrincipal(UserPrincipal principal) {
    SecurityContextHolder.getContext()
        .setAuthentication(
            new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
  }
}
