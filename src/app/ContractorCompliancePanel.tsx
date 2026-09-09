import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Shield, Upload, XCircle } from "lucide-react";
import CoiRequirementsModal from "./CoiRequirementsModal";
import InsuranceComplianceNotice from "./InsuranceComplianceNotice";
import InsuranceRequirementsLink from "./InsuranceRequirementsLink";
import ManagedPricingGuidance from "./ManagedPricingGuidance";
import {
  CONTRACTOR_AGREEMENT_V4_LABEL,
  FIXBRIDGE_CONTRACTOR_AGREEMENT_V4_PDF_URL,
} from "./contractorApplication";
import {
  COI_CERTIFICATE_HOLDER,
  COI_LEGAL_NOTICE_ADDRESS,
  COMPLIANCE_DOCUMENT_SPECS,
  complianceStatusIcon,
  complianceStatusLabel,
  overallStatusLabel,
  overallStatusTone,
  fetchContractorComplianceSummary,
  acceptContractorAgreementV4,
  uploadComplianceDocument,
  type ComplianceDocType,
  type ComplianceDocument,
  type ComplianceSummary,
} from "./contractorCompliance";

function StatusBadge({ doc }: { doc: ComplianceDocument }) {
  const tone =
    doc.status === "VERIFIED"
      ? "text-emerald-700 bg-emerald-500/10"
      : doc.status === "UNDER_REVIEW" || doc.status === "UPLOADED"
        ? "text-amber-800 bg-amber-500/10"
        : doc.status === "NOT_APPLICABLE"
          ? "text-muted-foreground bg-muted/40"
          : "text-red-700 bg-red-500/10";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>
      {complianceStatusIcon(doc.status)} {complianceStatusLabel(doc.status)}
    </span>
  );
}

function DocRow({
  doc,
  busy,
  onUpload,
  onUploadLater,
}: {
  doc: ComplianceDocument;
  busy: boolean;
  onUpload: (type: ComplianceDocType, file: File, expirationDate?: string) => void;
  onUploadLater: (type: ComplianceDocType) => void;
}) {
  const [expiration, setExpiration] = useState(doc.expirationDate || "");
  if (doc.applicability === "NOT_APPLICABLE") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-sm">
        <span className="text-muted-foreground">{doc.label}</span>
        <StatusBadge doc={doc} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{doc.label}</p>
          {doc.fileName ? <p className="text-[11px] text-muted-foreground truncate max-w-xs">File: {doc.fileName}</p> : null}
          {doc.rejectionReason ? (
            <p className="mt-1 text-[11px] text-red-700">Rejected: {doc.rejectionReason}</p>
          ) : null}
        </div>
        <StatusBadge doc={doc} />
      </div>
      {doc.applicability === "REQUIRED" &&
      !["VERIFIED", "UNDER_REVIEW", "UPLOADED"].includes(doc.status) ? (
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted/50">
            <Upload className="h-3.5 w-3.5" />
            Upload now
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(doc.documentType, file, expiration || undefined);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => onUploadLater(doc.documentType)}
            className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
          >
            Upload later
          </button>
        </div>
      ) : null}
      {COMPLIANCE_DOCUMENT_SPECS.find((s) => s.type === doc.documentType)?.insurance ? (
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          Expiration date (if applicable)
          <input
            type="date"
            value={expiration}
            onChange={(e) => setExpiration(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          />
        </label>
      ) : null}
    </div>
  );
}

export default function ContractorCompliancePanel() {
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coiHelpOpen, setCoiHelpOpen] = useState(false);
  const [agreeV4, setAgreeV4] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await fetchContractorComplianceSummary();
    if (r.ok && r.summary) setSummary(r.summary);
    else setError(r.message || "Could not load compliance status.");
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleUpload(type: ComplianceDocType, file: File, expirationDate?: string) {
    if (file.size > 3_500_000) {
      setError("File must be under ~3.5 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const r = await uploadComplianceDocument(type, {
        fileName: file.name,
        fileData: String(reader.result),
        expirationDate: expirationDate || undefined,
      });
      setBusy(false);
      if (!r.ok) {
        setError(r.message || "Upload failed.");
        return;
      }
      if (r.summary) setSummary(r.summary);
    };
    reader.onerror = () => {
      setBusy(false);
      setError("Could not read file.");
    };
    reader.readAsDataURL(file);
  }

  async function handleUploadLater(type: ComplianceDocType) {
    setBusy(true);
    setError(null);
    const r = await uploadComplianceDocument(type, { uploadLater: true });
    setBusy(false);
    if (!r.ok) {
      setError(r.message || "Could not save preference.");
      return;
    }
    if (r.summary) setSummary(r.summary);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading compliance status…
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-700">
        {error || "Compliance data unavailable."}
      </div>
    );
  }

  const requiredDocs = summary.documents.filter((d) => d.applicability === "REQUIRED");
  const pendingCount = summary.missingRequirements.length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">Agreement</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{CONTRACTOR_AGREEMENT_V4_LABEL}</p>
            <p className="text-xs text-muted-foreground">
              {summary.agreement?.acceptedCurrent ? (
                <>
                  <span className="text-emerald-700 font-semibold">✓ Accepted</span>
                  {summary.agreement.acceptedAt
                    ? ` · Accepted ${new Date(summary.agreement.acceptedAt).toLocaleString()}`
                    : null}
                  {summary.agreement.acceptedVersion ? ` · v${summary.agreement.acceptedVersion}` : null}
                </>
              ) : (
                <span className="text-amber-800 font-semibold">Acceptance required (v4)</span>
              )}
            </p>
          </div>
          <a
            href={FIXBRIDGE_CONTRACTOR_AGREEMENT_V4_PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-primary hover:underline"
          >
            View
          </a>
        </div>

        {!summary.agreement?.acceptedCurrent ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer select-none text-xs">
              <input
                type="checkbox"
                checked={agreeV4}
                onChange={(e) => setAgreeV4(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary"
              />
              <span>
                I have reviewed and agree to the{" "}
                <a
                  href={FIXBRIDGE_CONTRACTOR_AGREEMENT_V4_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-medium hover:underline"
                >
                  {CONTRACTOR_AGREEMENT_V4_LABEL}
                </a>
                .
              </span>
            </label>
            <button
              type="button"
              disabled={!agreeV4 || busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const r = await acceptContractorAgreementV4();
                setBusy(false);
                if (!r.ok) {
                  setError(r.message || "Could not record agreement acceptance.");
                  return;
                }
                setAgreeV4(false);
                if (r.summary) setSummary(r.summary);
                else void refresh();
              }}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              Record agreement acceptance
            </button>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div className="rounded-xl border border-border/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Provider type</p>
            <p className="font-semibold">
              {summary.providerLevel === "level_2" ? "Level 2 — Managed Provider" : "Level 1 — Network Provider"}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Solo owner status</p>
            <p className="font-semibold capitalize">
              {(summary.soloOwner?.status || "not applicable").replace(/_/g, " ")}
            </p>
          </div>
        </div>

        {summary.soloOwner?.adminNotice ? (
          <p className="text-[11px] text-amber-900 dark:text-amber-100 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            {summary.soloOwner.adminNotice}
          </p>
        ) : null}
      </div>

      <InsuranceComplianceNotice />

      <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <p className="text-sm font-semibold">Insurance Requirements</p>
        <p className="text-xs text-muted-foreground">
          Review the FixBridge insurance requirements or send the guide to your insurance agent.
        </p>
        <InsuranceRequirementsLink label="View Insurance Requirements / Sample COI" />
        <p className="text-[11px] text-muted-foreground pt-1">
          COI uploads are reviewed separately from endorsements. Each document type must be verified on its own.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Shield className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Compliance status</p>
            <p className="text-lg font-semibold">
              {summary.verifiedCount} of {summary.requiredCount} required items verified
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              You may complete your application now, but you cannot receive live job dispatches until all required
              compliance documents are verified.
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 text-sm">
          <div className="rounded-xl border border-border/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Application</p>
            <p className="font-semibold">{summary.applicationStatus}</p>
          </div>
          <div className="rounded-xl border border-border/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Compliance</p>
            <p className="font-semibold">{summary.complianceStatus}</p>
          </div>
          <div
            className={`rounded-xl border px-3 py-2 ${
              summary.dispatchEligible
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-amber-500/40 bg-amber-500/5"
            }`}
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Live dispatch</p>
            <p className="font-semibold flex items-center gap-1.5">
              {summary.dispatchEligible ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> ELIGIBLE
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-amber-700" /> BLOCKED
                </>
              )}
            </p>
          </div>
        </div>

        {summary.overallComplianceStatus ? (
          <div className={`rounded-xl border px-3 py-2 text-sm ${overallStatusTone(summary.overallComplianceStatus)}`}>
            <p className="font-semibold">{overallStatusLabel(summary.overallComplianceStatus)}</p>
            {summary.level1 && summary.level2 ? (
              <p className="mt-1 text-xs opacity-90">
                Level 1: {summary.level1Eligible ? "eligible" : "blocked"} · Level 2:{" "}
                {summary.level2Eligible ? "eligible" : "blocked / review required"}
              </p>
            ) : null}
          </div>
        ) : null}

        {!summary.dispatchEligible && pendingCount > 0 ? (
          <div className="rounded-xl border border-amber-300/50 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-100">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              {pendingCount} required compliance item{pendingCount === 1 ? "" : "s"} still missing or awaiting verification.
            </p>
          </div>
        ) : null}
      </div>

      <ManagedPricingGuidance compact />

      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm space-y-2">
        <p className="font-semibold text-primary">Certificate Holder / Additional Insured legal name</p>
        <p>{COI_CERTIFICATE_HOLDER}</p>
        <p className="pt-2 font-semibold text-primary">Temporary COI / legal notice address</p>
        <p>{COI_LEGAL_NOTICE_ADDRESS}</p>
        <InsuranceRequirementsLink
          label="View FixBridge Insurance Requirements / Sample COI"
          className="mt-2"
        />
      </div>

      <CoiRequirementsModal open={coiHelpOpen} onClose={() => setCoiHelpOpen(false)} />

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="space-y-2">
        <p className="text-sm font-semibold">Required documents</p>
        {requiredDocs.map((doc) => (
          <DocRow key={doc.documentType} doc={doc} busy={busy} onUpload={handleUpload} onUploadLater={handleUploadLater} />
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-muted-foreground">Other documents</p>
        {summary.documents
          .filter((d) => d.applicability !== "REQUIRED")
          .map((doc) => (
            <DocRow key={doc.documentType} doc={doc} busy={busy} onUpload={handleUpload} onUploadLater={handleUploadLater} />
          ))}
      </div>
    </div>
  );
}
