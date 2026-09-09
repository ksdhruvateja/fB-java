import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Save, Shield } from "lucide-react";
import {
  getAdminHomeCareSettings,
  patchAdminHomeCarePricing,
  patchAdminHomeCareSettings,
  type HomeCareAdminConfig,
  type HomeCarePricingConfig,
} from "./homecareConfigApi";
import { ROLE_PRESETS, can, type AdminPermission } from "./adminPermissions";

const fieldClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm transition focus:border-[#FF4D1C] focus:outline-none focus:ring-2 focus:ring-[#FF4D1C]/20";

type SectionId =
  | "features"
  | "pricing"
  | "priority"
  | "recurring"
  | "maintenance"
  | "documents"
  | "household"
  | "report"
  | "upgrade";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "features", label: "Features" },
  { id: "pricing", label: "Coordination Fees" },
  { id: "priority", label: "Priority Routing" },
  { id: "recurring", label: "Recurring Services" },
  { id: "maintenance", label: "Maintenance" },
  { id: "documents", label: "Documents" },
  { id: "household", label: "Household" },
  { id: "report", label: "Home Health Report" },
  { id: "upgrade", label: "Upgrade Experience" },
];

export default function AdminHomeCareProPanel({
  permissions,
  onMessage,
}: {
  permissions: Set<AdminPermission>;
  onMessage?: (msg: string) => void;
}) {
  const canManage = can(permissions, "homecare.manage") || can(permissions, "settings.edit");
  const canEditPricing = can(permissions, "pricing.edit") || canManage;
  const canView = can(permissions, "homecare.view") || can(permissions, "settings.view") || canManage;

  const [section, setSection] = useState<SectionId>("features");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<HomeCareAdminConfig | null>(null);
  const [pricing, setPricing] = useState<HomeCarePricingConfig | null>(null);
  const [confirmImpact, setConfirmImpact] = useState(false);
  const [pendingWarnings, setPendingWarnings] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getAdminHomeCareSettings();
    if (r.ok && r.config) {
      setConfig(r.config);
      setPricing(r.pricing || null);
    } else {
      onMessage?.(r.message || "Could not load HomeCare settings.");
    }
    setLoading(false);
  }, [onMessage]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  const featureRows = useMemo(() => {
    if (!config) return [];
    return Object.entries(config.features).sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [config]);

  async function saveConfig() {
    if (!config || !canManage) return;
    setBusy(true);
    const r = await patchAdminHomeCareSettings(config, confirmImpact);
    setBusy(false);
    if (r.code === "CONFIRMATION_REQUIRED") {
      setPendingWarnings(r.warnings || [r.message || "Confirm impact to save."]);
      return;
    }
    if (!r.ok) {
      onMessage?.(r.message || "Save failed.");
      return;
    }
    setPendingWarnings([]);
    setConfirmImpact(false);
    if (r.config) setConfig(r.config);
    onMessage?.("HomeCare Pro settings saved.");
  }

  async function savePricing() {
    if (!pricing || !canEditPricing) return;
    setBusy(true);
    const r = await patchAdminHomeCarePricing(pricing, confirmImpact);
    setBusy(false);
    if (r.code === "CONFIRMATION_REQUIRED") {
      setPendingWarnings([r.message || "Confirm to apply new coordination fees to future quotes only."]);
      return;
    }
    if (!r.ok) {
      onMessage?.(r.message || "Pricing update failed.");
      return;
    }
    setPendingWarnings([]);
    setConfirmImpact(false);
    if (r.pricing) setPricing(r.pricing);
    onMessage?.("Coordination fees updated (applies to new quotes only).");
  }

  if (!canView) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        <Shield className="mx-auto h-8 w-8 opacity-40" />
        <p className="mt-3">You do not have permission to view HomeCare Pro configuration.</p>
      </div>
    );
  }

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading HomeCare Pro settings…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">HomeCare Pro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure entitlements, operational behavior, and product copy. Changes apply without redeploying code.
          Security rules (auth, ownership, IDOR) remain enforced in code.
        </p>
        {config.updatedAt && (
          <p className="mt-1 text-xs text-muted-foreground">
            Config v{config.configVersion} · Updated {new Date(config.updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {pendingWarnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-200">Confirm high-impact change</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-900/90 dark:text-amber-100/90">
                {pendingWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <label className="mt-3 flex items-center gap-2">
                <input type="checkbox" checked={confirmImpact} onChange={(e) => setConfirmImpact(e.target.checked)} />
                I understand this affects homeowners / future pricing
              </label>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              section === s.id ? "bg-[#FF4D1C] text-white" : "bg-card ring-1 ring-border hover:text-foreground text-muted-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "features" && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Feature entitlement matrix</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Globally disabled features return FEATURE_DISABLED (not an upgrade prompt).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5">Feature</th>
                  <th className="px-4 py-2.5">Free</th>
                  <th className="px-4 py-2.5">Pro</th>
                  <th className="px-4 py-2.5">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {featureRows.map(([id, f]) => (
                  <tr key={id} className="border-b border-border/60">
                    <td className="px-4 py-2.5 font-medium">{f.label}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        disabled={!canManage}
                        checked={f.free}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            features: { ...config.features, [id]: { ...f, free: e.target.checked } },
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        disabled={!canManage}
                        checked={f.pro}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            features: { ...config.features, [id]: { ...f, pro: e.target.checked } },
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        disabled={!canManage}
                        checked={f.enabled}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            features: { ...config.features, [id]: { ...f, enabled: e.target.checked } },
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canManage && (
            <div className="flex justify-end border-t border-border px-4 py-3">
              <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2 text-sm font-medium text-white" disabled={busy} onClick={() => void saveConfig()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save features
              </button>
            </div>
          )}
        </div>
      )}

      {section === "pricing" && pricing && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4 max-w-lg">
          <p className="text-sm text-muted-foreground">
            Applied to new eligible service pricing. Existing accepted quotes and invoices are not changed.
          </p>
          <label className="block text-sm">
            <span className="font-medium">FixBridge Free coordination fee ($)</span>
            <input className={`${fieldClass} mt-1 tabular-nums`} type="number" min={0} step={1} disabled={!canEditPricing} value={pricing.standardCoordinationFee} onChange={(e) => setPricing({ ...pricing, standardCoordinationFee: Number(e.target.value) })} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">HomeCare Pro coordination fee ($)</span>
            <input className={`${fieldClass} mt-1 tabular-nums`} type="number" min={0} step={1} disabled={!canEditPricing} value={pricing.homecareProCoordinationFee} onChange={(e) => setPricing({ ...pricing, homecareProCoordinationFee: Number(e.target.value) })} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Assessment subscription discount (0–1)</span>
            <input className={`${fieldClass} mt-1 tabular-nums`} type="number" min={0} max={1} step={0.01} disabled={!canEditPricing} value={pricing.subscriptionDiscount} onChange={(e) => setPricing({ ...pricing, subscriptionDiscount: Number(e.target.value) })} />
          </label>
          {canEditPricing && (
            <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2 text-sm font-medium text-white" disabled={busy} onClick={() => void savePricing()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save coordination fees
            </button>
          )}
        </div>
      )}

      {section === "priority" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4 max-w-lg">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!canManage} checked={config.priorityRouting.enabled} onChange={(e) => setConfig({ ...config, priorityRouting: { ...config.priorityRouting, enabled: e.target.checked } })} />
            Enable HomeCare Pro priority routing
          </label>
          <label className="block text-sm">
            <span className="font-medium">Priority level</span>
            <select className={`${fieldClass} mt-1`} disabled={!canManage} value={config.priorityRouting.level} onChange={(e) => setConfig({ ...config, priorityRouting: { ...config.priorityRouting, level: e.target.value as HomeCareAdminConfig["priorityRouting"]["level"] } })}>
              <option value="standard">Standard (no queue elevation)</option>
              <option value="elevated">Elevated</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!canManage} checked={config.priorityRouting.showWorkQueueBadge} onChange={(e) => setConfig({ ...config, priorityRouting: { ...config.priorityRouting, showWorkQueueBadge: e.target.checked } })} />
            Show Pro badge in Work Queue
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!canManage} checked={config.priorityRouting.showDispatchBadge} onChange={(e) => setConfig({ ...config, priorityRouting: { ...config.priorityRouting, showDispatchBadge: e.target.checked } })} />
            Show Pro badge in Dispatch
          </label>
          <p className="text-xs text-muted-foreground">Emergency requests always outrank Pro elevation.</p>
          {canManage && (
            <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2 text-sm font-medium text-white" disabled={busy} onClick={() => void saveConfig()}>
              Save priority settings
            </button>
          )}
        </div>
      )}

      {section === "recurring" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4 max-w-lg">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canManage} checked={config.recurring.cleaningEnabled} onChange={(e) => setConfig({ ...config, recurring: { ...config.recurring, cleaningEnabled: e.target.checked } })} /> Recurring cleaning</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canManage} checked={config.recurring.landscapingEnabled} onChange={(e) => setConfig({ ...config, recurring: { ...config.recurring, landscapingEnabled: e.target.checked } })} /> Recurring landscaping</label>
          <p className="text-sm font-medium">Allowed frequencies</p>
          {(["weekly", "biweekly", "monthly"] as const).map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm capitalize">
              <input type="checkbox" disabled={!canManage} checked={config.recurring.frequencies[f]} onChange={(e) => setConfig({ ...config, recurring: { ...config.recurring, frequencies: { ...config.recurring.frequencies, [f]: e.target.checked } } })} />
              {f === "biweekly" ? "Every 2 weeks" : f}
            </label>
          ))}
          <label className="block text-sm">
            <span className="font-medium">Recurring fulfillment</span>
            <select className={`${fieldClass} mt-1`} disabled value="manual">
              <option value="manual">Manual — homeowner requests next visit</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Automatic scheduling: unavailable until a scheduler/worker is configured in production.
            </p>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={config.recurring.remindersEnabled !== false}
              onChange={(e) =>
                setConfig({
                  ...config,
                  recurring: { ...config.recurring, remindersEnabled: e.target.checked },
                })
              }
            />
            Service reminders (in-app + email)
          </label>
          <label className="block text-sm">
            Reminder lead time (hours before service)
            <input
              className={`${fieldClass} mt-1`}
              type="number"
              min={1}
              max={168}
              disabled={!canManage}
              value={Number((config.recurring as { reminderLeadHours?: number }).reminderLeadHours ?? 24)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  recurring: { ...config.recurring, reminderLeadHours: Number(e.target.value) },
                })
              }
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Reminder delivery configured for real scheduled jobs (after Request Next Visit), not theoretical plan dates.
            Production on Netlify uses the scheduled function <code className="text-[11px]">process-service-reminders</code> (every 15 min).
            Local persistent API may use <code className="text-[11px]">ENABLE_SERVICE_REMINDER_POLL=true</code>.
            External cron may call <code className="text-[11px]">POST /api/internal/service-reminders/process</code> with{" "}
            <code className="text-[11px]">X-Service-Reminder-Secret</code>.
          </p>
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-medium">Recurring Service Activation Fee</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={Boolean((config.recurring as { activationFee?: { enabled?: boolean } }).activationFee?.enabled)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    recurring: {
                      ...config.recurring,
                      activationFee: {
                        enabled: e.target.checked,
                        amountCents: Number((config.recurring as { activationFee?: { amountCents?: number } }).activationFee?.amountCents ?? 4900),
                        label: (config.recurring as { activationFee?: { label?: string } }).activationFee?.label || "FixBridge One-Time Activation Fee",
                        description:
                          (config.recurring as { activationFee?: { description?: string } }).activationFee?.description ||
                          "One-time coordination and setup fee for recurring service activation.",
                      },
                    },
                  })
                }
              />
              Enabled
            </label>
            <label className="block text-sm">
              Amount (dollars)
              <input
                className={`${fieldClass} mt-1`}
                disabled={!canManage}
                type="number"
                min={0}
                step="0.01"
                value={(Number((config.recurring as { activationFee?: { amountCents?: number } }).activationFee?.amountCents ?? 4900) / 100).toFixed(2)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    recurring: {
                      ...config.recurring,
                      activationFee: {
                        enabled: (config.recurring as { activationFee?: { enabled?: boolean } }).activationFee?.enabled !== false,
                        amountCents: Math.round(Number(e.target.value || 0) * 100),
                        label: (config.recurring as { activationFee?: { label?: string } }).activationFee?.label || "FixBridge One-Time Activation Fee",
                        description:
                          (config.recurring as { activationFee?: { description?: string } }).activationFee?.description ||
                          "One-time coordination and setup fee for recurring service activation.",
                      },
                    },
                  })
                }
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Paid once when a homeowner submits a recurring service. It does not cover the contractor visit price.
            </p>
          </div>
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-medium">Service visibility</p>
            {(config.serviceCatalog?.offerings || []).map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{item.name}</span>
                <span className="flex gap-3">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={Boolean(item.popular)}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          serviceCatalog: {
                            offerings: (config.serviceCatalog?.offerings || []).map((row) =>
                              row.id === item.id ? { ...row, popular: e.target.checked } : row
                            ),
                          },
                        })
                      }
                    />
                    Popular
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={Boolean(item.subscriptionEligible)}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          serviceCatalog: {
                            offerings: (config.serviceCatalog?.offerings || []).map((row) =>
                              row.id === item.id ? { ...row, subscriptionEligible: e.target.checked } : row
                            ),
                          },
                        })
                      }
                    />
                    Subscription
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={item.active !== false}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          serviceCatalog: {
                            offerings: (config.serviceCatalog?.offerings || []).map((row) =>
                              row.id === item.id ? { ...row, active: e.target.checked } : row
                            ),
                          },
                        })
                      }
                    />
                    Active
                  </label>
                </span>
              </div>
            ))}
          </div>
          {canManage && (
            <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2 text-sm font-medium text-white" disabled={busy} onClick={() => void saveConfig()}>
              Save recurring settings
            </button>
          )}
        </div>
      )}

      {section === "maintenance" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3 max-w-lg text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" disabled={!canManage} checked={Boolean((config.maintenance as { enabled?: boolean }).enabled ?? true)} onChange={(e) => setConfig({ ...config, maintenance: { ...config.maintenance, enabled: e.target.checked } })} /> Maintenance calendar enabled</label>
          <label className="flex items-center gap-2"><input type="checkbox" disabled checked={false} /> Email reminders <span className="text-xs text-muted-foreground">(not configured)</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" disabled checked={false} /> SMS reminders <span className="text-xs text-muted-foreground">(not configured)</span></label>
          {canManage && <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2 text-sm font-medium text-white" disabled={busy} onClick={() => void saveConfig()}>Save maintenance</button>}
        </div>
      )}

      {section === "documents" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3 max-w-lg text-sm">
          <label className="block">Max file size (MB)
            <input className={`${fieldClass} mt-1`} type="number" min={1} max={25} disabled={!canManage} value={Number((config.documents as { maxFileSizeMb?: number }).maxFileSizeMb ?? 4)} onChange={(e) => setConfig({ ...config, documents: { ...config.documents, maxFileSizeMb: Number(e.target.value) } })} />
          </label>
          <label className="block">Max documents per property
            <input className={`${fieldClass} mt-1`} type="number" min={1} max={500} disabled={!canManage} value={Number((config.documents as { maxDocumentsPerProperty?: number }).maxDocumentsPerProperty ?? 100)} onChange={(e) => setConfig({ ...config, documents: { ...config.documents, maxDocumentsPerProperty: Number(e.target.value) } })} />
          </label>
          <p className="text-xs text-muted-foreground">Secure file type allowlist remains enforced in code.</p>
          {canManage && <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2 text-sm font-medium text-white" disabled={busy} onClick={() => void saveConfig()}>Save document limits</button>}
        </div>
      )}

      {section === "household" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3 max-w-lg text-sm">
          <label className="block">Max household members per property
            <input className={`${fieldClass} mt-1`} type="number" min={1} max={20} disabled={!canManage} value={Number((config.household as { maxMembersPerProperty?: number }).maxMembersPerProperty ?? 5)} onChange={(e) => setConfig({ ...config, household: { ...config.household, maxMembersPerProperty: Number(e.target.value) } })} />
          </label>
          <label className="block">Invitation expiration (days)
            <input className={`${fieldClass} mt-1`} type="number" min={1} max={30} disabled={!canManage} value={Number((config.household as { inviteExpirationDays?: number }).inviteExpirationDays ?? 7)} onChange={(e) => setConfig({ ...config, household: { ...config.household, inviteExpirationDays: Number(e.target.value) } })} />
          </label>
          {canManage && <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2 text-sm font-medium text-white" disabled={busy} onClick={() => void saveConfig()}>Save household settings</button>}
        </div>
      )}

      {section === "report" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3 max-w-lg text-sm">
          <label className="block">Minimum days between reports
            <input className={`${fieldClass} mt-1`} type="number" min={30} max={730} disabled={!canManage} value={Number((config.homeHealthReport as { minDaysBetweenReports?: number }).minDaysBetweenReports ?? 365)} onChange={(e) => setConfig({ ...config, homeHealthReport: { ...config.homeHealthReport, minDaysBetweenReports: Number(e.target.value) } })} />
          </label>
          <label className="block">Timing mode
            <select className={`${fieldClass} mt-1`} disabled={!canManage} value={String((config.homeHealthReport as { timingMode?: string }).timingMode ?? "rolling_12_months")} onChange={(e) => setConfig({ ...config, homeHealthReport: { ...config.homeHealthReport, timingMode: e.target.value } })}>
              <option value="rolling_12_months">Rolling interval (days above)</option>
              <option value="subscription_anniversary">Subscription anniversary</option>
              <option value="calendar_year">Calendar year</option>
            </select>
          </label>
          {canManage && <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2 text-sm font-medium text-white" disabled={busy} onClick={() => void saveConfig()}>Save report settings</button>}
        </div>
      )}

      {section === "upgrade" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3 max-w-lg text-sm">
          <label className="block">Headline<input className={`${fieldClass} mt-1`} disabled={!canManage} value={config.upgrade.headline} onChange={(e) => setConfig({ ...config, upgrade: { ...config.upgrade, headline: e.target.value } })} /></label>
          <label className="block">CTA<input className={`${fieldClass} mt-1`} disabled={!canManage} value={config.upgrade.cta} onChange={(e) => setConfig({ ...config, upgrade: { ...config.upgrade, cta: e.target.value } })} /></label>
          <label className="block">Description<textarea className={`${fieldClass} mt-1 min-h-[80px]`} disabled={!canManage} value={config.upgrade.description} onChange={(e) => setConfig({ ...config, upgrade: { ...config.upgrade, description: e.target.value } })} /></label>
          {canManage && <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2 text-sm font-medium text-white" disabled={busy} onClick={() => void saveConfig()}>Save upgrade copy</button>}
        </div>
      )}
    </div>
  );
}
