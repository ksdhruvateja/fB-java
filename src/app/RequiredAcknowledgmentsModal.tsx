import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { ConsentCheckbox, ConsentSection } from "./ConsentCheckbox";
import type { ConsentState } from "./ConsentCheckbox";
import type { AcceptanceType } from "./legalDocuments";
import { definitionForType } from "./acknowledgmentDefinitions";

export default function RequiredAcknowledgmentsModal({
  open,
  title = "Required acknowledgments",
  description = "Please review and accept the following before continuing.",
  missingTypes,
  value,
  onChange,
  onClose,
  onConfirm,
  busy = false,
}: {
  open: boolean;
  title?: string;
  description?: string;
  missingTypes: AcceptanceType[];
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
}) {
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setLocalError(null);
  }, [open, missingTypes]);

  if (!open) return null;

  const allAccepted = missingTypes.every((type) => value[type] === true);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="required-ack-title"
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="required-ack-title" className="text-lg font-bold">
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border p-1.5" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">
          <ConsentSection title="Required acknowledgments">
            {missingTypes.map((type) => {
              const def = definitionForType(type);
              return (
                <ConsentCheckbox
                  key={type}
                  id={`required-ack-${type}`}
                  checked={value[type] === true}
                  onChange={(checked) => onChange({ ...value, [type]: checked })}
                  label={def.label}
                  documentKey={def.documentKey}
                  documentLabel={def.documentLabel}
                />
              );
            })}
          </ConsentSection>
        </div>

        {localError ? <p className="mt-3 text-sm text-red-600">{localError}</p> : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!allAccepted) {
                setLocalError("Please check all required acknowledgments to continue.");
                return;
              }
              void onConfirm();
            }}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Accept &amp; continue
          </button>
        </div>
      </div>
    </div>
  );
}
