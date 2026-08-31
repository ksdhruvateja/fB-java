import type { ConsentState } from "./ConsentCheckbox";
import type { AcceptanceType } from "./legalDocuments";

/** Required homeowner dispatch acknowledgments (Accept All applies only to these). */
export const DISPATCH_ACKNOWLEDGMENT_KEYS: AcceptanceType[] = [
  "PROFESSIONAL_DISPATCH_PROVIDER_ACK",
  "PROFESSIONAL_DISPATCH_FIXBRIDGE_ACK",
  "VISIT_FEE_ACK",
  "HOMEOWNER_SERVICE_AGREEMENT",
  "VISIT_CANCELLATION_POLICY",
];

export function isAcceptAllChecked(state: ConsentState, keys: AcceptanceType[]): boolean {
  return keys.length > 0 && keys.every((key) => state[key] === true);
}

/** UI convenience only — sets each listed key; does not touch other consent keys (e.g. marketing). */
export function applyAcceptAll(
  state: ConsentState,
  keys: AcceptanceType[],
  checked: boolean
): ConsentState {
  const next = { ...state };
  for (const key of keys) {
    next[key] = checked;
  }
  return next;
}

export function updateConsentKey(
  state: ConsentState,
  key: AcceptanceType,
  checked: boolean
): ConsentState {
  return { ...state, [key]: checked };
}

export function isDispatchAcknowledgmentType(type: AcceptanceType): boolean {
  return DISPATCH_ACKNOWLEDGMENT_KEYS.includes(type);
}
