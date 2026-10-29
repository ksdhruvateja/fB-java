import { ConsentCheckbox } from "./ConsentCheckbox";
import type { ConsentState } from "./ConsentCheckbox";
import type { AcceptanceType } from "./legalDocuments";
import { applyAcceptAll, isAcceptAllChecked } from "./consentAcceptAll";

export default function AcceptAllConsents({
  keys,
  state,
  onChange,
  id = "accept-all-consents",
  label = "Accept all required acknowledgments",
}: {
  keys: AcceptanceType[];
  state: ConsentState;
  onChange: (next: ConsentState) => void;
  id?: string;
  label?: string;
}) {
  if (!keys.length) return null;

  const allChecked = isAcceptAllChecked(state, keys);

  return (
    <>
      <div className="border-t border-border/70 pt-3 mt-1" aria-hidden="true" />
      <ConsentCheckbox
        id={id}
        checked={allChecked}
        onChange={(checked) => onChange(applyAcceptAll(state, keys, checked))}
        label={label}
      />
    </>
  );
}
