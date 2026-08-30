import { useCallback, useRef, useState } from "react";
import type { ConsentState } from "./ConsentCheckbox";
import { consentsFromState } from "./ConsentCheckbox";
import type { AcceptanceType } from "./legalDocuments";
import RequiredAcknowledgmentsModal from "./RequiredAcknowledgmentsModal";

export function parseMissingAcknowledgments(r: {
  ok?: boolean;
  message?: string;
  missingAcceptanceTypes?: string[];
  code?: string;
}): AcceptanceType[] | null {
  if (r.ok !== false) return null;
  if (r.missingAcceptanceTypes?.length) {
    return r.missingAcceptanceTypes as AcceptanceType[];
  }
  const msg = (r.message || "").toLowerCase();
  if (
    msg.includes("required acknowledgments") ||
    msg.includes("acknowledgment_required") ||
    (r.code && r.code.includes("CONSENT_REQUIRED"))
  ) {
    return [];
  }
  return null;
}

export function missingConsentKeys(state: ConsentState, keys: AcceptanceType[]): AcceptanceType[] {
  return keys.filter((key) => state[key] !== true);
}

export function mergeConsentRecords(
  current: ConsentState,
  extra?: Record<string, boolean> | null
): ConsentState {
  if (!extra) return current;
  const next = { ...current };
  for (const [key, val] of Object.entries(extra)) {
    if (val === true) next[key as AcceptanceType] = true;
  }
  return next;
}

export function useAcknowledgmentGate() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<AcceptanceType[]>([]);
  const [draft, setDraft] = useState<ConsentState>({});
  const [title, setTitle] = useState("Required acknowledgments");
  const [description, setDescription] = useState(
    "Please review and accept the following before continuing."
  );
  const onConfirmRef = useRef<((consents: Record<string, boolean>) => void | Promise<void>) | null>(
    null
  );

  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
  }, [busy]);

  const prompt = useCallback(
    (opts: {
      missing: AcceptanceType[];
      currentState?: ConsentState;
      title?: string;
      description?: string;
      onConfirm: (consents: Record<string, boolean>) => void | Promise<void>;
    }) => {
      if (!opts.missing.length) return false;
      setMissing(opts.missing);
      setDraft(opts.currentState || {});
      setTitle(opts.title || "Required acknowledgments");
      setDescription(opts.description || "Please review and accept the following before continuing.");
      onConfirmRef.current = opts.onConfirm;
      setOpen(true);
      return true;
    },
    []
  );

  const promptFromResponse = useCallback(
    (
      r: Parameters<typeof parseMissingAcknowledgments>[0],
      opts: {
        currentState?: ConsentState;
        fallbackMissing?: AcceptanceType[];
        title?: string;
        description?: string;
        onConfirm: (consents: Record<string, boolean>) => void | Promise<void>;
      }
    ) => {
      const parsed = parseMissingAcknowledgments(r);
      if (parsed === null) return false;
      const missingTypes = parsed.length ? parsed : opts.fallbackMissing || [];
      if (!missingTypes.length) return false;
      return prompt({
        missing: missingTypes,
        currentState: opts.currentState,
        title: opts.title,
        description: opts.description,
        onConfirm: opts.onConfirm,
      });
    },
    [prompt]
  );

  const modal = (
    <RequiredAcknowledgmentsModal
      open={open}
      title={title}
      description={description}
      missingTypes={missing}
      value={draft}
      onChange={setDraft}
      onClose={close}
      busy={busy}
      onConfirm={async () => {
        if (!missing.every((type) => draft[type] === true)) return;
        setBusy(true);
        try {
          setOpen(false);
          await onConfirmRef.current?.(consentsFromState(draft));
        } finally {
          setBusy(false);
        }
      }}
    />
  );

  return { prompt, promptFromResponse, modal, missingConsentKeys };
}
