import { useEffect, useState } from "react";
import { CheckCircle, Loader2, Tag } from "lucide-react";
import { applyJobCoupon } from "./managedJobs";

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
    if (initialCode && initialCode !== code) {
      setCode(initialCode);
    }
  }, [initialCode]);

  async function verify() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Enter a coupon code.");
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
        setError(r.message || "Invalid coupon code.");
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
      setError(e instanceof Error ? e.message : "Could not verify coupon.");
      onClear?.();
    } finally {
      setBusy(false);
    }
  }

  function clearCoupon() {
    setCode("");
    setVerified(null);
    setError(null);
    onClear?.();
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3.5 space-y-2.5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Tag className="h-4 w-4 text-[#FF4D1C]" />
        Coupon code
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono uppercase tracking-wide"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""));
            setVerified(null);
            setError(null);
            onClear?.();
          }}
          placeholder="Enter promo code"
          disabled={disabled || busy}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          disabled={disabled || busy || !code.trim()}
          onClick={() => void verify()}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#FF4D1C]/40 bg-[#FF4D1C]/10 px-4 py-2 text-sm font-semibold text-[#FF4D1C] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Verify
        </button>
      </div>
      {verified ? (
        <div className="flex items-start justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-sm text-emerald-900 dark:text-emerald-100">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{verified.summary} applied</p>
              {verified.label ? <p className="text-xs opacity-80">{verified.label}</p> : null}
              <p className="text-xs font-mono mt-0.5">{verified.code}</p>
            </div>
          </div>
          <button type="button" className="text-xs underline opacity-70" onClick={clearCoupon}>
            Remove
          </button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {!verified && !error ? (
        <p className="text-[11px] text-muted-foreground">
          Coupons from FixBridge promos apply to your dispatch hold. Verify before paying.
        </p>
      ) : null}
    </div>
  );
}
