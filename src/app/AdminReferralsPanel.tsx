import { useEffect, useState } from "react";
import {
  adminReferralAction,
  fetchAdminReferralConfig,
  fetchAdminReferralOverview,
  fetchAdminReferrals,
  saveAdminReferralConfig,
  type ReferralRow,
} from "./referralsApi";

type SubTab =
  | "overview"
  | "homeowner"
  | "contractor_customer"
  | "contractor_contractor"
  | "rules"
  | "fraud";

function money(cents?: number) {
  return `$${Math.round(Number(cents || 0) / 100).toLocaleString()}`;
}

function dollarsInput(cents: number) {
  return String(Math.round(Number(cents || 0) / 100));
}

function toCents(raw: string) {
  return Math.round(Number(raw || 0) * 100);
}

export default function AdminReferralsPanel() {
  const [sub, setSub] = useState<SubTab>("overview");
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState("");

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const [o, c] = await Promise.all([fetchAdminReferralOverview(), fetchAdminReferralConfig()]);
      if (o.ok) setOverview(o.overview || null);
      if (c.ok) setConfig(c.config || null);
      const type =
        sub === "homeowner"
          ? "homeowner_homeowner"
          : sub === "contractor_customer"
            ? "contractor_customer"
            : sub === "contractor_contractor"
              ? "contractor_contractor"
              : sub === "fraud"
                ? undefined
                : undefined;
      const status = sub === "fraud" ? "invalid" : undefined;
      const list = await fetchAdminReferrals({ type, status, q: q || undefined });
      if (list.ok) setReferrals(list.referrals || []);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub]);

  async function saveConfig() {
    if (!config) return;
    setBusy(true);
    const r = await saveAdminReferralConfig(config);
    setBusy(false);
    setMsg(r.ok ? "Rules saved. New referrals will use these amounts." : r.message || "Save failed.");
    if (r.ok && r.config) setConfig(r.config);
  }

  async function runAction(id: number, action: string) {
    setBusy(true);
    const r = await adminReferralAction(id, action, note || undefined);
    setBusy(false);
    setMsg(r.ok ? `Action “${action}” applied.` : r.message || "Action failed.");
    setNote("");
    await refresh();
  }

  const tabs: { id: SubTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "homeowner", label: "Homeowner Referrals" },
    { id: "contractor_customer", label: "Contractor → Homeowner" },
    { id: "contractor_contractor", label: "Contractor → Contractor" },
    { id: "rules", label: "Rules" },
    { id: "fraud", label: "Fraud / Invalid" },
  ];

  return (
    <section className="space-y-5">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
          Referrals
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage Refer & Earn amounts, qualification, and rewards. Separate from promo coupons and B2B partners.
        </p>
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${
              sub === t.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

      {sub === "overview" && overview ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Homeowner referrals (month)", overview.homeownerReferrals],
            ["Qualified", overview.qualified],
            ["Pending", overview.pending],
            ["Contractor → homeowner", overview.contractorCustomerRefs],
            ["Contractor network", overview.contractorNetworkRefs],
            ["Rewards issued", money(overview.rewardsIssuedCents)],
            ["Pending rewards", money(overview.pendingRewardsCents)],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {sub === "rules" && config ? (
        <div className="space-y-4 rounded-[1.5rem] border border-border bg-card p-5">
          <div>
            <p className="text-sm font-semibold">Homeowner → Homeowner</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-xs">
                Referrer reward ($)
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={dollarsInput(config.homeowner_homeowner?.referrerRewardCents)}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      homeowner_homeowner: {
                        ...config.homeowner_homeowner,
                        referrerRewardCents: toCents(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label className="text-xs">
                Referred reward ($)
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={dollarsInput(config.homeowner_homeowner?.referredRewardCents)}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      homeowner_homeowner: {
                        ...config.homeowner_homeowner,
                        referredRewardCents: toCents(e.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold">Contractor → Homeowner</p>
            <label className="mt-2 block text-xs">
              Contractor payout bonus ($)
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm sm:max-w-xs"
                value={dollarsInput(config.contractor_customer?.contractorRewardCents)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contractor_customer: {
                      ...config.contractor_customer,
                      contractorRewardCents: toCents(e.target.value),
                    },
                  })
                }
              />
            </label>
          </div>
          <div>
            <p className="text-sm font-semibold">Contractor → Contractor</p>
            <label className="mt-2 block text-xs">
              Contractor payout bonus ($)
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm sm:max-w-xs"
                value={dollarsInput(config.contractor_contractor?.contractorRewardCents)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contractor_contractor: {
                      ...config.contractor_contractor,
                      contractorRewardCents: toCents(e.target.value),
                    },
                  })
                }
              />
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(config.combineWithCoupons)}
                onChange={(e) => setConfig({ ...config, combineWithCoupons: e.target.checked })}
              />
              Referral credit can combine with coupons
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(config.combineMultipleCredits)}
                onChange={(e) => setConfig({ ...config, combineMultipleCredits: e.target.checked })}
              />
              Multiple referral credits can combine
            </label>
            <label className="text-xs sm:col-span-2">
              Max referral credit per invoice ($)
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm sm:max-w-xs"
                value={dollarsInput(config.maxCreditPerInvoiceCents)}
                onChange={(e) => setConfig({ ...config, maxCreditPerInvoiceCents: toCents(e.target.value) })}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveConfig()}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            Save rules
          </button>
        </div>
      ) : null}

      {sub !== "overview" && sub !== "rules" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder="Search code, name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
              className="rounded-xl border border-border px-3 py-2 text-sm font-semibold"
            >
              Search
            </button>
          </div>
          <div className="overflow-x-auto rounded-[1.5rem] border border-border bg-card">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Referrer</th>
                  <th className="px-3 py-2">Referred</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Reward</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="px-3 py-2 font-mono text-xs">{r.publicId || r.id}</td>
                    <td className="px-3 py-2">{r.referrerName || "—"}</td>
                    <td className="px-3 py-2">{r.referredName || "—"}</td>
                    <td className="px-3 py-2">{r.statusLabel || r.status}</td>
                    <td className="px-3 py-2">{money(r.referrerRewardCents)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-primary"
                        onClick={() => setSelectedId(r.id)}
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
                {referrals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      No referrals found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {selectedId != null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[1.5rem] border border-border bg-card p-5 shadow-xl">
            <p className="text-sm font-semibold">Referral actions</p>
            <textarea
              className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              rows={3}
              placeholder="Internal note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ["approve_reward", "Approve Reward"],
                  ["hold_reward", "Hold Reward"],
                  ["release_reward", "Release Reward"],
                  ["mark_invalid", "Mark Invalid"],
                  ["reverse_unpaid", "Reverse Unpaid"],
                  ["add_note", "Add Note"],
                ] as const
              ).map(([action, label]) => (
                <button
                  key={action}
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(selectedId, action)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-xl border border-border py-2 text-sm font-semibold"
              onClick={() => setSelectedId(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
