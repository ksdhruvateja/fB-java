import { StructuredAddressFields, type StructuredAddressSuggestionMeta } from "./UsLocationFields";

/**
 * Structured address entry with Geoapify suggestions (via backend proxy).
 * Kept as VerifiedAddressFields for call-site compatibility — not a verification gate.
 */
export type AddressVerificationStatus = "unverified";

export type AddressVerificationMeta = {
  status: AddressVerificationStatus;
  addressVerified: boolean;
  provider?: null;
  postalCodePlus4?: string | null;
  manualAccepted?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
};

type Props = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zip: string;
  onAddressLine1Change: (v: string) => void;
  onAddressLine2Change: (v: string) => void;
  onCityChange: (v: string) => void;
  onStateChange: (v: string) => void;
  onZipChange: (v: string) => void;
  onVerificationChange?: (meta: AddressVerificationMeta) => void;
  disabled?: boolean;
  zipRequired?: boolean;
  idPrefix?: string;
  /** Unused legacy prop — kept for call-site compatibility. */
  initiallyVerified?: boolean;
  /** Unused legacy prop — kept for call-site compatibility. */
  skipVerification?: boolean;
};

export function VerifiedAddressFields({
  addressLine1,
  addressLine2 = "",
  city,
  state,
  zip,
  onAddressLine1Change,
  onAddressLine2Change,
  onCityChange,
  onStateChange,
  onZipChange,
  onVerificationChange,
  disabled,
  zipRequired = true,
  idPrefix = "addr",
}: Props) {
  function emitSuggestionMeta(meta: StructuredAddressSuggestionMeta) {
    onVerificationChange?.({
      status: "unverified",
      addressVerified: false,
      provider: null,
      postalCodePlus4: meta.postalCodePlus4 ?? null,
      latitude: meta.latitude ?? null,
      longitude: meta.longitude ?? null,
      placeId: meta.placeId ?? null,
    });
  }

  return (
    <StructuredAddressFields
      idPrefix={idPrefix}
      addressLine1={addressLine1}
      addressLine2={addressLine2}
      city={city}
      state={state}
      zip={zip}
      onAddressLine1Change={onAddressLine1Change}
      onAddressLine2Change={onAddressLine2Change}
      onCityChange={onCityChange}
      onStateChange={onStateChange}
      onZipChange={onZipChange}
      onSuggestionMeta={emitSuggestionMeta}
      disabled={disabled}
      zipRequired={zipRequired}
    />
  );
}
