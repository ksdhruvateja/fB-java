import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Gift, Mail, MessageSquare, Share2 } from "lucide-react";
import { applyMyReferralCode, fetchMyReferrals, type ReferralRow } from "./referralsApi";

function money(cents?: number) {
  return `$${Math.round(Number(cents || 0) / 100)}`;
}

function statusBadge(status: string) {
  const s = String(status || "");
  if (s.includes("reward") || s === "qualified")
    return "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
  if (s.includes("pending") || s === "signed_up")
    return "bg-amber-500/10 text-amber-900 dark:text-amber-300";
  if (s === "invalid" || s === "cancelled") return "bg-red-500/10 text-red-800 dark:text-red-300";
  return "bg-slate-500/10 text-slate-700 dark:text-slate-300";
}

function formatStatus(status: string) {
  return String(status || "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function HomeownerReferEarn({
  referredByCode,
}: {
  referredByCode?: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [link, setLink] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [youEarn, setYouEarn] = useState(10000);
  const [friendEarns, setFriendEarns] = useState(10000);
  const [credits, setCredits] = useState({ availableCents: 0, pendingCents: 0, usedCents: 0 });
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [applyCode, setApplyCode] = useState("");
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReferralRow | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchMyReferrals();
      if (!r.ok) {
        setError(r.message || "Could not load referrals.");
        return;
      }
      setCode(r.code || "");
      setLink(r.link || "");
      setShareMessage(r.shareMessage || "");
      setYouEarn(Number(r.offer?.youEarnCents || 10000));
      setFriendEarns(Number(r.offer?.friendEarnsCents || 10000));
      setCredits(r.credits || { availableCents: 0, pendingCents: 0, usedCents: 0 });
      setReferrals(r.referrals || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const totalEarned = useMemo(
    () =>
      referrals
        .filter((x) => ["reward_available", "reward_earned", "reward_used"].includes(x.status))
        .reduce((sum, x) => sum + Number(x.referrerRewardCents || 0), 0),
    [referrals]
  );

  async function copy(text: string, kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
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
        /* fall through */
      }
    }
    await copy(shareMessage, "link");
  }

  async function onApply() {
    setApplyMsg(null);
    const r = await applyMyReferralCode(applyCode.trim());
    setApplyMsg(r.message || (r.ok ? "Referral applied." : "Could not apply code."));
    if (r.ok) await load();
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Refer & Earn…</p>;
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
          Refer & Earn
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Share FixBridge with friends. Both of you earn credit after the qualifying service.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Your Referral Code
        </p>
        <p className="mt-2 font-mono text-3xl font-bold tracking-wider">{code || "—"}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copy(code, "code")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted"
          >
            {copied === "code" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            Copy Code
          </button>
          <button
            type="button"
            onClick={() => void copy(link, "link")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted"
          >
            {copied === "link" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            Copy Referral Link
          </button>
          <button
            type="button"
            onClick={() => void share()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white"
          >
            <Share2 className="h-3.5 w-3.5" /> Share
          </button>
          <a
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted"
            href={`sms:?&body=${encodeURIComponent(shareMessage)}`}
          >
            <MessageSquare className="h-3.5 w-3.5" /> SMS
          </a>
          <a
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted"
            href={`mailto:?subject=${encodeURIComponent("Join me on FixBridge")}&body=${encodeURIComponent(shareMessage)}`}
          >
            <Mail className="h-3.5 w-3.5" /> Email
          </a>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">You earn</p>
            <p className="text-xl font-semibold">{money(youEarn)}</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">Your friend earns</p>
            <p className="text-xl font-semibold">{money(friendEarns)}</p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Refer a friend and both earn {money(youEarn)}. When your referral completes the qualifying action, you
          receive {money(youEarn)} toward your next eligible FixBridge service, and your friend receives{" "}
          {money(friendEarns)} as well.
        </p>
      </div>

      <div className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Referral Credits
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-semibold">{money(credits.availableCents)}</p>
            <p className="text-[11px] text-muted-foreground">Available</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{money(credits.pendingCents)}</p>
            <p className="text-[11px] text-muted-foreground">Pending</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{money(credits.usedCents)}</p>
            <p className="text-[11px] text-muted-foreground">Used</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Total earned · {money(totalEarned)}</p>
      </div>

      {!referredByCode ? (
        <div className="rounded-[1.5rem] border border-dashed border-border bg-card p-5">
          <p className="text-sm font-semibold">Have a referral code?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="min-w-[10rem] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder="Enter code"
              value={applyCode}
              onChange={(e) => setApplyCode(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void onApply()}
              className="rounded-xl bg-foreground px-3.5 py-2 text-xs font-semibold text-background"
            >
              Apply
            </button>
          </div>
          {applyMsg ? <p className="mt-2 text-xs text-muted-foreground">{applyMsg}</p> : null}
        </div>
      ) : (
        <p className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm">
          Referral applied ✓ · Your account is linked to a referrer.
        </p>
      )}

      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Your Referrals
        </p>
        {referrals.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-5 py-10 text-center">
            <Gift className="mx-auto h-7 w-7 text-primary" />
            <p className="mt-3 text-sm font-medium">No referrals yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Share your code to start earning.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-[1.5rem] border border-border/70 bg-card">
            {referrals.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{r.referredName || "Referral"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.createdAt
                        ? new Date(r.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadge(r.status)}`}
                    >
                      {r.statusLabel || formatStatus(r.status)}
                    </span>
                    <p className="mt-1 text-xs font-semibold">{money(r.referrerRewardCents)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-[1.5rem] border border-border bg-card p-5 shadow-2xl sm:rounded-[1.5rem]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Referral</p>
            <p className="mt-1 text-xl font-semibold">{selected.referredName}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Code</dt>
                <dd className="font-mono font-semibold">{selected.referralCode}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <dd>{selected.statusLabel || formatStatus(selected.status)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Reward</dt>
                <dd className="font-semibold">{money(selected.referrerRewardCents)}</dd>
              </div>
              {selected.rewardAvailableAt ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Reward date</dt>
                  <dd>
                    {new Date(selected.rewardAvailableAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </dd>
                </div>
              ) : null}
            </dl>
            <button
              type="button"
              className="mt-5 w-full rounded-xl border border-border py-2.5 text-sm font-semibold"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
