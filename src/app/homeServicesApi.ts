import { getStoredToken } from "./auth";
import type { ActivationFeeSettings, ServiceOffering } from "./serviceOfferings";

type HomeServicesResponse = {
  ok: boolean;
  offerings?: ServiceOffering[];
  activationFee?: ActivationFeeSettings;
};

// Only the shared service catalog is cached, never entitlements or property data.
// A new session discards both cached data and the previous session's in-flight GET.
const CATALOG_TTL_MS = 30_000;
let sessionToken: string | null | undefined;
let cached: { data: HomeServicesResponse; expiresAt: number } | null = null;
let inFlight: Promise<HomeServicesResponse> | null = null;

export function loadHomeServices(): Promise<HomeServicesResponse> {
  const token = getStoredToken();
  if (token !== sessionToken) {
    sessionToken = token;
    cached = null;
    inFlight = null;
  }
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
  if (inFlight) return inFlight;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12_000);
  const request = fetch("/api/home-services", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: controller.signal,
  })
    .then(async (response): Promise<HomeServicesResponse> => {
      const data: HomeServicesResponse = await response.json();
      if (response.ok && data.ok && token === getStoredToken()) {
        cached = { data, expiresAt: Date.now() + CATALOG_TTL_MS };
      }
      return data;
    })
    .finally(() => {
      window.clearTimeout(timer);
      if (inFlight === request) inFlight = null;
    });
  inFlight = request;
  return request;
}
