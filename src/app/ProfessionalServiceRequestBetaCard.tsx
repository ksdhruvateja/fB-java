import { ConsentCheckbox } from "./ConsentCheckbox";
import {
  buildProfessionalRequestBetaSections,
  PROFESSIONAL_REQUEST_BETA_CHECKBOX_LABEL,
} from "./professionalRequestBetaCopy";

export default function ProfessionalServiceRequestBetaCard({
  acknowledged,
  onAcknowledgedChange,
  disabled,
}: {
  acknowledged: boolean;
  onAcknowledgedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const sections = buildProfessionalRequestBetaSections();

  return (
    <div className="rounded-xl border border-border bg-card/80 p-4 space-y-4">
      <div>
        <h4 className="font-semibold text-base">Professional Service Request</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Review the terms below before authorizing your visit.
        </p>
      </div>
      <div className="space-y-3 text-sm leading-relaxed">
        {sections.map((section) => (
          <div key={section.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">{section.title}</p>
            <p className="mt-1 text-muted-foreground">{section.body}</p>
          </div>
        ))}
      </div>
      <ConsentCheckbox
        id="professional-request-beta-ack"
        checked={acknowledged}
        onChange={onAcknowledgedChange}
        disabled={disabled}
        label={PROFESSIONAL_REQUEST_BETA_CHECKBOX_LABEL}
      />
    </div>
  );
}
