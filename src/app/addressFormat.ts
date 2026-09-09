/** Shared structured address helpers for properties, quotes, invoices, and admin. */

export type StructuredAddress = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export function isAddressComplete(a: StructuredAddress | null | undefined): boolean {
  if (!a) return false;
  return Boolean(
    String(a.addressLine1 || "").trim() &&
      String(a.city || "").trim() &&
      String(a.state || "").trim() &&
      String(a.zip || "").trim()
  );
}

/** Display lines; omits empty Address Line 2. */
export function formatAddressLines(a: StructuredAddress | null | undefined): string[] {
  if (!a) return [];
  const line1 = String(a.addressLine1 || "").trim();
  const line2 = String(a.addressLine2 || "").trim();
  const city = String(a.city || "").trim();
  const state = String(a.state || "").trim();
  const zip = String(a.zip || "").trim();
  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [line1, line2, cityStateZip].filter(Boolean);
}

export function formatCityStateZip(a: StructuredAddress | null | undefined): string {
  if (!a) return "";
  const city = String(a.city || "").trim();
  const state = String(a.state || "").trim();
  const zip = String(a.zip || "").trim();
  return [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export function formatAddressSingleLine(a: StructuredAddress | null | undefined): string {
  return formatAddressLines(a).join(", ");
}

/** Five-digit ZIP for pricing/dispatch — strips ZIP+4. */
export function zip5ForPricing(zip: string | null | undefined): string {
  const digits = String(zip || "").replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : digits;
}

/** Build structured fields from legacy flat bill-to / freeform address. */
export function normalizeStructuredAddress(
  input: StructuredAddress & {
    street?: string | null;
    cityStateZip?: string | null;
    address?: string | null;
  } | null | undefined
): StructuredAddress {
  if (!input) {
    return { addressLine1: "", addressLine2: "", city: "", state: "", zip: "" };
  }

  let addressLine1 = String(input.addressLine1 || input.street || "").trim();
  let addressLine2 = String(input.addressLine2 || "").trim();
  let city = String(input.city || "").trim();
  let state = String(input.state || "").trim();
  let zip = String(input.zip || "").trim();

  const csz = String(input.cityStateZip || "").trim();
  if ((!city || !state || !zip) && csz) {
    const m = csz.match(/^(.+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (m) {
      if (!city) city = m[1].trim();
      if (!state) state = m[2].toUpperCase();
      if (!zip) zip = m[3];
    } else if (!city) {
      city = csz;
    }
  }

  if (!addressLine1 && input.address) {
    const parts = String(input.address)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 1) addressLine1 = parts[0];
    if (parts.length >= 2 && !addressLine2 && !city) {
      // Heuristic: "line1, city, ST ZIP" or "line1, line2, city, ST ZIP"
      const last = parts[parts.length - 1];
      const stZip = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      if (stZip) {
        state = state || stZip[1].toUpperCase();
        zip = zip || stZip[2];
        city = city || parts[parts.length - 2] || "";
        if (parts.length >= 4) addressLine2 = parts[1];
      }
    }
  }

  return { addressLine1, addressLine2, city, state, zip };
}

export function structuredToBillToExtras(a: StructuredAddress) {
  const lines = formatAddressLines(a);
  return {
    addressLine1: a.addressLine1 || "",
    addressLine2: a.addressLine2 || "",
    city: a.city || "",
    state: a.state || "",
    zip: a.zip || "",
    street: a.addressLine1 || "",
    cityStateZip: formatCityStateZip(a),
    address: lines.join(", "),
  };
}
