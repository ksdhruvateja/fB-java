import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { processMarketingUnsubscribe } from "./marketingApi";

export default function MarketingUnsubscribePage({
  token,
  channel = "email",
  onManagePreferences,
}: {
  token: string;
  channel?: string;
  onManagePreferences?: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await processMarketingUnsubscribe(token, channel);
      if (cancelled) return;
      if (r.ok) {
        setStatus("ok");
        setMessage(
          r.message ||
            (channel === "sms"
              ? "You've been unsubscribed from FixBridge promotional text messages."
              : "You've been unsubscribed from FixBridge marketing emails.")
        );
      } else {
        setStatus("error");
        setMessage(r.message || "This unsubscribe link is invalid or has expired.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, channel]);

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {status === "loading" && (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF4D1C]" />
            <p>Processing your unsubscribe request…</p>
          </div>
        )}
        {status === "ok" && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="mt-4 text-xl font-bold">You're unsubscribed</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              You'll still receive important messages about your account and active services.
            </p>
            {onManagePreferences && (
              <button
                type="button"
                onClick={onManagePreferences}
                className="mt-6 text-sm font-semibold text-[#FF4D1C] hover:underline"
              >
                Manage Communication Preferences
              </button>
            )}
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-xl font-bold">Unsubscribe link invalid</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          </>
        )}
      </div>
    </div>
  );
}
