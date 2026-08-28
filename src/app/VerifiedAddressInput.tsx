import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, MapPin } from "lucide-react";
import { StructuredAddressFields } from "./UsLocationFields";
import { verifyAddressWithUsps, type AddressVerifyResult } from "./addressApi";
import { formatAddressLines, zip5ForPricing, type StructuredAddress } from "./addressFormat";

export type AddressVerificationStatus =
  | "unverified"
  | "checking"
  | "verified"
  | "suggested"
  | "failed"
  | "unavailable"
  | "incomplete";

export type AddressVerificationMeta = {
  status: AddressVerificationStatus;
  addressVerified: boolean;
  provider?: "usps" | null;
  postalCodePlus4?: string | null;
  manualAccepted?: boolean;
};

type Props = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zip: string;
  onAddressLine1Change: (v: string) => void;
  onAddressLine2Change?: (v: string) => void;
  onCityChange: (v: string) => void;
  onStateChange: (v: string) => void;
  onZipChange: (v: string) => void;
  onVerificationChange?: (meta: AddressVerificationMeta) => void;
  disabled?: boolean;
  zipRequired?: boolean;
  idPrefix?: string;
  /** Skip USPS calls when property is already verified and unchanged. */
  initiallyVerified?: boolean;
  skipVerification?: boolean;
};

function fieldsComplete(a: StructuredAddress) {
  return Boolean(
    String(a.addressLine1 || "").trim() &&
      String(a.city || "").trim() &&
      String(a.state || "").trim() &&
      String(a.zip || "").trim()
  );
}

function formatBlock(a?: StructuredAddress | null) {
  if (!a) return "—";
  return formatAddressLines(a).join("\n");
}

export function VerifiedAddressFields({
  addressLine1,
  addressLine2,
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
  initiallyVerified = false,
  skipVerification = false,
}: Props) {
  const [status, setStatus] = useState<AddressVerificationStatus>(
    initiallyVerified ? "verified" : "unverified"
  );
  const [addressVerified, setAddressVerified] = useState(initiallyVerified);
  const [postalCodePlus4, setPostalCodePlus4] = useState<string | null>(null);
  const [manualAccepted, setManualAccepted] = useState(false);
  const [verifyResult, setVerifyResult] = useState<AddressVerifyResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const verifySeq = useRef(0);
  const baseline = useRef(
    JSON.stringify({ addressLine1, addressLine2, city, state, zip })
  );

  const current = useMemo(
    () => ({
      addressLine1,
      addressLine2,
      city,
      state,
      zip,
    }),
    [addressLine1, addressLine2, city, state, zip]
  );

  const emit = useCallback(
    (next: AddressVerificationMeta) => {
      onVerificationChange?.(next);
    },
    [onVerificationChange]
  );

  useEffect(() => {
    const snapshot = JSON.stringify(current);
    if (snapshot !== baseline.current) {
      baseline.current = snapshot;
      if (!skipVerification) {
        setStatus(initiallyVerified ? "verified" : "unverified");
        setAddressVerified(initiallyVerified);
        setPostalCodePlus4(null);
        setManualAccepted(false);
        setVerifyResult(null);
        setErrorMessage(null);
        emit({
          status: initiallyVerified ? "verified" : "unverified",
          addressVerified: initiallyVerified,
          provider: initiallyVerified ? "usps" : null,
        });
      }
    }
  }, [current, emit, initiallyVerified, skipVerification]);

  useEffect(() => {
    if (skipVerification) {
      emit({
        status: initiallyVerified ? "verified" : "unverified",
        addressVerified: initiallyVerified,
        provider: initiallyVerified ? "usps" : null,
        postalCodePlus4,
      });
    }
  }, [skipVerification, initiallyVerified, postalCodePlus4, emit]);

  async function runVerify() {
    if (skipVerification) return;
    if (!fieldsComplete(current)) {
      setStatus("incomplete");
      setErrorMessage("Complete street, city, state, and ZIP before verifying.");
      emit({
        status: "incomplete",
        addressVerified: false,
        manualAccepted,
        postalCodePlus4,
      });
      return;
    }

    const seq = ++verifySeq.current;
    setStatus("checking");
    setErrorMessage(null);
    emit({ status: "checking", addressVerified: false, postalCodePlus4 });

    const result = await verifyAddressWithUsps({
      addressLine1: current.addressLine1.trim(),
      addressLine2: current.addressLine2?.trim(),
      city: current.city.trim(),
      state: current.state.trim(),
      zip: zip5ForPricing(current.zip),
      postalCodePlus4: postalCodePlus4 || undefined,
    });

    if (seq !== verifySeq.current) return;

    if (!result.ok) {
      const unavailable = result.code === "USPS_NOT_CONFIGURED" || result.code === "USPS_UNAVAILABLE";
      setStatus(unavailable ? "unavailable" : "failed");
      setErrorMessage(
        unavailable
          ? "Address verification is temporarily unavailable. You can continue and verify later."
          : result.message || "Could not verify this address."
      );
      setVerifyResult(null);
      emit({
        status: unavailable ? "unavailable" : "failed",
        addressVerified: false,
        manualAccepted,
        postalCodePlus4,
      });
      return;
    }

    setVerifyResult(result);
    const plus4 = result.standardized?.postalCodePlus4 || null;
    setPostalCodePlus4(plus4);

    if (result.exactMatch) {
      setStatus("verified");
      setAddressVerified(true);
      setManualAccepted(false);
      emit({
        status: "verified",
        addressVerified: true,
        provider: "usps",
        postalCodePlus4: plus4,
      });
      return;
    }

    setStatus("suggested");
    setAddressVerified(false);
    emit({
      status: "suggested",
      addressVerified: false,
      provider: "usps",
      postalCodePlus4: plus4,
    });
  }

  function applyStandardized() {
    const s = verifyResult?.standardized;
    if (!s) return;
    onAddressLine1Change(s.addressLine1);
    onAddressLine2Change?.(s.addressLine2 || "");
    onCityChange(s.city);
    onStateChange(s.state);
    onZipChange(s.zip);
    const plus4 = s.postalCodePlus4 || null;
    setPostalCodePlus4(plus4);
    setStatus("verified");
    setAddressVerified(true);
    setManualAccepted(false);
    setVerifyResult(null);
    baseline.current = JSON.stringify({
      addressLine1: s.addressLine1,
      addressLine2: s.addressLine2 || "",
      city: s.city,
      state: s.state,
      zip: s.zip,
    });
    emit({
      status: "verified",
      addressVerified: true,
      provider: "usps",
      postalCodePlus4: plus4,
    });
  }

  function keepEntered() {
    setStatus("unverified");
    setAddressVerified(false);
    setManualAccepted(true);
    setVerifyResult(null);
    emit({
      status: "unverified",
      addressVerified: false,
      manualAccepted: true,
      postalCodePlus4,
    });
  }

  const showVerifiedBadge = addressVerified && status === "verified";
  const secondaryWarning =
    verifyResult?.secondaryInfo ||
    verifyResult?.warnings?.map((w) => w.text || w.code).filter(Boolean).join(" ");

  return (
    <div className="grid gap-3">
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
        disabled={disabled}
        zipRequired={zipRequired}
      />

      {!skipVerification ? (
        <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              USPS address verification
            </p>
            {showVerifiedBadge ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Verified by USPS
              </span>
            ) : manualAccepted ? (
              <span className="text-[11px] font-medium text-amber-700">Using entered address (not verified)</span>
            ) : null}
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            Enter your full address, then verify with USPS for a standardized mailing address. USPS does not provide
            street-level autocomplete — verification runs when your address is complete.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || status === "checking" || !fieldsComplete(current)}
              onClick={() => void runVerify()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {status === "checking" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {status === "checking" ? "Checking…" : "Verify with USPS"}
            </button>
          </div>

          {errorMessage ? (
            <p className="mt-2 flex items-start gap-2 text-xs text-amber-800">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {errorMessage}
            </p>
          ) : null}

          {status === "suggested" && verifyResult?.standardized ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Address you entered
                </p>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                  {formatBlock(verifyResult.entered)}
                </pre>
                <button
                  type="button"
                  className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/50"
                  onClick={keepEntered}
                >
                  Use entered address
                </button>
              </div>
              <div className="rounded-lg border border-emerald-300/60 bg-emerald-50/50 p-3 dark:border-emerald-800/40 dark:bg-emerald-950/20">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-200">
                  USPS verified address
                </p>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                  {formatBlock(verifyResult.standardized)}
                </pre>
                <button
                  type="button"
                  className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  onClick={applyStandardized}
                >
                  Use this address
                </button>
              </div>
            </div>
          ) : null}

          {secondaryWarning ? (
            <p className="mt-2 text-xs text-amber-800">{secondaryWarning}</p>
          ) : null}
        </div>
      ) : initiallyVerified ? (
        <p className="text-xs text-emerald-700 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          USPS verified address on file
        </p>
      ) : null}
    </div>
  );
}
