import { isPaidHomeCarePlan } from "./subscriptionCatalog";
import type { HomeCareSubscription } from "./auth";

/** Matches backend `code` for subscription-gated APIs. */
export const PRO_SUBSCRIPTION_REQUIRED = "PRO_SUBSCRIPTION_REQUIRED";
export const FEATURE_DISABLED = "FEATURE_DISABLED";

export type ProFeatureId =
  | "property_aware_ai"
  | "maintenance_calendar"
  | "document_vault"
  | "recurring_cleaning"
  | "recurring_landscaping"
  | "priority_routing"
  | "reduced_coordination_fees"
  | "quote_second_opinion"
  | "household_sharing"
  | "annual_health_report";

export type ProFeatureCopy = {
  title: string;
  benefit: string;
};

export const PRO_FEATURE_COPY: Record<ProFeatureId, ProFeatureCopy> = {
  property_aware_ai: {
    title: "Unlock Property-Aware AI",
    benefit:
      "Get recommendations informed by your home's systems, repair history, appliances, warranties, and Property Passport.",
  },
  maintenance_calendar: {
    title: "Unlock Maintenance Calendar",
    benefit: "Keep track of seasonal maintenance and recurring home-care tasks in one place.",
  },
  document_vault: {
    title: "Unlock Warranty & Document Vault",
    benefit:
      "Keep warranties, receipts, manuals, inspection reports, and important property documents organized with your home.",
  },
  recurring_cleaning: {
    title: "Unlock Recurring Cleaning",
    benefit: "Set up recurring cleaning through FixBridge and manage ongoing home care from one place.",
  },
  recurring_landscaping: {
    title: "Unlock Recurring Landscaping",
    benefit: "Schedule and manage recurring landscaping as part of your ongoing HomeCare Pro plan.",
  },
  priority_routing: {
    title: "Unlock Priority Request Routing",
    benefit: "Get faster routing options when you need a professional on a tighter timeline.",
  },
  reduced_coordination_fees: {
    title: "Unlock Reduced Coordination Fees",
    benefit: "Save on FixBridge coordination fees on eligible service requests with HomeCare Pro.",
  },
  quote_second_opinion: {
    title: "Unlock AI Quote Second Opinion",
    benefit:
      "Get additional AI guidance to better understand the scope and pricing of your FixBridge quote.",
  },
  household_sharing: {
    title: "Unlock Household Sharing",
    benefit: "Invite household members and give them controlled access to help manage your home.",
  },
  annual_health_report: {
    title: "Unlock Annual AI Home Health Report",
    benefit:
      "Get an AI-generated annual overview of your home's maintenance, repairs, systems, and upcoming priorities.",
  },
};

/** Pro-only surfaces — free users may see them with a lock, but cannot access data/actions. */
export const PRO_FEATURE_IDS: ProFeatureId[] = Object.keys(PRO_FEATURE_COPY) as ProFeatureId[];

/** Whether the signed-in user has active HomeCare Pro entitlement (server state preferred). */
export function hasProEntitlement(
  planCode?: string | null,
  homeCareSubscription?: HomeCareSubscription | null
): boolean {
  if (homeCareSubscription != null) return homeCareSubscription.isPro === true;
  return isPaidHomeCarePlan(planCode);
}

export function resolveClientProAccess(user: {
  planCode?: string | null;
  homeCareSubscription?: HomeCareSubscription | null;
}): { isPro: boolean; subscription: HomeCareSubscription | null } {
  if (user.homeCareSubscription != null) {
    return { isPro: user.homeCareSubscription.isPro === true, subscription: user.homeCareSubscription };
  }
  return { isPro: isPaidHomeCarePlan(user.planCode), subscription: null };
}

export function proFeatureCopy(feature: ProFeatureId): ProFeatureCopy {
  return PRO_FEATURE_COPY[feature] ?? {
    title: "Unlock HomeCare Pro",
    benefit: "Upgrade to HomeCare Pro to access this feature and more year-round home management tools.",
  };
}

export function isProFeatureId(value: unknown): value is ProFeatureId {
  return typeof value === "string" && value in PRO_FEATURE_COPY;
}

export function trackProFeatureEvent(
  name:
    | "pro_feature_clicked"
    | "pro_upgrade_modal_viewed"
    | "pro_upgrade_clicked"
    | "pro_checkout_started"
    | "pro_subscription_completed",
  detail: { feature?: ProFeatureId; source?: string }
) {
  try {
    window.dispatchEvent(
      new CustomEvent("fixbridge:pro-analytics", {
        detail: { name, ...detail, at: new Date().toISOString() },
      })
    );
  } catch {
    // ignore
  }
}
