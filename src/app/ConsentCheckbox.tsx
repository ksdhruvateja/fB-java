import { useState } from "react";
import LegalDocumentModal from "./LegalDocumentModal";
import type { AcceptanceType } from "./legalDocuments";
import type { LegalDocumentKey } from "./legalDocuments";

export function ConsentCheckbox({
  id,
  checked,
  onChange,
  required = true,
  label,
  documentKey,
  documentLabel,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
  label: React.ReactNode;
  documentKey?: LegalDocumentKey;
  documentLabel?: string;
}) {
  const [docOpen, setDocOpen] = useState(false);

  return (
    <>
      <label htmlFor={id} className="flex items-start gap-2.5 text-sm leading-snug cursor-pointer">
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          <span className={required ? "" : "text-muted-foreground"}>{label}</span>
          {documentKey ? (
            <>
              {" "}
              <button
                type="button"
                className="font-semibold text-primary underline underline-offset-2"
                onClick={(e) => {
                  e.preventDefault();
                  setDocOpen(true);
                }}
              >
                {documentLabel || "View document"}
              </button>
            </>
          ) : null}
        </span>
      </label>
      {documentKey ? (
        <LegalDocumentModal documentKey={documentKey} open={docOpen} onClose={() => setDocOpen(false)} />
      ) : null}
    </>
  );
}

export function ConsentSection({
  title,
  optional,
  children,
}: {
  title: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-2.5 rounded-xl border border-border bg-muted/10 p-3">
      <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
        {optional ? " (optional)" : " (required)"}
      </legend>
      {children}
    </fieldset>
  );
}

export type ConsentState = Partial<Record<AcceptanceType, boolean>>;

export function consentsFromState(state: ConsentState): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(state)) {
    if (v === true) out[k] = true;
  }
  return out;
}

export function allChecked(state: ConsentState, keys: AcceptanceType[]) {
  return keys.every((k) => state[k] === true);
}
