import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Gift, Share2 } from "lucide-react";
import { fetchMyReferrals, type ReferralRow } from "./referralsApi";

function money(cents?: number) {
  return `$${Math.round(Number(cents || 0) / 100)}`;
}

function formatStatus(status: string) {
  return String(status || "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function statusBadge(status: string) {
  const s = String(status || "");
  if (s.includes("reward") || s === "qualified")
    return "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
  if (s.includes("pending") || s === "signed_up")
    return "bg-amber-500/10 text-amber-900 dark:text-amber-300";
  return "bg-slate-500/10 text-slate-700 dark:text-slate-300";
}

export default function ContractorReferEarn() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [link, setLink] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [homeownerReward, setHomeownerReward] = useState(10000);
  const [bonuses, setBonuses] = useState({ totalCents: 0, pendingCents: 0, paidCents: 0 });
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const r = await fetchMyReferrals();
      if (!r.ok) {
        setError(r.message || "Could not load referrals.");
        setLoading(false);
        return;
      }
      setCode(r.code || "");
      setLink(r.link || "");
      setShareMessage(r.shareMessage || "");
      setHomeownerReward(Number(r.offer?.customerRewardCents || 10000));
      setBonuses(r.bonuses || { totalCents: 0, pendingCents: 0, paidCents: 0 });
      const homeownerOnly = (r.referrals || []).filter((row) => row.type === "contractor_customer");
      setReferrals(homeownerOnly);
      setLoading(false);
    })();
  }, []);

  const signupCount = useMemo(
    () => referrals.filter((r) => r.status === "signed_up" || r.createdAt).length,
    [referrals]
  );

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy.");
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "FixBridge referral", text: shareMessage, url: link });
        return;
      } catch {
        /* ignore */
      }
    }
    await copyCode();
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading Refer & Earn…</p>;

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
          Refer & Earn
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Refer homeowners to FixBridge and earn a payout bonus when they complete their first qualifying paid service.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Total referral earnings</p>
          <p className="text-xl font-semibold">{money(bonuses.totalCents)}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Pending</p>
          <p className="text-xl font-semibold">{money(bonuses.pendingCents)}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="text-xl font-semibold">{money(bonuses.paidCents)}</p>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Your Homeowner Referral Code
        </p>
        <p className="mt-2 font-mono text-2xl font-bold tracking-wide">{code || "—"}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyCode()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy Code
          </button>
          <button
            type="button"
            onClick={() => void share()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white"
          >
            <Share2 className="h-3.5 w-3.5" /> Share with homeowners
          </button>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-border/70 bg-card p-5">
        <p className="text-sm font-semibold">
          Reward · {money(homeownerReward)} per qualified homeowner referral
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          When a homeowner signs up with your code and completes their first qualifying paid service, you receive a
          Homeowner Referral Bonus in your FixBridge payout balance.
        </p>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Homeowner signups
          </p>
          {referrals.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {signupCount} signup{signupCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
        {referrals.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-border px-5 py-10 text-center">
            <Gift className="mx-auto h-7 w-7 text-primary" />
            <p className="mt-3 text-sm font-medium">No homeowner referrals yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Share your code with homeowners to start earning.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-[1.5rem] border border-border/70 bg-card">
            {referrals.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{r.referredName || "Homeowner"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Signed up{" "}
                    {r.createdAt
                      ? new Date(r.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </p>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadge(r.status)}`}
                  >
                    {r.statusLabel || formatStatus(r.status)}
                  </span>
                </div>
                <p className="shrink-0 text-sm font-semibold">{money(r.referrerRewardCents)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
