import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { disputeAdminAction, fetchAdminDisputeDetail, fetchAdminDisputes, type Dispute } from "./disputesApi";
import JobTimelinePanel from "./JobTimelinePanel";

export default function AdminDisputesPanel({
  initialDisputeId,
  onOpenJob,
  onMessage,
}: {
  initialDisputeId?: number | null;
  onOpenJob?: (jobId: number) => void;
  onMessage?: (msg: string) => void;
}) {
  const [list, setList] = useState<Dispute[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(initialDisputeId || null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchAdminDisputeDetail>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionReason, setActionReason] = useState("");

  useEffect(() => {
    void loadList();
  }, []);

  useEffect(() => {
    if (initialDisputeId) setSelectedId(initialDisputeId);
  }, [initialDisputeId]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId]);

  async function loadList() {
    setLoading(true);
    try {
      const r = await fetchAdminDisputes();
      setList(r.disputes || []);
    } catch (e) {
      onMessage?.(e instanceof Error ? e.message : "Could not load disputes.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: number) {
    try {
      const r = await fetchAdminDisputeDetail(id);
      setDetail(r);
    } catch (e) {
      onMessage?.(e instanceof Error ? e.message : "Could not load dispute.");
    }
  }

  async function runAction(action: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await disputeAdminAction(selectedId, action, actionReason);
      setActionReason("");
      await loadDetail(selectedId);
      await loadList();
      onMessage?.("Dispute updated.");
    } catch (e) {
      onMessage?.(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  const d = detail?.dispute;
  const payoutAlreadyPaid = Boolean(detail?.payoutState?.alreadyPaid);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-2xl border border-border bg-card p-3">
        <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open disputes</p>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : list.length === 0 ? (
          <p className="px-2 py-6 text-sm text-muted-foreground">No open disputes.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {list.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                    selectedId === item.id ? "bg-primary/10 font-semibold" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    FB-{item.jobId} · {item.category?.replace(/_/g, " ") || "Dispute"}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.status}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="space-y-4">
        {!selectedId || !d ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Select a dispute to review job context, payout state, and communications.
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Dispute #{d.id}</h2>
                  <p className="text-sm text-muted-foreground">
                    Job FB-{d.jobId} · {String(d.status).replace(/_/g, " ")}
                  </p>
                </div>
                {d.jobId ? (
                  <button
                    type="button"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                    onClick={() => onOpenJob?.(Number(d.jobId))}
                  >
                    Open job
                  </button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Info label="Homeowner" value={String(d.homeownerName || "—")} />
                <Info label="Contractor" value={String(d.contractorName || "—")} />
                <Info label="Technician" value={String(d.technicianName || "—")} />
                <Info label="Category" value={String(d.category || "—").replace(/_/g, " ")} />
              </div>

              <div className="mt-4 rounded-xl bg-muted/30 p-3 text-sm">
                <p className="font-medium">Homeowner complaint</p>
                <p className="mt-1 text-muted-foreground">{d.description || d.reason || "—"}</p>
                {d.preferredResolution ? (
                  <p className="mt-2 text-xs">
                    <span className="font-medium">Preferred resolution:</span> {d.preferredResolution}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 rounded-xl border border-border p-3 text-sm">
                <p className="font-medium">Contractor payout</p>
                {payoutAlreadyPaid ? (
                  <p className="mt-1 font-semibold text-amber-700 dark:text-amber-300">Contractor already paid</p>
                ) : (
                  <p className="mt-1 text-muted-foreground">
                    {detail?.payoutState?.payouts?.[0]?.status
                      ? `Status: ${String(detail.payoutState.payouts[0].status)}`
                      : "No payout on hold yet"}
                  </p>
                )}
              </div>
            </div>

            {d.jobId ? (
              <JobTimelinePanel jobId={Number(d.jobId)} />
            ) : null}

            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Actions</p>
              <textarea
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                rows={2}
                placeholder="Reason / notes for audit trail"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["request_homeowner_info", "Request homeowner info"],
                  ["request_contractor_info", "Request contractor info"],
                  ["approve_rework", "Approve rework"],
                  ["release_payout", "Release payout"],
                  ["close_dispute", "Close dispute"],
                ].map(([action, label]) => (
                  <button
                    key={action}
                    type="button"
                    disabled={busy}
                    onClick={() => void runAction(action)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 disabled:opacity-60"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {detail?.events?.length ? (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-semibold">Audit trail</p>
                <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {detail.events.map((ev) => (
                    <li key={String(ev.id)} className="border-b border-border/50 pb-2">
                      <span className="font-medium text-foreground">{String(ev.action)}</span>
                      {ev.actorName ? ` · ${String(ev.actorName)}` : ""}
                      {ev.reason ? ` — ${String(ev.reason)}` : ""}
                      <span className="ml-2 opacity-70">{ev.createdAt ? new Date(String(ev.createdAt)).toLocaleString() : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
