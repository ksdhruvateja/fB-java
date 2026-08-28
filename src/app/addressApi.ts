import { api } from "./platformApi";

export type AddressVerifyResult = {
  ok: boolean;
  entered?: {
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    zip: string;
    postalCodePlus4?: string | null;
    zipDisplay?: string;
  };
  standardized?: {
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    zip: string;
    postalCodePlus4?: string | null;
    zipDisplay?: string;
  };
  verified?: boolean;
  exactMatch?: boolean;
  needsUserChoice?: boolean;
  warnings?: Array<{ code?: string; text?: string }>;
  secondaryInfo?: string | null;
  dpvConfirmation?: string | null;
  code?: string;
  message?: string;
  provider?: string;
};

export type CityStateResult = {
  ok: boolean;
  city?: string;
  state?: string;
  ZIPCode?: string;
  cached?: boolean;
  code?: string;
  message?: string;
};

export type ZipLookupResult = {
  ok: boolean;
  zip?: string;
  postalCodePlus4?: string | null;
  zipDisplay?: string;
  code?: string;
  message?: string;
};

export async function verifyAddressWithUsps(body: {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zip: string;
  postalCodePlus4?: string;
}) {
  return api<AddressVerifyResult>("/api/address/verify", {
    method: "POST",
    body: JSON.stringify({
      streetAddress: body.addressLine1,
      secondaryAddress: body.addressLine2,
      city: body.city,
      state: body.state,
      zip: body.zip,
      ZIPPlus4: body.postalCodePlus4,
    }),
  });
}

export async function lookupCityStateFromApi(zip: string) {
  const key = zip.replace(/\D/g, "").slice(0, 5);
  return api<CityStateResult>(`/api/address/city-state?zip=${encodeURIComponent(key)}`);
}

export async function lookupZipFromApi(body: {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
}) {
  const qs = new URLSearchParams({
    streetAddress: body.addressLine1,
    city: body.city,
    state: body.state,
  });
  if (body.addressLine2) qs.set("secondaryAddress", body.addressLine2);
  return api<ZipLookupResult>(`/api/address/zip?${qs.toString()}`);
}

export async function addressApiStatus() {
  return api<{
    ok: boolean;
    uspsConfigured?: boolean;
    autocompleteSupported?: boolean;
    specVersion?: string;
  }>("/api/address/status");
}
