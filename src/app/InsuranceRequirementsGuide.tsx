import { ExternalLink } from "lucide-react";
import InsuranceRequirementsLink from "./InsuranceRequirementsLink";
import {
  COI_SAMPLE_URL,
  CONTRACTOR_INSURANCE_NOTICE,
  INSURANCE_GUIDE_SECTIONS,
} from "./insuranceRequirementsContent";

type Props = {
  /** Show link to sample marked-up COI */
  showSampleLink?: boolean;
  /** Compact layout for modals */
  compact?: boolean;
  className?: string;
};

export default function InsuranceRequirementsGuide({
  showSampleLink = true,
  compact = false,
  className = "",
}: Props) {
  return (
    <div className={`space-y-4 text-sm leading-relaxed ${className}`}>
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-amber-950 dark:text-amber-100">
        <p className="font-semibold">Contractor instruction</p>
        <p className="mt-1">{CONTRACTOR_INSURANCE_NOTICE}</p>
      </div>

      {INSURANCE_GUIDE_SECTIONS.map((section) => (
        <section key={section.id} className={compact ? "space-y-1.5" : "space-y-2"}>
          <h3 className={`font-semibold text-foreground ${compact ? "text-sm" : "text-base"}`}>
            {section.title}
          </h3>
          <div className="text-muted-foreground">{section.body}</div>
        </section>
      ))}

      {showSampleLink ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <InsuranceRequirementsLink label="Open official Insurance Requirements PDF" />
          <a
            href={COI_SAMPLE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted/50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Sample marked-up COI
          </a>
        </div>
      ) : null}
    </div>
  );
}
