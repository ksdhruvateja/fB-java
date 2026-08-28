import { FEATURE_DISABLED, PRO_SUBSCRIPTION_REQUIRED, type ProFeatureId, isProFeatureId } from "./proFeatures";

export type ProRequiredDetail = {
  feature?: ProFeatureId;
  message?: string;
  source?: string;
  disabled?: boolean;
};

export const PRO_REQUIRED_EVENT = "fixbridge:pro-required";
export const FEATURE_DISABLED_EVENT = "fixbridge:feature-disabled";

export function emitProSubscriptionRequired(detail: ProRequiredDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PRO_REQUIRED_EVENT, { detail }));
}

export function emitFeatureDisabled(detail: ProRequiredDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FEATURE_DISABLED_EVENT, { detail }));
}

/** Open the shared upgrade modal from anywhere under ProFeatureProvider. */
export function promptProUpgrade(feature: ProFeatureId, source?: string) {
  emitProSubscriptionRequired({ feature, source });
}

export function parseEntitlementDeniedResponse(
  status: number,
  body: unknown
): ProRequiredDetail | null {
  if (status !== 403 || !body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const code = record.code;
  if (code !== PRO_SUBSCRIPTION_REQUIRED && code !== FEATURE_DISABLED) return null;
  const feature = record.feature;
  return {
    feature: isProFeatureId(feature) ? feature : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
    disabled: code === FEATURE_DISABLED,
  };
}

/** @deprecated Use parseEntitlementDeniedResponse */
export function parseProRequiredResponse(status: number, body: unknown) {
  const parsed = parseEntitlementDeniedResponse(status, body);
  if (!parsed || parsed.disabled) return null;
  return parsed;
}
