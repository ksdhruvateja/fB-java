import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, History, Loader2, Shield, XCircle } from "lucide-react";
import InsuranceRequirementsLink from "./InsuranceRequirementsLink";
import { CONTRACTOR_AGREEMENT_V4_LABEL, FIXBRIDGE_CONTRACTOR_AGREEMENT_V4_PDF_URL } from "./contractorApplication";
import {
  complianceStatusIcon,
  complianceStatusLabel,
  fetchAdminComplianceDocumentFile,
  fetchAdminComplianceHistory,
  fetchAdminContractorAgreement,
  fetchAdminContractorCompliance,
  matrixStatusTone,
  overallStatusLabel,
  overallStatusTone,
  rejectAdminComplianceDocument,
  setAdminDocumentApplicability,
  verifyAdminComplianceDocument,
  type ComplianceApplicability,
  type ComplianceDocType,
  type ComplianceMatrixRow,
  type ComplianceSummary,
  type ComplianceTierEvaluation,
  type OverallComplianceStatus,
} from "./contractorCompliance";

function TierBadge({ tier }: { tier: ComplianceTierEvaluation }) {
  const Icon =
    tier.overallStatus === "GREEN" ? CheckCircle2 : tier.overallStatus === "YELLOW" ? AlertTriangle : XCircle;
  const iconClass =
    tier.overallStatus === "GREEN"
      ? "text-emerald-600"
      : tier.overallStatus === "YELLOW"
        ? "text-amber-600"
        : "text-red-600";

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${overallStatusTone(tier.overallStatus)}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">{tier.tierLabel}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
        <Icon className={`h-4 w-4 ${iconClass}`} />
        {overallStatusLabel(tier.overallStatus)}
      </p>
      <p className="mt-1 text-xs opacity-90">
        {tier.eligible ? "Eligible" : tier.label}
        {tier.blockingItems.length > 0 ? ` · Blocking: ${tier.blockingItems.join(", ")}` : ""}
        {tier.reviewItems.length > 0 ? ` · Review: ${tier.reviewItems.join(", ")}` : ""}
      </p>
    </div>
  );
}

function MatrixRowActions({
  contractorId,
  row,
  canVerify,
  busy,
  onChanged,
}: {
  contractorId: number;
  row: ComplianceMatrixRow;
  canVerify: boolean;
  busy: boolean;
  onChanged: () => void;
}) {
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [showVerify, setShowVerify] = useState(false);
  const [expirationDate, setExpirationDate] = useState(row.expirationDate || "");
  const [policyCarrier, setPolicyCarrier] = useState(row.policyCarrier || "");
  const [policyNumber, setPolicyNumber] = useState(row.policyNumber || "");

  async function viewFile() {
    const r = await fetchAdminComplianceDocumentFile(contractorId, row.documentType);
    if (r.ok && r.fileData) window.open(r.fileData, "_blank", "noopener,noreferrer");
  }

  async function loadHistory() {
    const r = await fetchAdminComplianceHistory(contractorId, row.documentType);
    if (r.ok) setHistory(r.history || []);
    setShowHistory((v) => !v);
  }

  const canVerifyDoc =
    canVerify && row.hasFile && row.matrixStatus !== "VERIFIED" && row.matrixStatus !== "NOT_APPLICABLE";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {row.hasFile ? (
        <button
          type="button"
          onClick={() => void viewFile()}
          className="rounded-lg border border-border px-2 py-1 text-xs font-semibold"
        >
          View
        </button>
      ) : null}
      {row.documentType === "AI_ONGOING_OPS" && row.hasFile ? (
        <button
          type="button"
          onClick={() => void viewFile()}
          className="rounded-lg border border-primary/30 px-2 py-1 text-xs font-semibold text-primary"
        >
          View Endorsement
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void loadHistory()}
        className="rounded-lg border border-border px-2 py-1 text-xs font-semibold"
      >
        <History className="inline h-3 w-3" />
      </button>
      {canVerifyDoc ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowVerify((v) => !v)}
          className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          Verify
        </button>
      ) : null}
      {canVerify && row.hasFile ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowReject((v) => !v)}
          className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700"
        >
          Reject
        </button>
      ) : null}
      {canVerify ? (
        <select
          className="rounded-lg border border-border px-2 py-1 text-xs"
          value={row.applicability}
          disabled={busy}
          onChange={async (e) => {
            await setAdminDocumentApplicability(
              contractorId,
              row.documentType,
              e.target.value as ComplianceApplicability
            );
            onChanged();
          }}
        >
          <option value="REQUIRED">Required</option>
          <option value="OPTIONAL">Optional</option>
          <option value="NOT_APPLICABLE">N/A</option>
        </select>
      ) : null}

      {showVerify ? (
        <div className="w-full basis-full space-y-2 border-t border-border pt-2 mt-1">
          {row.verifyNote ? <p className="text-[11px] text-amber-800">{row.verifyNote}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              className="rounded-lg border border-border px-2 py-1 text-xs"
              placeholder="Expiration"
            />
            <input
              value={policyCarrier}
              onChange={(e) => setPolicyCarrier(e.target.value)}
              className="rounded-lg border border-border px-2 py-1 text-xs"
              placeholder="Carrier"
            />
            <input
              value={policyNumber}
              onChange={(e) => setPolicyNumber(e.target.value)}
              className="rounded-lg border border-border px-2 py-1 text-xs"
              placeholder="Policy #"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              await verifyAdminComplianceDocument(contractorId, row.documentType, {
                expirationDate: expirationDate || undefined,
                policyCarrier: policyCarrier || undefined,
                policyNumber: policyNumber || undefined,
              });
              setShowVerify(false);
              onChanged();
            }}
            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            Confirm verification
          </button>
        </div>
      ) : null}

      {showReject ? (
        <div className="w-full basis-full space-y-2 border-t border-border pt-2 mt-1">
          <textarea
            rows={2}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Rejection reason (required)"
            className="w-full rounded-lg border border-border px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={busy || !rejectReason.trim()}
            onClick={async () => {
              await rejectAdminComplianceDocument(contractorId, row.documentType, rejectReason.trim());
              setRejectReason("");
              setShowReject(false);
              onChanged();
            }}
            className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            Submit rejection
          </button>
        </div>
      ) : null}

      {showHistory && history.length > 0 ? (
        <ul className="w-full basis-full space-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
          {history.map((h) => (
            <li key={String(h.id)}>
              v{String(h.version)} · {String(h.status)} ·{" "}
              {h.uploaded_at ? new Date(String(h.uploaded_at)).toLocaleString() : "—"}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ComplianceMatrixTable({
  contractorId,
  tier,
  canVerify,
  busy,
  onChanged,
}: {
  contractorId: number;
  tier: ComplianceTierEvaluation;
  canVerify: boolean;
  busy: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Requirement</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Dispatch rule</th>
            <th className="px-3 py-2 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tier.matrix.map((row) => (
            <tr key={row.key} className="border-b border-border/60 align-top">
              <td className="px-3 py-2.5">
                <p className="font-medium">{row.label}</p>
                {row.verifyNote ? (
                  <p className="mt-0.5 text-[11px] text-amber-800">{row.verifyNote}</p>
                ) : null}
              </td>
              <td className="px-3 py-2.5">
                <p className={`font-semibold ${matrixStatusTone(row.matrixStatus)}`}>
                  {complianceStatusIcon(row.matrixStatus)} {complianceStatusLabel(row.matrixStatus)}
                </p>
                {row.expirationDate ? (
                  <p className="text-[11px] text-muted-foreground">
                    Expires: {row.expirationDate}
                    {row.daysUntilExpiration != null && row.daysUntilExpiration >= 0
                      ? ` (${row.daysUntilExpiration}d)`
                      : ""}
                  </p>
                ) : null}
                {row.policyCarrier ? (
                  <p className="text-[11px] text-muted-foreground">Carrier: {row.policyCarrier}</p>
                ) : null}
                {row.verifiedAt ? (
                  <p className="text-[11px] text-emerald-700">
                    Verified {new Date(row.verifiedAt).toLocaleString()}
                    {row.verifiedBy ? ` · admin #${row.verifiedBy}` : ""}
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.dispatchRule}</td>
              <td className="px-3 py-2.5">
                <MatrixRowActions
                  contractorId={contractorId}
                  row={row}
                  canVerify={canVerify}
                  busy={busy}
                  onChanged={onChanged}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverallBadge({ status }: { status: OverallComplianceStatus }) {
  const Icon = status === "GREEN" ? CheckCircle2 : status === "YELLOW" ? AlertTriangle : XCircle;
  return (
    <div className={`rounded-xl border px-4 py-3 ${overallStatusTone(status)}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Overall compliance</p>
      <p className="mt-1 flex items-center gap-2 text-base font-bold">
        <Icon className="h-5 w-5" />
        {overallStatusLabel(status)}
      </p>
    </div>
  );
}

export default function AdminContractorCompliancePanel({
  contractorId,
  contractorName,
  canVerify,
}: {
  contractorId: number;
  contractorName?: string;
  canVerify: boolean;
}) {
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [agreementInfo, setAgreementInfo] = useState<Awaited<ReturnType<typeof fetchAdminContractorAgreement>> | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTier, setActiveTier] = useState<"level1" | "level2">("level1");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [complianceRes, agreementRes] = await Promise.all([
      fetchAdminContractorCompliance(contractorId),
      fetchAdminContractorAgreement(contractorId),
    ]);
    if (complianceRes.ok && complianceRes.summary) setSummary(complianceRes.summary);
    else setError(complianceRes.message || "Could not load compliance.");
    if (agreementRes.ok) setAgreementInfo(agreementRes);
    setLoading(false);
  }, [contractorId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading compliance matrix…
      </div>
    );
  }

  if (!summary) {
    return <p className="text-sm text-red-700">{error || "Compliance unavailable."}</p>;
  }

  const tierEval = activeTier === "level2" ? summary.level2 : summary.level1;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-bold">Legal / Compliance — Agreement</p>
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Current agreement</p>
            <p className="font-semibold">{CONTRACTOR_AGREEMENT_V4_LABEL}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Provider accepted</p>
            <p className="font-semibold">
              {agreementInfo?.agreement?.acceptedCurrent ? "YES" : agreementInfo?.agreement?.accepted ? "OUTDATED" : "NO"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Accepted version</p>
            <p className="font-semibold">
              {agreementInfo?.agreement?.acceptedVersion ? `v${agreementInfo.agreement.acceptedVersion}` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Acceptance timestamp</p>
            <p className="font-semibold">
              {agreementInfo?.agreement?.acceptedAt
                ? new Date(agreementInfo.agreement.acceptedAt).toLocaleString()
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Provider level</p>
            <p className="font-semibold">
              {agreementInfo?.providerLevel === "level_2" ? "Level 2" : "Level 1"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Managed addendum</p>
            <p className="font-semibold">
              {agreementInfo?.agreement?.managedAddendum?.accepted
                ? "Accepted"
                : agreementInfo?.providerLevel === "level_2"
                  ? "Missing"
                  : "Not required"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Solo owner acknowledgment</p>
            <p className="font-semibold capitalize">
              {(agreementInfo?.soloOwner?.status || "not applicable").replace(/_/g, " ")}
            </p>
          </div>
        </div>
        <a
          href={FIXBRIDGE_CONTRACTOR_AGREEMENT_V4_PDF_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-primary hover:underline"
        >
          View agreement package PDF
        </a>
        {agreementInfo?.agreement?.historical && agreementInfo.agreement.historical.length > 1 ? (
          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
            <p className="font-semibold text-foreground">Archived acceptances</p>
            {agreementInfo.agreement.historical.map((h) => (
              <p key={`${h.version}-${h.acceptedAt}`}>
                v{h.version} · {new Date(h.acceptedAt).toLocaleString()}
                {h.archived ? " (archived)" : ""}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm font-bold">FixBridge Insurance Standard</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Compare uploaded evidence against the official requirements guide.
          </p>
        </div>
        <InsuranceRequirementsLink label="View Insurance Requirements / Sample COI" />
      </div>

      <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-4">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          <Shield className="h-4 w-4 text-primary" />
          Compliance
          {contractorName ? (
            <span className="font-normal normal-case text-muted-foreground">· {contractorName}</span>
          ) : null}
        </p>

        <OverallBadge status={summary.overallComplianceStatus || "RED"} />

        <div className="grid gap-2 sm:grid-cols-2">
          <TierBadge tier={summary.level1} />
          <TierBadge tier={summary.level2} />
        </div>

        <div className="grid gap-2 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Application</p>
            <p className="font-semibold">{summary.applicationStatus}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Level 1 dispatch</p>
            <p className="font-semibold">{summary.level1Eligible ? "Allowed" : "Blocked"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Level 2 dispatch</p>
            <p className="font-semibold">{summary.level2Eligible ? "Allowed" : "Blocked / review"}</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground rounded-lg border border-border/60 bg-card px-3 py-2">
          <strong>FixBridge Additional Insured:</strong> verify the actual endorsement document — a generic COI upload
          does not prove FixBridge is named as Additional Insured.{" "}
          <strong>WC waiver does not replace Workers&apos; Compensation.</strong>
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setActiveTier("level1")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            activeTier === "level1" ? "bg-primary text-primary-foreground" : "border border-border"
          }`}
        >
          Level 1 matrix
        </button>
        <button
          type="button"
          onClick={() => setActiveTier("level2")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            activeTier === "level2" ? "bg-primary text-primary-foreground" : "border border-border"
          }`}
        >
          Level 2 matrix
        </button>
      </div>

      <ComplianceMatrixTable
        contractorId={contractorId}
        tier={tierEval}
        canVerify={canVerify}
        busy={busy}
        onChanged={() => {
          setBusy(true);
          void refresh().finally(() => setBusy(false));
        }}
      />

      <details className="rounded-xl border border-border bg-card p-3 text-sm">
        <summary className="cursor-pointer font-semibold">All document records ({summary.documents.length})</summary>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {summary.documents.map((doc) => (
            <li key={doc.documentType}>
              {doc.label}: {complianceStatusIcon(doc.status)} {complianceStatusLabel(doc.status)} ({doc.applicability})
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
