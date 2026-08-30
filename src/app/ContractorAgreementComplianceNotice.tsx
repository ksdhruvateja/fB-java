import { FileText, Shield } from "lucide-react";
import InsuranceRequirementsLink from "./InsuranceRequirementsLink";
import {
  CONTRACTOR_AGREEMENT_V4_LABEL,
  FIXBRIDGE_CONTRACTOR_AGREEMENT_V4_PDF_URL,
} from "./contractorApplication";
import { LEGAL_ROUTES } from "./legalDocuments";

type Props = {
  compact?: boolean;
  agreeChecked?: boolean;
  onAgreeChange?: (checked: boolean) => void;
  showCheckbox?: boolean;
};

export default function ContractorAgreementComplianceNotice({
  compact = false,
  agreeChecked = false,
  onAgreeChange,
  showCheckbox = false,
}: Props) {
  return (
    <div
      className={`rounded-2xl border border-primary/25 bg-primary/5 space-y-3 ${
        compact ? "p-3.5" : "p-4 sm:p-5"
      }`}
    >
      <div className="flex items-start gap-2">
        <Shield className={`shrink-0 text-primary ${compact ? "h-4 w-4 mt-0.5" : "h-5 w-5"}`} />
        <div>
          <p className={`font-bold text-foreground ${compact ? "text-sm" : "text-base"}`}>
            Contractor Agreement &amp; Compliance
          </p>
          <p className={`mt-1.5 text-muted-foreground leading-relaxed ${compact ? "text-xs" : "text-sm"}`}>
            Before receiving FixBridge jobs, you must review and accept the current FixBridge Contractor
            Agreement.
          </p>
          <p className={`mt-2 text-muted-foreground leading-relaxed ${compact ? "text-xs" : "text-sm"}`}>
            You may submit your contractor application even if some insurance or licensing documents are not yet
            available. However, you cannot receive live job dispatches until all applicable licensing, insurance,
            Workers&apos; Compensation, and endorsement requirements are verified.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={FIXBRIDGE_CONTRACTOR_AGREEMENT_V4_PDF_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 font-semibold text-primary hover:bg-muted/50 ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          View {CONTRACTOR_AGREEMENT_V4_LABEL}
        </a>
        <a
          href={LEGAL_ROUTES.CONTRACTOR_AGREEMENT}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 font-semibold text-muted-foreground hover:bg-muted/40 ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          Web version
        </a>
        <InsuranceRequirementsLink
          label="View Insurance Requirements / Sample COI"
          className={compact ? "text-xs" : "text-sm"}
        />
      </div>

      {showCheckbox ? (
        <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-xl border border-border bg-card/80 p-3">
          <input
            type="checkbox"
            checked={agreeChecked}
            onChange={(e) => onAgreeChange?.(e.target.checked)}
            required
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-xs text-foreground leading-relaxed">
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
      ) : null}
    </div>
  );
}
