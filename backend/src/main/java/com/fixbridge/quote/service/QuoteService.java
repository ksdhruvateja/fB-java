package com.fixbridge.quote.service;

import com.fixbridge.job.entity.ManagedJobEntity;
import com.fixbridge.quote.entity.ProposalEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.quote.mapper.ProposalMapper;
import com.fixbridge.job.repository.ManagedJobRepository;
import com.fixbridge.quote.repository.ProposalRepository;
import com.fixbridge.security.authorization.ManagedJobAccess;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class QuoteService {

  private static final Set<String> INACTIVE =
      Set.of("superseded", "converted", "canceled", "cancelled", "declined", "expired");
  private static final Set<String> APPROVABLE = Set.of("sent", "viewed", "accepted", "approved");

  private final ManagedJobRepository managedJobRepository;
  private final ProposalRepository proposalRepository;
  private final ProposalMapper proposalMapper;

  public QuoteService(
      ManagedJobRepository managedJobRepository,
      ProposalRepository proposalRepository,
      ProposalMapper proposalMapper) {
    this.managedJobRepository = managedJobRepository;
    this.proposalRepository = proposalRepository;
    this.proposalMapper = proposalMapper;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> getProposal(Long jobId) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job = requireJob(jobId);
    assertReadAccess(job, principal);

    ProposalEntity proposal =
        proposalRepository.findFirstByJobIdOrderByCreatedAtDesc(jobId).orElse(null);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("proposal", proposal == null ? null : proposalMapper.toDto(proposal, principal));
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> getQuoteOptions(Long jobId) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job = requireJob(jobId);
    if (!(ManagedJobAccess.isAdminRole(principal)
        || ManagedJobAccess.isHomeownerOwner(principal, job.getHomeownerUserId()))) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }

    List<Map<String, Object>> options =
        proposalRepository.findQuoteOptions(jobId).stream()
            .map(p -> proposalMapper.toDto(p, principal))
            .toList();
    long labeled =
        options.stream()
            .filter(o -> o.get("quoteOptionLabel") != null || o.get("optionGroup") != null)
            .count();
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("options", options);
    body.put("hasAlternatives", labeled > 1);
    return body;
  }

  @Transactional
  public Map<String, Object> approveProposal(Long jobId, Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    ManagedJobEntity job = requireJob(jobId);
    if (!(ManagedJobAccess.isAdminRole(principal)
        || ManagedJobAccess.isHomeownerOwner(principal, job.getHomeownerUserId()))) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }

    Long proposalId = null;
    if (request != null && request.get("proposalId") != null) {
      try {
        proposalId = Long.valueOf(String.valueOf(request.get("proposalId")));
      } catch (NumberFormatException ignored) {
        proposalId = 0L;
      }
    }
    if (proposalId == null || proposalId <= 0) {
      proposalId = job.getActiveProposalId();
    }

    ProposalEntity prop = null;
    if (proposalId != null && proposalId > 0) {
      prop =
          proposalRepository
              .findById(proposalId)
              .filter(p -> jobId.equals(p.getJobId()))
              .orElse(null);
    }
    if (prop == null) {
      List<ProposalEntity> active = proposalRepository.findActiveForApproval(jobId);
      prop = active.isEmpty() ? null : active.get(0);
    }
    if (prop == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "No active quote available for approval.");
    }

    String propStatus = String.valueOf(prop.getStatus() == null ? "" : prop.getStatus()).toLowerCase(Locale.ROOT);
    if (INACTIVE.contains(propStatus)) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "superseded".equals(propStatus)
              ? "This quote has been superseded by a newer version. Please review the latest quote."
              : "This quote is no longer available for approval.",
          "quote_not_active");
    }
    if (!APPROVABLE.contains(propStatus)) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "This quote has not been sent for your review yet.",
          "quote_not_sent");
    }

    if (prop.getQuoteValidUntil() != null && prop.getQuoteValidUntil().isBefore(OffsetDateTime.now())) {
      prop.setStatus("expired");
      proposalRepository.save(prop);
      throw new ApiException(
          HttpStatus.CONFLICT,
          "This quote has expired. Contact FixBridge for an updated quote.",
          "quote_expired");
    }

    if (prop.getConvertedInvoiceId() != null) {
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("ok", true);
      body.put("alreadyAccepted", true);
      body.put("proposal", proposalMapper.toDto(prop, principal));
      body.put("invoice", null);
      return body;
    }

    prop.setStatus("accepted");
    prop.setApprovedAt(OffsetDateTime.now());
    if (prop.getLockedAt() == null) {
      prop.setLockedAt(OffsetDateTime.now());
    }
    prop.setOptionSelectionStatus("accepted");
    if (prop.getQuoteNumber() == null) {
      // assigned after first save when id known — ensureQuoteNumber after save
    }
    proposalRepository.save(prop);
    if (prop.getQuoteNumber() == null) {
      prop.setQuoteNumber("FBQ-" + String.format("%05d", prop.getId()));
      proposalRepository.save(prop);
    }

    if (prop.getOptionGroup() != null) {
      List<ProposalEntity> siblings =
          proposalRepository.findByJobIdAndOptionGroupAndIdNotAndStatusIn(
              jobId, prop.getOptionGroup(), prop.getId(), List.of("sent", "viewed"));
      for (ProposalEntity sibling : siblings) {
        sibling.setStatus("declined");
        sibling.setOptionSelectionStatus("not_selected");
        proposalRepository.save(sibling);
      }
    }

    job.setActiveProposalId(prop.getId());
    job.setStatus("approved");
    managedJobRepository.save(job);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("proposal", proposalMapper.toDto(prop, principal));
    body.put("invoice", null);
    body.put("alreadyAccepted", false);
    return body;
  }

  private ManagedJobEntity requireJob(Long jobId) {
    return managedJobRepository
        .findById(jobId)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found."));
  }

  private static void assertReadAccess(ManagedJobEntity job, UserPrincipal principal) {
    boolean allowed =
        ManagedJobAccess.isAdminRole(principal)
            || ManagedJobAccess.isHomeownerOwner(principal, job.getHomeownerUserId())
            || ManagedJobAccess.isAssignedContractor(principal, job.getAssignedContractorUserId());
    if (!allowed) {
      throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed.");
    }
  }
}
