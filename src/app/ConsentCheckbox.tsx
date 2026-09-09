import { useState } from "react";
import LegalDocumentModal from "./LegalDocumentModal";
import type { AcceptanceType } from "./legalDocuments";
import type { LegalDocumentKey } from "./legalDocuments";
import { useAuthSurfaceStyles } from "./authSurfaceStyles";

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
  const s = useAuthSurfaceStyles();

  return (
    <>
      <label htmlFor={id} className={`flex items-start gap-2.5 text-sm leading-snug cursor-pointer ${s.consentText}`}>
        <input
          id={id}
          type="checkbox"
          className={`mt-0.5 h-4 w-4 shrink-0 rounded ${s.dark ? "border-white/40 bg-white/10" : "border-border"}`}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          <span className={required ? "" : s.consentOptional}>{label}</span>
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
  description,
  optional,
  children,
}: {
  title: string;
  description?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  const s = useAuthSurfaceStyles();

  return (
    <fieldset className={`space-y-2.5 rounded-xl border p-3 ${s.fieldset}`}>
      <legend className={`px-1 text-[11px] font-bold uppercase tracking-wider ${s.legend}`}>
        {title}
        {optional ? " (optional)" : " (required)"}
      </legend>
      {description ? (
        <p className={`px-1 text-xs -mt-0.5 ${s.consentOptional}`}>{description}</p>
      ) : null}
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
