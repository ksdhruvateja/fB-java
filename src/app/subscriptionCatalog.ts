export const FREE_PLAN_CODE = "free";
export const PAID_HOME_CARE_PLAN_CODE = "homecare_pro";

export const LEGACY_PAID_PLAN_CODES = ["pro_membership", "homecare"] as const;

export const PAID_HOME_CARE_PLAN_CODES = [PAID_HOME_CARE_PLAN_CODE, ...LEGACY_PAID_PLAN_CODES] as const;

export function isPaidHomeCarePlan(code?: string | null): boolean {
  return PAID_HOME_CARE_PLAN_CODES.includes(code as (typeof PAID_HOME_CARE_PLAN_CODES)[number]);
}

export function isFreeTierPlan(code?: string | null): boolean {
  const c = String(code || "").trim();
  return !c || c === FREE_PLAN_CODE;
}

export function displayPlanLabel(code?: string | null): string {
  if (isPaidHomeCarePlan(code)) return "HomeCare Pro";
  return "FixBridge Free";
}

export { PRO_SUBSCRIPTION_REQUIRED } from "./proFeatures";
