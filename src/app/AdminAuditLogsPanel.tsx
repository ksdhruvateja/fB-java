import { useEffect, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { getStoredToken } from "./auth";
import { relativeTime } from "./adminOpsHelpers";

type AuditRow = {
  id: number;
  actorUserId?: number | null;
  actorName?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  detail?: Record<string, unknown> | null;
  createdAt?: string;
  source?: string;
};

export default function AdminAuditLogsPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = getStoredToken();
        const res = await fetch("/api/admin/audit-logs?limit=100", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!data.ok) {
          setError(data.message || "Could not load audit logs.");
          setRows([]);
        } else {
          setRows(data.logs || []);
        }
      } catch {
        setError("Network error loading audit logs.");
      } finally {
        setLoading(false);
      }
    })();
  }, [reloadKey]);

  const filtered = rows.filter((r) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return `${r.action} ${r.entityType} ${r.entityId} ${r.actorName} ${r.actorEmail} ${JSON.stringify(r.detail || {})}`
      .toLowerCase()
      .includes(needle);
  });

  return (
    <section className="space-y-4">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <ScrollText className="h-3.5 w-3.5" /> Administration
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Audit logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Immutable record of sensitive admin actions. Staff cannot modify these entries.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="min-w-[200px] flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-[#FF4D1C]/50 focus:ring-2 focus:ring-[#FF4D1C]/15"
          placeholder="Filter by action, actor, entity…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted/40"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading audit trail…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          No audit events yet. Approvals, invites, payouts, and pricing changes will appear here.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {filtered.map((r) => (
            <li key={r.id} className="px-4 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">
                  {r.action.replace(/_/g, " ")}
                  {r.source === "payout" ? (
                    <span className="ml-2 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-700 dark:text-violet-300">
                      payout
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">{relativeTime(r.createdAt)}</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {r.actorName || r.actorEmail || (r.actorUserId ? `User #${r.actorUserId}` : "System")}
                {r.entityType ? ` · ${r.entityType}` : ""}
                {r.entityId ? ` #${r.entityId}` : ""}
              </p>
              {r.detail && Object.keys(r.detail).length > 0 && (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
                  {JSON.stringify(r.detail, null, 0)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
