import { useEffect, useState } from "react";
import { Bell, CheckCircle2, Shield } from "lucide-react";

const STORAGE_KEY = "fixbridge-home-protection-notify";

const PLANNED = [
  "Protection plans for major home systems and appliances",
  "Faster access to service professionals",
  "Repair and service support",
  "Maintenance reminders",
  "Coverage and warranty tracking",
  "Property-specific protection recommendations",
  "Simplified claims or service-request experience",
  "FixBridge Pro benefits on select plans",
] as const;

export default function HomeownerHomeProtection({
  userEmail,
  userId,
}: {
  userEmail?: string | null;
  userId?: number | string | null;
}) {
  const storageId = `${STORAGE_KEY}:${userId || userEmail || "guest"}`;
  const [notified, setNotified] = useState(false);

  useEffect(() => {
    try {
      setNotified(localStorage.getItem(storageId) === "1");
    } catch {
      setNotified(false);
    }
  }, [storageId]);

  function onNotify() {
    try {
      localStorage.setItem(storageId, "1");
      if (userEmail) {
        localStorage.setItem(`${storageId}:email`, userEmail);
      }
    } catch {
      /* ignore */
    }
    setNotified(true);
  }

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-card shadow-sm">
        <div
          className="border-b border-border/60 px-5 py-6 sm:px-7 sm:py-8"
          style={{
            background:
              "radial-gradient(ellipse at top right, rgba(16,185,129,0.12), transparent 55%), radial-gradient(ellipse at bottom left, rgba(255,77,28,0.08), transparent 50%)",
          }}
        >
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Shield className="h-4 w-4" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Coming Soon</p>
          </div>
          <h1 className="mt-3 [font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight sm:text-4xl">
            Home Protection
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            We&apos;re building <span className="font-semibold text-foreground">FixBridge Home Protection</span> to
            give homeowners an easier way to stay ahead of unexpected repairs and major home-service costs.
          </p>
        </div>

        <div className="space-y-5 px-5 py-6 sm:px-7 sm:py-7">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Home Protection will be designed to help you manage eligible home systems, service needs, repair support,
            maintenance coverage, and protection options from one place.
          </p>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Planned features may include
            </p>
            <ul className="mt-3 space-y-2.5">
              {PLANNED.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-snug">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            Your property information and service history will eventually help FixBridge recommend protection options
            that better match your home.
          </p>

          <p className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm font-medium">
            FixBridge Home Protection is currently in development.
          </p>

          {notified ? (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3.5 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
              <div>
                <p className="font-semibold text-emerald-900 dark:text-emerald-200">You&apos;re on the list</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  We&apos;ll notify{userEmail ? ` ${userEmail}` : " you"} when Home Protection becomes available.
                </p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onNotify}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,77,28,0.22)] transition hover:bg-primary/90 sm:w-auto sm:px-5"
            >
              <Bell className="h-4 w-4" />
              Notify Me When Available
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
