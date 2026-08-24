import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createAdminSubscriptionPlan,
  deleteAdminSubscriptionPlan,
  listAdminSubscriptionPlans,
  updateAdminSubscriptionPlan,
  type ManagedSubscriptionPlan,
} from "./subscriptionPlansApi";

const emptyForm = (): ManagedSubscriptionPlan => ({
  code: "",
  name: "",
  amount: 0,
  interval: "month",
  theme: "light",
  sortOrder: 0,
  features: [
    { label: "Service request tracking", included: true },
    { label: "Property health score", included: false },
    { label: "Live chat & support", included: true },
    { label: "AI DIY Action Plans", included: false },
  ],
  highlight: false,
  unlocksDiy: false,
  trialDays: 0,
  active: true,
  ctaLabel: "Select",
  description: "",
});

export default function AdminSubscriptionPlansPanel({ readOnly }: { readOnly?: boolean }) {
  const [plans, setPlans] = useState<ManagedSubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ManagedSubscriptionPlan>(emptyForm());

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const r = await listAdminSubscriptionPlans();
      setPlans(r.plans || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load plans.");
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const sorted = useMemo(
    () => [...plans].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.id || 0) - (b.id || 0)),
    [plans]
  );

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm(), sortOrder: (plans.length + 1) * 10 });
    setFormOpen(true);
    setMessage(null);
  }

  function openEdit(plan: ManagedSubscriptionPlan) {
    setEditingId(plan.id ?? null);
    setForm({
      ...plan,
      features: (plan.features || []).map((f) => ({ ...f })),
      description: plan.description || "",
    });
    setFormOpen(true);
    setMessage(null);
  }

  function updateFeature(idx: number, patch: Partial<{ label: string; included: boolean }>) {
    setForm((prev) => {
      const features = [...(prev.features || [])];
      features[idx] = { ...features[idx], ...patch };
      return { ...prev, features };
    });
  }

  function addFeature() {
    setForm((prev) => ({
      ...prev,
      features: [...(prev.features || []), { label: "New feature", included: true }],
    }));
  }

  function removeFeature(idx: number) {
    setForm((prev) => ({
      ...prev,
      features: (prev.features || []).filter((_, i) => i !== idx),
    }));
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        code: form.code,
        name: form.name,
        amount: Number(form.amount),
        interval: form.interval,
        theme: form.theme,
        sortOrder: Number(form.sortOrder) || 0,
        features: form.features,
        highlight: form.highlight,
        unlocksDiy: form.unlocksDiy,
        trialDays: Number(form.trialDays) || 0,
        active: form.active,
        ctaLabel: form.ctaLabel || "Select",
        description: form.description || null,
      };
      if (editingId != null) {
        await updateAdminSubscriptionPlan(editingId, payload);
        setMessage("Plan updated — homeowner Go Pro will show the new details.");
      } else {
        await createAdminSubscriptionPlan(payload);
        setMessage("Plan created — it now appears on the homeowner Go Pro page.");
      }
      setFormOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save plan.");
    } finally {
      setBusy(false);
    }
  }

  async function removePlan(plan: ManagedSubscriptionPlan) {
    if (readOnly || plan.id == null) return;
    if (!confirm(`Delete plan "${plan.name}"? Homeowners will no longer see it.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAdminSubscriptionPlan(plan.id);
      setMessage(`Deleted ${plan.name}.`);
      if (editingId === plan.id) setFormOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete plan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pro Subscription Plans</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Add or edit the plans shown on the homeowner Go Pro page. Price, name, features, and DIY unlock
            update live for homeowners.
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus size={16} /> Add plan
          </button>
        )}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-teal-700 dark:text-teal-400">{message}</p> : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Theme</th>
                <th className="px-4 py-3">Flags</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No plans yet. Add Personal, Pro, and HomeCare (or your own tiers).
                  </td>
                </tr>
              ) : (
                sorted.map((p) => (
                  <tr key={p.id} className={!p.active ? "opacity-50" : ""}>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{p.sortOrder}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{p.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{p.code}</p>
                    </td>
                    <td className="px-4 py-3">
                      ${Number(p.amount).toFixed(2)}
                      <span className="text-muted-foreground">/{p.interval === "year" ? "yr" : "mo"}</span>
                    </td>
                    <td className="px-4 py-3 capitalize">{p.theme}</td>
                    <td className="px-4 py-3 text-xs">
                      {p.highlight ? <span className="mr-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-700">Featured</span> : null}
                      {p.unlocksDiy ? <span className="mr-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700">DIY</span> : null}
                      {p.trialDays > 0 ? (
                        <span className="mr-1 rounded bg-teal-500/10 px-1.5 py-0.5 text-teal-700">{p.trialDays}d trial</span>
                      ) : null}
                      {!p.active ? <span className="rounded bg-slate-500/10 px-1.5 py-0.5">Inactive</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      {!readOnly && (
                        <button
                          type="button"
                          disabled={busy}
                          className="ml-2 inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-600 hover:bg-red-500/5"
                          onClick={() => void removePlan(p)}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <form onSubmit={(e) => void savePlan(e)} className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{editingId != null ? "Edit plan" : "New plan"}</h2>
            <button type="button" className="text-sm text-muted-foreground hover:underline" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Name</span>
              <input
                required
                className="rounded-xl border border-border bg-background px-3 py-2"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Pro"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Code</span>
              <input
                required
                className="rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="pro_membership"
                disabled={editingId != null}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Monthly price ($)</span>
              <input
                required
                type="number"
                min={0}
                step="0.01"
                className="rounded-xl border border-border bg-background px-3 py-2"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Interval</span>
              <select
                className="rounded-xl border border-border bg-background px-3 py-2"
                value={form.interval}
                onChange={(e) => setForm({ ...form, interval: e.target.value })}
              >
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Card theme</span>
              <select
                className="rounded-xl border border-border bg-background px-3 py-2"
                value={form.theme}
                onChange={(e) => setForm({ ...form, theme: e.target.value })}
              >
                <option value="light">Light (orange accents)</option>
                <option value="blue">Blue (featured)</option>
                <option value="plum">Plum</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Sort order</span>
              <input
                type="number"
                className="rounded-xl border border-border bg-background px-3 py-2"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Trial days</span>
              <input
                type="number"
                min={0}
                max={90}
                className="rounded-xl border border-border bg-background px-3 py-2"
                value={form.trialDays}
                onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Button label</span>
              <input
                className="rounded-xl border border-border bg-background px-3 py-2"
                value={form.ctaLabel}
                onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.highlight}
                onChange={(e) => setForm({ ...form, highlight: e.target.checked })}
              />
              Featured card
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.unlocksDiy}
                onChange={(e) => setForm({ ...form, unlocksDiy: e.target.checked })}
              />
              Unlocks DIY Action Plans
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Active (shown to homeowners)
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Features</p>
              {!readOnly && (
                <button type="button" onClick={addFeature} className="text-xs font-semibold text-[#FF4D1C]">
                  + Add feature
                </button>
              )}
            </div>
            {(form.features || []).map((f, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <input
                  className="min-w-[200px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={f.label}
                  onChange={(e) => updateFeature(idx, { label: e.target.value })}
                />
                <label className="inline-flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={f.included}
                    onChange={(e) => updateFeature(idx, { included: e.target.checked })}
                  />
                  Included
                </label>
                {!readOnly && (
                  <button type="button" className="text-xs text-red-600" onClick={() => removeFeature(idx)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {!readOnly && (
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId != null ? "Save changes" : "Create plan"}
            </button>
          )}
        </form>
      )}
    </section>
  );
}
