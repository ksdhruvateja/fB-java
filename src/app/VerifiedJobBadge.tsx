import { BadgeCheck } from "lucide-react";

export function VerifiedFixBridgeJobBadge({ compact }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-emerald-500/10 font-semibold text-emerald-800 dark:text-emerald-300 ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      <BadgeCheck className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
      Verified FixBridge Job
    </span>
  );
}

export function ContractorTrustBadges({
  licenseVerified,
  insuranceVerified,
}: {
  licenseVerified?: boolean;
  insuranceVerified?: boolean;
}) {
  if (!licenseVerified && !insuranceVerified) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {licenseVerified ? (
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          License Verified
        </span>
      ) : null}
      {insuranceVerified ? (
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          Insurance Verified
        </span>
      ) : null}
    </div>
  );
}
