import { useCallback, useEffect, useState } from "react";
import { checkServiceAreaCoverage } from "./addressApi";
import { VerifiedAddressFields } from "./VerifiedAddressInput";
import { isValidUsZip, normalizeZip } from "./zipCode";
import { useAuthSurfaceStyles } from "./authSurfaceStyles";

type Props = {
  idPrefix?: string;
  /** Kept for call-site compatibility; Geoapify proxy uses auth when a token is present. */
  requireAuth?: boolean;
  streetAddress: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  onStreetAddressChange: (v: string) => void;
  onUnitChange: (v: string) => void;
  onCityChange: (v: string) => void;
  onStateChange: (v: string) => void;
  onZipChange: (v: string) => void;
  onGeoChange?: (geo: { lat: number | null; lng: number | null; county: string }) => void;
  onCoverageChange?: (covered: boolean | null, message?: string) => void;
};

/**
 * Legacy wrapper around Geoapify-backed VerifiedAddressFields.
 * Kept so guest/login/report call sites get the same autocomplete as Add New Address.
 */
export default function AddressAutocompleteField({
  idPrefix = "addr",
  streetAddress,
  unit,
  city,
  state,
  zip,
  onStreetAddressChange,
  onUnitChange,
  onCityChange,
  onStateChange,
  onZipChange,
  onGeoChange,
  onCoverageChange,
}: Props) {
  const s = useAuthSurfaceStyles();
  const [coverageMsg, setCoverageMsg] = useState<string | null>(null);
  const [coverageOk, setCoverageOk] = useState<boolean | null>(null);

  const runCoverageCheck = useCallback(
    async (zipCode: string) => {
      if (!isValidUsZip(zipCode)) {
        setCoverageOk(null);
        setCoverageMsg(null);
        onCoverageChange?.(null);
        return;
      }
      const r = await checkServiceAreaCoverage(normalizeZip(zipCode));
      setCoverageOk(r.covered ?? null);
      setCoverageMsg(r.message || r.market || null);
      onCoverageChange?.(r.covered ?? null, r.message || r.market);
    },
    [onCoverageChange]
  );

  useEffect(() => {
    if (zip && isValidUsZip(zip)) void runCoverageCheck(zip);
  }, [zip, runCoverageCheck]);

  return (
    <div className="space-y-3">
      <VerifiedAddressFields
        idPrefix={idPrefix}
        addressLine1={streetAddress}
        addressLine2={unit}
        city={city}
        state={state}
        zip={zip}
        onAddressLine1Change={onStreetAddressChange}
        onAddressLine2Change={onUnitChange}
        onCityChange={onCityChange}
        onStateChange={onStateChange}
        onZipChange={(v) => {
          const next = normalizeZip(v);
          onZipChange(next);
          if (isValidUsZip(next)) void runCoverageCheck(next);
        }}
        onVerificationChange={(meta) => {
          onGeoChange?.({
            lat: meta.latitude ?? null,
            lng: meta.longitude ?? null,
            county: "",
          });
        }}
      />

      {coverageOk === true ? (
        <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
          ✓ Service available{coverageMsg ? ` · ${coverageMsg}` : ""}
        </p>
      ) : null}
      {coverageOk === false ? (
        <p className={`rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs ${s.dark ? "text-amber-200" : "text-amber-900"}`}>
          {coverageMsg || "We'll confirm service availability for your ZIP before dispatch."}
        </p>
      ) : null}
    </div>
  );
}
