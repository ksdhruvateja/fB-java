import { api } from "./platformApi";

export type HomeCareFeatureEntitlement = {
  enabled: boolean;
  entitled: boolean;
  label: string;
  requiresPro: boolean;
};

export type HomeCareAdminConfig = {
  configVersion: number;
  updatedAt?: string | null;
  features: Record<
    string,
    {
      enabled: boolean;
      free: boolean;
      pro: boolean;
      label: string;
      benefit?: string;
    }
  >;
  priorityRouting: {
    enabled: boolean;
    level: "standard" | "elevated" | "high";
    showWorkQueueBadge: boolean;
    showDispatchBadge: boolean;
  };
  recurring: {
    cleaningEnabled: boolean;
    landscapingEnabled: boolean;
    frequencies: Record<string, boolean>;
    fulfillmentMode: "manual" | "automatic";
    schedulerAvailable: boolean;
    leadTimeDays: number;
  };
  maintenance: Record<string, unknown>;
  documents: Record<string, unknown>;
  household: Record<string, unknown>;
  homeHealthReport: Record<string, unknown>;
  quoteSecondOpinion: Record<string, unknown>;
  propertyAwareAi: Record<string, unknown>;
  upgrade: { headline: string; cta: string; description: string };
};

export type HomeCarePricingConfig = {
  standardCoordinationFee: number;
  homecareProCoordinationFee: number;
  subscriptionDiscount: number;
};

export async function getAdminHomeCareSettings() {
  return api<{
    ok: boolean;
    config?: HomeCareAdminConfig;
    pricing?: HomeCarePricingConfig;
    message?: string;
  }>("/api/admin/homecare/settings");
}

export async function patchAdminHomeCareSettings(config: Partial<HomeCareAdminConfig>, confirmImpact = false) {
  return api<{
    ok: boolean;
    config?: HomeCareAdminConfig;
    warnings?: string[];
    code?: string;
    message?: string;
  }>("/api/admin/homecare/settings", {
    method: "PATCH",
    body: JSON.stringify({ config, confirmImpact }),
  });
}

export async function patchAdminHomeCarePricing(
  pricing: Partial<HomeCarePricingConfig>,
  confirmImpact = false
) {
  return api<{ ok: boolean; pricing?: HomeCarePricingConfig; code?: string; message?: string }>(
    "/api/admin/homecare/pricing",
    {
      method: "PATCH",
      body: JSON.stringify({
        standardCoordinationFee: pricing.standardCoordinationFee,
        homecareProCoordinationFee: pricing.homecareProCoordinationFee,
        subscriptionDiscount: pricing.subscriptionDiscount,
        confirmImpact,
      }),
    }
  );
}

export async function getHomeCareConfigForUser() {
  return api<{
    ok: boolean;
    config?: {
      configVersion: number;
      features: Record<string, HomeCareFeatureEntitlement>;
      upgrade: { headline: string; cta: string; description: string };
    };
  }>("/api/homecare/config/me");
}
