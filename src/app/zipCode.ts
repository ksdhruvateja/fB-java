/** US ZIP helpers — FixBridge is US-only; no country picker. */

const ZIP_RE = /^\d{5}(-\d{4})?$/;

export function normalizeZip(raw: string): string {
  const cleaned = String(raw || "")
    .trim()
    .replace(/[^\d-]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length >= 9) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
  }
  return digits.slice(0, 5);
}

export function isValidUsZip(raw: string): boolean {
  return ZIP_RE.test(normalizeZip(raw));
}

/** Parse a comma/space-separated ZIP list into unique valid US ZIPs. */
export function parseZipList(raw: string): string[] {
  const parts = String(raw || "")
    .split(/[,;\s]+/)
    .map((s) => normalizeZip(s))
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const z of parts) {
    if (!isValidUsZip(z)) continue;
    const key = z.slice(0, 5);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(z);
  }
  return out;
}

export function zipInputProps() {
  return {
    inputMode: "numeric" as const,
    maxLength: 10,
    autoComplete: "postal-code",
    placeholder: "10001",
  };
}
