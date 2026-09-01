import type { ConsentState } from "./ConsentCheckbox";
import type { AcceptanceType } from "./legalDocuments";

/** Required homeowner dispatch acknowledgment (single beta checkbox). */
export const DISPATCH_ACKNOWLEDGMENT_KEYS: AcceptanceType[] = ["PROFESSIONAL_REQUEST_BETA_ACK"];

/** Required Guided DIY safety acknowledgments before starting DIY. */
export const DIY_SAFETY_ACKNOWLEDGMENT_KEYS: AcceptanceType[] = [
  "DIY_SAFETY",
  "DIY_SAFETY_ABILITY_ACK",
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
