import { useEffect, useState } from "react";
import { CheckCircle, Loader2, Tag } from "lucide-react";
import { applyJobCoupon, clearJobCoupon } from "./managedJobs";

export type DispatchCouponPreview = {
  code: string;
  summary: string;
  label?: string | null;
  originalAmount: number;
  discountedAmount: number;
  discountAmount: number;
};

export default function DispatchCouponField({
  jobId,
  baseAmount,
  initialCode,
  onVerified,
  onClear,
  disabled,
}: {
  jobId: number;
  baseAmount: number;
  initialCode?: string | null;
  onVerified: (preview: DispatchCouponPreview) => void;
  onClear?: () => void;
  disabled?: boolean;
}) {
  const [code, setCode] = useState(initialCode || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<DispatchCouponPreview | null>(null);

  useEffect(() => {
    if (initialCode && initialCode !== code) setCode(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  async function apply() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError(null);
      setVerified(null);
      onClear?.();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await applyJobCoupon(jobId, trimmed);
      if (!r.ok || !r.discount) {
        setVerified(null);
        setError(r.message || "This coupon is not valid for this service.");
        onClear?.();
        return;
      }
      const originalAmount = r.visitFeeOriginal ?? baseAmount;
      const discountedAmount = r.visitFeeAfterDiscount ?? baseAmount;
      const preview: DispatchCouponPreview = {
        code: r.discount.code,
        summary: r.discount.summary,
        label: r.discount.label,
        originalAmount,
        discountedAmount,
        discountAmount: r.discountAmount ?? Math.max(0, originalAmount - discountedAmount),
      };
      setVerified(preview);
      onVerified(preview);
    } catch (e) {
      setVerified(null);
      setError(e instanceof Error ? e.message : "Could not validate coupon.");
      onClear?.();
    } finally {
      setBusy(false);
    }
  }

  async function removeCoupon() {
    setBusy(true);
    setError(null);
    try {
      await clearJobCoupon(jobId);
    } catch {
      /* allow local clear even if network fails */
    } finally {
      setCode("");
      setVerified(null);
      onClear?.();
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3.5 space-y-2.5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Tag className="h-4 w-4 text-[#FF4D1C]" />
        Have a coupon?
      </div>
      {!verified ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono uppercase tracking-wide"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""));
                setError(null);
              }}
              placeholder="Enter coupon code"
              disabled={disabled || busy}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              disabled={disabled || busy || !code.trim()}
              onClick={() => void apply()}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#FF4D1C]/40 bg-[#FF4D1C]/10 px-4 py-2 text-sm font-semibold text-[#FF4D1C] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Apply
            </button>
          </div>
          {error ? (
            <div className="space-y-1.5">
              <p className="text-xs text-red-600">{error}</p>
              <div className="flex flex-wrap gap-3 text-xs">
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setError(null);
                    setCode("");
                  }}
                  disabled={disabled || busy}
                >
                  Try Another Code
                </button>
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setError(null);
                    setCode("");
                    setVerified(null);
                    onClear?.();
                  }}
                  disabled={disabled || busy}
                >
                  Continue Without Coupon
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Optional — leave blank to continue without a coupon.</p>
          )}
        </>
      ) : (
        <div className="flex items-start justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-sm text-emerald-900 dark:text-emerald-100">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{verified.code} applied ✓</p>
              {verified.summary ? <p className="text-xs opacity-80">{verified.summary}</p> : null}
              <p className="text-xs font-mono mt-0.5 tabular-nums">−${verified.discountAmount.toFixed(2)}</p>
            </div>
          </div>
          <button type="button" className="text-xs underline opacity-70" onClick={() => void removeCoupon()} disabled={disabled || busy}>
            Remove Coupon
          </button>
        </div>
      )}
    </div>
  );
}
