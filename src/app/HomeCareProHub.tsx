import { useEffect, useState } from "react";
import { Loader2, Plus, Users, FileText } from "lucide-react";
import type { ManagedJob, Property } from "./managedJobs";
import { repeatManagedService } from "./managedJobs";
import { useProFeature } from "./ProFeatureProvider";
import ProLockedShell from "./ProLockedShell";
import LockedProBadge from "./LockedProBadge";
import RecurringRescheduleDialog from "./RecurringRescheduleDialog";
import { PREFERRED_PROVIDER_PRIORITY_COPY } from "./preferredProviderCopy";
import {
  clearRecurringHandoff,
  readRecurringHandoff,
} from "./recurringHandoff";
import {
  createRecurringService,
  generateHomeHealthReport,
  getHomeHealthReport,
  getHousehold,
  inviteHouseholdMember,
  listRecurringServices,
  removeHouseholdMember,
  requestRecurringVisit,
  rescheduleRecurringService,
  revokeHouseholdInvite,
  skipRecurringService,
  updateRecurringService,
  type RecurringService,
} from "./homecareProApi";

type HubView = "hub" | "recurring" | "household" | "health-report";

const RECURRENCE_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

function formatVisitDate(iso?: string | null) {
  if (!iso) return "Not scheduled";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

const COMPLETED_STATUSES = new Set(["completed", "closed", "work_completed", "customer_review_pending", "payout_pending"]);

function lastCompletedJobForRecurring(
  jobs: ManagedJob[],
  propertyId: number,
  serviceType: RecurringService["serviceType"]
): ManagedJob | null {
  const needle = serviceType === "recurring_landscaping" ? "landscap" : "clean";
  const matches = jobs.filter((j) => {
    if (j.propertyId !== propertyId) return false;
    const st = String(j.status).toLowerCase();
    if (!COMPLETED_STATUSES.has(st)) return false;
    const cat = String(j.category || "").toLowerCase();
    const title = String(j.title || "").toLowerCase();
    return cat.includes(needle) || title.includes(needle) || Boolean(j.sourceRecurringServiceId);
  });
  return matches.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())[0] || null;
}

export default function HomeCareProHub({
  properties,
  selectedPropertyId,
  jobs = [],
  onOpenPassport,
  onOpenMaintenance,
  onOpenDocuments,
  onOpenJob,
}: {
  properties: Property[];
  selectedPropertyId: number | null;
  jobs?: ManagedJob[];
  onOpenPassport: () => void;
  onOpenMaintenance: () => void;
  onOpenDocuments: () => void;
  onOpenJob?: (jobId: number) => void;
}) {
  const { isPro, entitlementReady, requestFeature, openUpgrade } = useProFeature();
  const [view, setView] = useState<HubView>("hub");
  const [services, setServices] = useState<RecurringService[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [householdMembers, setHouseholdMembers] = useState<
    Array<{ id: number; userId: number; name: string; email: string; role: string }>
  >([]);
  const [invitations, setInvitations] = useState<Array<{ id: number; email: string; role: string }>>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "member" | "manager">("viewer");
  const [healthReport, setHealthReport] = useState<{ generatedAt: string; content: Record<string, unknown> } | null>(null);
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [newServiceType, setNewServiceType] = useState<RecurringService["serviceType"]>("recurring_cleaning");
  const [newRecurrence, setNewRecurrence] = useState<RecurringService["recurrence"]>("biweekly");
  const [rescheduleTarget, setRescheduleTarget] = useState<RecurringService | null>(null);
  const [repeatBusyId, setRepeatBusyId] = useState<number | null>(null);

  const property = properties.find((p) => p.id === selectedPropertyId) || properties[0] || null;
  const propertyServices = property?.id ? services.filter((s) => s.propertyId === property.id) : services;

  useEffect(() => {
    const handoff = readRecurringHandoff();
    if (!handoff || !isPro) return;
    setView("recurring");
    if (handoff.propertyId && properties.some((p) => p.id === handoff.propertyId)) {
      /* property selection is parent-controlled */
    }
    if (handoff.serviceType) setNewServiceType(handoff.serviceType);
    if (handoff.recurrence) setNewRecurrence(handoff.recurrence);
    if (handoff.openAdd !== false) setShowAddRecurring(true);
    clearRecurringHandoff();
  }, [isPro, properties]);

  useEffect(() => {
    if (!isPro || view !== "recurring") return;
    setLoading(true);
    void listRecurringServices().then((r) => {
      setLoading(false);
      if (r.ok && r.services) setServices(r.services);
    });
  }, [isPro, view]);

  useEffect(() => {
    if (!isPro || view !== "household" || !property?.id) return;
    setLoading(true);
    void getHousehold(property.id).then((r) => {
      setLoading(false);
      if (r.ok) {
        setHouseholdMembers(r.members || []);
        setInvitations(r.invitations || []);
      }
    });
  }, [isPro, view, property?.id]);

  useEffect(() => {
    if (!isPro || view !== "health-report" || !property?.id) return;
    setLoading(true);
    void getHomeHealthReport(property.id).then((r) => {
      setLoading(false);
      if (r.ok) setHealthReport(r.report || null);
    });
  }, [isPro, view, property?.id]);

  function openView(next: HubView, feature: Parameters<typeof requestFeature>[0]) {
    if (!requestFeature(feature, "homecare-hub")) return;
    setView(next);
    setError(null);
  }

  if (view === "hub") {
    const cards = [
      { id: "maintenance", label: "Maintenance", desc: "Calendar & upkeep", onClick: onOpenMaintenance, feature: "maintenance_calendar" as const },
      { id: "documents", label: "Documents & Warranties", desc: "Vault & receipts", onClick: onOpenDocuments, feature: "document_vault" as const },
      { id: "recurring", label: "Recurring Services", desc: "Cleaning & landscaping", onClick: () => openView("recurring", "recurring_cleaning"), feature: "recurring_cleaning" as const },
      { id: "health", label: "Home Health Report", desc: "Annual AI overview", onClick: () => openView("health-report", "annual_health_report"), feature: "annual_health_report" as const },
      { id: "household", label: "Household", desc: "Share access", onClick: () => openView("household", "household_sharing"), feature: "household_sharing" as const },
      { id: "passport", label: "Property Passport", desc: "Full home record", onClick: onOpenPassport, feature: "property_aware_ai" as const },
    ];
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              if (!entitlementReady) return;
              if (!isPro) {
                openUpgrade(c.feature, "homecare-hub");
                return;
              }
              c.onClick();
            }}
            className="flex flex-col items-start rounded-[1.25rem] border border-border/70 bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted/20"
          >
            <div className="flex w-full items-center justify-between gap-2">
              <p className="font-semibold">{c.label}</p>
              {!isPro ? <LockedProBadge compact /> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
          </button>
        ))}
      </div>
    );
  }

  if (!isPro) {
    return (
      <ProLockedShell
        feature={
          view === "recurring"
            ? "recurring_cleaning"
            : view === "household"
              ? "household_sharing"
              : "annual_health_report"
        }
        onUnlock={() =>
          openUpgrade(
            view === "recurring" ? "recurring_cleaning" : view === "household" ? "household_sharing" : "annual_health_report",
            "homecare-hub"
          )
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => setView("hub")} className="text-xs font-semibold text-primary">
        ← HomeCare Pro hub
      </button>

      {view === "recurring" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Recurring Services</h3>
            <button
              type="button"
              onClick={() => setShowAddRecurring((v) => !v)}
              className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            A recurring plan stores your schedule and preferences. It does <strong>not</strong> automatically book visits —
            tap <strong>Request Next Visit</strong> when you&apos;re ready for FixBridge to create a real service job.
          </p>
          {showAddRecurring && property ? (
            <form
              className="grid gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!property.id) return;
                setLoading(true);
                void createRecurringService({
                  propertyId: property.id,
                  serviceType: newServiceType,
                  recurrence: newRecurrence,
                }).then((r) => {
                  setLoading(false);
                  if (!r.ok) {
                    setError(r.message || "Could not create service.");
                    return;
                  }
                  setShowAddRecurring(false);
                  if (r.service) setServices((prev) => [...prev, r.service!]);
                });
              }}
            >
              <label className="grid gap-1 text-xs sm:col-span-2">
                Service
                <select className="rounded-lg border border-border px-3 py-2" value={newServiceType} onChange={(e) => setNewServiceType(e.target.value as RecurringService["serviceType"])}>
                  <option value="recurring_cleaning">Recurring cleaning</option>
                  <option value="recurring_landscaping">Recurring landscaping</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs sm:col-span-2">
                Frequency
                <select className="rounded-lg border border-border px-3 py-2" value={newRecurrence} onChange={(e) => setNewRecurrence(e.target.value as RecurringService["recurrence"])}>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <button type="submit" disabled={loading} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white sm:col-span-2">
                {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Save recurring service"}
              </button>
            </form>
          ) : null}
          {propertyServices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">No recurring services are currently scheduled.</p>
              {property ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white"
                    onClick={() => {
                      setNewServiceType("recurring_cleaning");
                      setShowAddRecurring(true);
                    }}
                  >
                    Set Up Cleaning
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-primary/40 px-4 py-2 text-xs font-semibold text-primary"
                    onClick={() => {
                      setNewServiceType("recurring_landscaping");
                      setShowAddRecurring(true);
                    }}
                  >
                    Set Up Landscaping
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            propertyServices.map((s) => {
              const lastJob = property?.id ? lastCompletedJobForRecurring(jobs, property.id, s.serviceType) : null;
              return (
              <article key={s.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2 text-sm">
                    <p className="text-base font-semibold">
                      {s.serviceType === "recurring_cleaning" ? "Cleaning" : "Landscaping"}
                    </p>
                    <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <p>
                        <span className="font-medium text-foreground">Property:</span>{" "}
                        {property?.label || property?.addressLine1 || `Property #${s.propertyId}`}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Frequency:</span>{" "}
                        {RECURRENCE_LABELS[s.recurrence] || s.recurrence}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Next visit:</span>{" "}
                        {formatVisitDate(s.nextServiceDate)}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Provider:</span>{" "}
                        {s.providerName || "Not assigned yet"}
                      </p>
                      {s.providerName ? (
                        <p className="sm:col-span-2 text-[11px] italic">{PREFERRED_PROVIDER_PRIORITY_COPY}</p>
                      ) : null}
                      <p className="sm:col-span-2">
                        <span className="font-medium text-foreground">Status:</span>{" "}
                        <span
                          className={
                            s.status === "paused"
                              ? "font-semibold text-amber-700 dark:text-amber-300"
                              : s.status === "cancelled"
                                ? "font-semibold text-red-600"
                                : "font-semibold text-emerald-700 dark:text-emerald-300"
                          }
                        >
                          {s.status === "paused" ? "Paused" : s.status === "cancelled" ? "Cancelled" : "Active"}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.status === "active" ? (
                      <>
                        <button
                          type="button"
                          className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary"
                          onClick={() => {
                            setLoading(true);
                            void requestRecurringVisit(s.id).then((r) => {
                              setLoading(false);
                              if (!r.ok) setError(r.message || "Could not request visit.");
                              else void listRecurringServices().then((lr) => lr.ok && lr.services && setServices(lr.services));
                            });
                          }}
                        >
                          Request Next Visit
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                          onClick={() => {
                            if (!s.nextServiceDate) return;
                            setLoading(true);
                            void skipRecurringService(s.id, s.nextServiceDate).then((r) => {
                              setLoading(false);
                              if (!r.ok) setError(r.message || "Could not skip.");
                              else if (r.service) setServices((prev) => prev.map((x) => (x.id === s.id ? r.service! : x)));
                            });
                          }}
                        >
                          Skip
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                          onClick={() => setRescheduleTarget(s)}
                        >
                          Reschedule
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                          onClick={() =>
                            void updateRecurringService(s.id, { status: "paused" }).then(
                              (r) => r.ok && setServices((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: "paused" } : x)))
                            )
                          }
                        >
                          Pause
                        </button>
                      </>
                    ) : s.status === "paused" ? (
                      <button
                        type="button"
                        className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary"
                        onClick={() =>
                          void updateRecurringService(s.id, { status: "active" }).then(
                            (r) => r.ok && setServices((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: "active" } : x)))
                          )
                        }
                      >
                        Resume Service
                      </button>
                    ) : null}
                    {s.status !== "cancelled" ? (
                      <button
                        type="button"
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600"
                        onClick={() =>
                          void updateRecurringService(s.id, { status: "cancelled" }).then(
                            (r) => r.ok && setServices((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: "cancelled" } : x)))
                          )
                        }
                      >
                        Cancel
                      </button>
                    ) : null}
                    {lastJob ? (
                      <button
                        type="button"
                        disabled={repeatBusyId === s.id}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                        onClick={() => {
                          setRepeatBusyId(s.id);
                          void repeatManagedService(lastJob.id, true).then((r) => {
                            setRepeatBusyId(null);
                            if (!r.ok) {
                              setError(r.message || "Could not repeat service.");
                              return;
                            }
                            if (r.job?.id) onOpenJob?.(r.job.id);
                          });
                        }}
                      >
                        {repeatBusyId === s.id ? "Repeating…" : "Repeat Last Service"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
            })
          )}
          <RecurringRescheduleDialog
            open={Boolean(rescheduleTarget)}
            serviceLabel={rescheduleTarget?.serviceType === "recurring_landscaping" ? "Landscaping" : "Cleaning"}
            currentDate={rescheduleTarget?.nextServiceDate}
            currentTimeWindow={rescheduleTarget?.preferredTimeWindow}
            busy={loading}
            onClose={() => setRescheduleTarget(null)}
            onConfirm={(newDate, timeWindow) => {
              if (!rescheduleTarget) return;
              setLoading(true);
              void rescheduleRecurringService(rescheduleTarget.id, newDate, timeWindow).then((r) => {
                setLoading(false);
                setRescheduleTarget(null);
                if (!r.ok) setError(r.message || "Could not reschedule.");
                else if (r.service) setServices((prev) => prev.map((x) => (x.id === rescheduleTarget.id ? r.service! : x)));
              });
            }}
          />
        </div>
      )}

      {view === "household" && property && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Users className="h-5 w-5" /> Household
          </h3>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void inviteHouseholdMember(property.id, inviteEmail, inviteRole).then((r) => {
                if (!r.ok) setError(r.message || "Invite failed.");
                else {
                  setInviteEmail("");
                  void getHousehold(property.id).then((h) => {
                    if (h.ok) {
                      setHouseholdMembers(h.members || []);
                      setInvitations(h.invitations || []);
                    }
                  });
                }
              });
            }}
          >
            <input className="min-w-[200px] flex-1 rounded-lg border border-border px-3 py-2 text-sm" placeholder="Email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            <select className="rounded-lg border border-border px-3 py-2 text-sm" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}>
              <option value="viewer">Viewer</option>
              <option value="member">Member</option>
              <option value="manager">Manager</option>
            </select>
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
              Invite
            </button>
          </form>
          {householdMembers.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <span>{m.name || m.email} · {m.role}</span>
              <button type="button" className="text-xs text-red-600" onClick={() => void removeHouseholdMember(property.id, m.id).then(() => setHouseholdMembers((prev) => prev.filter((x) => x.id !== m.id)))}>
                Remove
              </button>
            </div>
          ))}
          {invitations.map((i) => (
            <div key={i.id} className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              <span>Pending: {i.email} · {i.role}</span>
              <button type="button" className="text-xs text-red-600" onClick={() => void revokeHouseholdInvite(i.id).then(() => setInvitations((prev) => prev.filter((x) => x.id !== i.id)))}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {view === "health-report" && property && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <FileText className="h-5 w-5" /> Annual Home Health Report
            </h3>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                void generateHomeHealthReport(property.id).then((r) => {
                  setLoading(false);
                  if (!r.ok) setError(r.message || "Could not generate report.");
                  else if (r.report) setHealthReport(r.report);
                });
              }}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate report"}
            </button>
          </div>
          {healthReport ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm whitespace-pre-wrap">
              <p className="text-xs text-muted-foreground">Generated {new Date(healthReport.generatedAt).toLocaleString()}</p>
              <p className="mt-3">{(healthReport.content as { sections?: { raw?: string } }).sections?.raw || JSON.stringify(healthReport.content, null, 2)}</p>
              <p className="mt-4 text-xs text-muted-foreground">
                AI-generated based on information available in FixBridge. This is not a professional home inspection.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No report generated yet for this property.</p>
          )}
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
