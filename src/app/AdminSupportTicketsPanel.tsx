import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Phone, Search, Ticket } from "lucide-react";
import {
  getAdminSupportTicket,
  listAdminSupportTickets,
  replyAdminSupportTicket,
  updateAdminSupportTicket,
  type SupportTicket,
  type TicketMessage,
  type TicketActivity,
} from "./supportTickets";

const STATUSES = [
  "open",
  "in_review",
  "waiting_for_customer",
  "waiting_for_contractor",
  "waiting_for_admin",
  "resolved",
  "closed",
] as const;

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const ASSIGNEES = ["Unassigned", "Operations", "Billing", "Support"];

function fmtWhen(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function statusBadge(status: string) {
  const s = status.replace(/_/g, " ").toUpperCase();
  const urgent = status.includes("waiting");
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${urgent ? "bg-amber-500/15 text-amber-800" : status === "closed" || status === "resolved" ? "bg-emerald-500/15 text-emerald-700" : "bg-sky-500/15 text-sky-700"}`}>
      {s}
    </span>
  );
}

function priorityBadge(priority: string) {
  const p = (priority || "normal").toUpperCase();
  const cls = p === "URGENT" ? "bg-red-500/15 text-red-700 ring-1 ring-red-500/30" : p === "HIGH" ? "bg-orange-500/15 text-orange-700" : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{p}</span>;
}

export default function AdminSupportTicketsPanel({ initialTicket }: { initialTicket?: string | null }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [activity, setActivity] = useState<TicketActivity[]>([]);
  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadList() {
    setLoading(true);
    setError(null);
    try {
      const r = await listAdminSupportTickets(filter === "all" ? undefined : filter, search.trim() || undefined);
      setTickets(r.tickets || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tickets.");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
  }, [filter]);

  useEffect(() => {
    if (initialTicket) void openTicket(initialTicket);
  }, [initialTicket]);

  async function openTicket(ticketNumber: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await getAdminSupportTicket(ticketNumber);
      setSelected(r.ticket);
      setMessages(r.messages || []);
      setActivity(r.activity || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load ticket.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(fields: Record<string, unknown>) {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await updateAdminSupportTicket(selected.ticketNumber, fields);
      setSelected(r.ticket);
      await openTicket(selected.ticketNumber);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(internal = false) {
    if (!selected) return;
    const text = internal ? internalNote : reply;
    if (!text.trim()) return;
    setBusy(true);
    try {
      await replyAdminSupportTicket(selected.ticketNumber, text.trim(), internal);
      if (internal) setInternalNote("");
      else setReply("");
      await openTicket(selected.ticketNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send reply.");
    } finally {
      setBusy(false);
    }
  }

  const publicMessages = useMemo(() => messages.filter((m) => !m.isInternal), [messages]);
  const internalMessages = useMemo(() => messages.filter((m) => m.isInternal), [messages]);

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage tickets across homeowners and contractors.</p>
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm"
          placeholder="Search tickets, customers, jobs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void loadList()}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {["all", "open", "urgent", "waiting", "resolved", "closed"].map((s) => (
          <button key={s} type="button" onClick={() => setFilter(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${filter === s ? "bg-[#FF4D1C] text-white" : "border border-border bg-card"}`}>
            {s}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <div className="rounded-2xl border border-border bg-card divide-y divide-border max-h-[75vh] overflow-y-auto">
          {loading ? (
            <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
          ) : tickets.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No tickets.</p>
          ) : (
            tickets.map((t) => (
              <button key={t.id} type="button" onClick={() => void openTicket(t.ticketNumber)} className={`w-full px-4 py-3 text-left hover:bg-muted/40 ${selected?.ticketNumber === t.ticketNumber ? "bg-muted/50" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm">{t.ticketNumber}</p>
                  {priorityBadge(t.priority || "normal")}
                </div>
                <p className="text-xs text-muted-foreground">{t.userName || t.userEmail} · {t.userRole}</p>
                <p className="mt-1 truncate text-sm">{t.subject}</p>
                <div className="mt-1 flex items-center gap-2">{statusBadge(t.status)}</div>
              </button>
            ))
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4 min-h-[400px]">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select a ticket to open the workspace.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                  <p className="flex items-center gap-2 text-lg font-semibold"><Ticket size={18} /> {selected.ticketNumber}</p>
                  <p className="text-sm text-muted-foreground">{selected.category || "General"} · {selected.userName} ({selected.userRole})</p>
                  <p className="text-xs text-muted-foreground">{selected.userEmail}{selected.userPhone ? ` · ${selected.userPhone}` : ""}</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {priorityBadge(selected.priority || "normal")}
                  {statusBadge(selected.status)}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 text-xs">
                <label className="grid gap-1">Status
                  <select className="rounded-lg border border-border px-2 py-1.5" value={selected.status} onChange={(e) => void patch({ status: e.target.value })} disabled={busy}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">Priority
                  <select className="rounded-lg border border-border px-2 py-1.5" value={selected.priority || "normal"} onChange={(e) => void patch({ priority: e.target.value })} disabled={busy}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">Assigned To
                  <select className="rounded-lg border border-border px-2 py-1.5" value={selected.assignedTo || "Unassigned"} onChange={(e) => void patch({ assignedTo: e.target.value === "Unassigned" ? null : e.target.value })} disabled={busy}>
                    {ASSIGNEES.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
              </div>

              {selected.relatedJobId ? <p className="text-xs">Related job: #{selected.relatedJobId}</p> : null}

              <div className="space-y-3 max-h-64 overflow-y-auto rounded-xl bg-muted/20 p-3">
                {publicMessages.map((m) => (
                  <div key={m.id} className="rounded-lg bg-card border border-border p-3 text-sm">
                    <p className="text-xs font-semibold capitalize">{m.senderRole}{m.senderName ? ` · ${m.senderName}` : ""}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtWhen(m.createdAt)}</p>
                    <p className="mt-2 whitespace-pre-wrap">{m.message}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <textarea rows={3} className="w-full rounded-xl border border-border px-3 py-2 text-sm" placeholder="Reply to customer or contractor…" value={reply} onChange={(e) => setReply(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => void sendReply(false)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Reply</button>
                  <button type="button" disabled={busy} onClick={() => void patch({ status: "resolved" })} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">Resolve</button>
                  <button type="button" disabled={busy} onClick={() => void patch({ status: "closed" })} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">Close</button>
                  <button type="button" disabled={busy} onClick={() => void patch({ reopen: true })} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">Reopen</button>
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Internal Notes (admin only)</p>
                {internalMessages.map((m) => (
                  <div key={m.id} className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 text-sm">
                    <p className="text-[10px] text-muted-foreground">{m.senderName || "Admin"} · {fmtWhen(m.createdAt)}</p>
                    <p className="mt-1 whitespace-pre-wrap">{m.message}</p>
                  </div>
                ))}
                <textarea rows={2} className="w-full rounded-xl border border-border px-3 py-2 text-sm" placeholder="Staff-only note…" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
                <button type="button" disabled={busy} onClick={() => void sendReply(true)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">Add Internal Note</button>
              </div>

              {activity.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-semibold">Activity timeline</summary>
                  <ul className="mt-2 space-y-1">
                    {activity.map((a) => (
                      <li key={a.id} className="text-muted-foreground">{a.action}{a.newValue ? `: ${a.newValue}` : ""} · {fmtWhen(a.createdAt)}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
