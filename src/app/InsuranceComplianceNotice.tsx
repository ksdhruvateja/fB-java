import { AlertCircle } from "lucide-react";
import InsuranceRequirementsLink from "./InsuranceRequirementsLink";
import { COI_CERTIFICATE_HOLDER, COI_LEGAL_NOTICE_ADDRESS } from "./contractorCompliance";
import { CONTRACTOR_INSURANCE_NOTICE } from "./insuranceRequirementsContent";

type Props = {
  compact?: boolean;
  showCertificateHolder?: boolean;
};

export default function InsuranceComplianceNotice({
  compact = false,
  showCertificateHolder = true,
}: Props) {
  return (
    <div className={`rounded-2xl border border-primary/20 bg-primary/5 space-y-3 ${compact ? "p-3.5" : "p-4 sm:p-5"}`}>
      <div>
        <p className={`font-bold text-foreground ${compact ? "text-sm" : "text-base"}`}>
          Insurance &amp; Compliance Requirements
        </p>
        <p className={`mt-1.5 text-muted-foreground leading-relaxed ${compact ? "text-xs" : "text-sm"}`}>
          Before receiving live FixBridge jobs, contractors must satisfy applicable licensing and insurance
          requirements. You may submit your application now and upload missing documents later.
        </p>
        <p className={`mt-2 text-muted-foreground leading-relaxed ${compact ? "text-xs" : "text-sm"}`}>
          <strong className="text-foreground">You will not be eligible for live job dispatch</strong> until all
          applicable required licenses, insurance policies, and endorsements have been reviewed and verified by
          FixBridge.
        </p>
      </div>

      <InsuranceRequirementsLink
        label={compact ? "View Requirements / Sample COI" : "View FixBridge Insurance Requirements / Sample COI"}
        className={compact ? "w-full sm:w-auto" : ""}
      />

      <div className={`rounded-xl border border-border/60 bg-card/80 p-3 space-y-1 ${compact ? "text-[11px]" : "text-xs"}`}>
        <p className="flex items-start gap-1.5 font-medium text-foreground">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
          Application vs. live dispatch
        </p>
        <p className="text-muted-foreground pl-5">
          You can submit your application without every document. Any missing or unverified required document will
          prevent live job dispatch until FixBridge verifies your compliance.
        </p>
      </div>

      <div className={`rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 ${compact ? "text-[11px]" : "text-xs"} text-amber-950 dark:text-amber-100`}>
        <p className="font-semibold">Insurance agent instruction</p>
        <p className="mt-1">{CONTRACTOR_INSURANCE_NOTICE}</p>
      </div>

      {showCertificateHolder ? (
        <div className={`space-y-1 ${compact ? "text-[11px]" : "text-xs"}`}>
          <p className="font-semibold text-primary">Certificate Holder / Additional Insured</p>
          <p>{COI_CERTIFICATE_HOLDER}</p>
          <p className="pt-1 font-semibold text-primary">Temporary COI / legal notice address</p>
          <p>{COI_LEGAL_NOTICE_ADDRESS}</p>
        </div>
      ) : null}
    </div>
  );
}
