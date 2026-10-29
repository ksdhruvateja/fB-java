import { ExternalLink, X } from "lucide-react";
import InsuranceRequirementsLink from "./InsuranceRequirementsLink";
import { COI_CERTIFICATE_HOLDER, COI_LEGAL_NOTICE_ADDRESS } from "./contractorCompliance";
import { CONTRACTOR_INSURANCE_NOTICE } from "./insuranceRequirementsContent";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function CoiRequirementsModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coi-requirements-title"
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="coi-requirements-title" className="text-lg font-bold">
              FixBridge Insurance Requirements
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Official contractor / insurance agent guide (PDF).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border p-1.5 hover:bg-muted/50"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm">
          <p className="text-muted-foreground">
            A Certificate of Insurance (COI) is evidence of coverage only. Additional Insured, Primary &amp;
            Non-Contributory, and Waiver of Subrogation require separate endorsements — not just the COI.
          </p>

          <InsuranceRequirementsLink className="w-full" />

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2 text-xs">
            <p className="font-semibold text-primary">Certificate Holder / Additional Insured</p>
            <p>{COI_CERTIFICATE_HOLDER}</p>
            <p className="pt-2 font-semibold text-primary">Temporary COI / legal notice address</p>
            <p>{COI_LEGAL_NOTICE_ADDRESS}</p>
          </div>

          <p className="text-xs text-muted-foreground">{CONTRACTOR_INSURANCE_NOTICE}</p>

          <a
            href="/samples/coi-sample.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View sample marked-up COI (HTML)
          </a>
        </div>
      </div>
    </div>
  );
}
