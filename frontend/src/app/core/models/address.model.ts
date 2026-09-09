export type AddressSuggestion = {
  label: string;
  primary: string;
  secondary: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  zip: string;
  postalCodePlus4?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  resultType?: string | null;
};

export type AddressAutocompleteResponse = {
  ok: boolean;
  configured?: boolean;
  suggestions?: AddressSuggestion[];
  skipped?: boolean;
  unavailable?: boolean;
  message?: string;
  code?: string;
};
