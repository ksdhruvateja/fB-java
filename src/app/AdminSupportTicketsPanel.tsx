import { useEffect, useState } from "react";
import { Loader2, Mail, Phone, Ticket } from "lucide-react";
import {
  getAdminSupportTicket,
  listAdminSupportTickets,
  updateAdminSupportTicketStatus,
  type SupportTicket,
  type TicketDelivery,
} from "./supportTickets";

function fmtWhen(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

export default function AdminSupportTicketsPanel() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [deliveries, setDeliveries] = useState<TicketDelivery[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadList() {
    setLoading(true);
    setError(null);
    try {
      const r = await listAdminSupportTickets(filter === "all" ? undefined : filter);
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

  async function openTicket(ticketNumber: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await getAdminSupportTicket(ticketNumber);
      setSelected(r.ticket);
      setDeliveries(r.deliveries || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load ticket.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: string) {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await updateAdminSupportTicketStatus(selected.ticketNumber, status);
      setSelected(r.ticket);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Support Tickets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Homeowner Help & Assistant requests with ticket IDs, email copies, and SMS logs — all stored in FixBridge (no external mail/SMS apps).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {["all", ...STATUSES].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
              filter === s ? "bg-[#FF4D1C] text-white" : "border border-border bg-card"
            }`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-border bg-card divide-y divide-border max-h-[70vh] overflow-y-auto">
          {loading ? (
            <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tickets…
            </p>
          ) : tickets.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No tickets in this view.</p>
          ) : (
            tickets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => void openTicket(t.ticketNumber)}
                className={`w-full px-4 py-3 text-left hover:bg-muted/40 ${
                  selected?.ticketNumber === t.ticketNumber ? "bg-muted/50" : ""
                }`}
              >
                <p className="font-semibold text-sm">{t.ticketNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {t.channel} · {t.userName || t.userEmail} · {fmtWhen(t.createdAt)}
                </p>
                <p className="mt-1 truncate text-sm">{t.subject}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{t.status}</p>
              </button>
            ))
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4 min-h-[320px]">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select a ticket to view message, context, and delivery log.</p>
          ) : busy && !deliveries.length ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-lg font-semibold">
                    <Ticket size={18} /> {selected.ticketNumber}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selected.userName} · {selected.userEmail}
                    {selected.userPhone ? ` · ${selected.userPhone}` : ""}
                  </p>
                </div>
                <select
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-semibold"
                  value={selected.status}
                  onChange={(e) => void changeStatus(e.target.value)}
                  disabled={busy}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl bg-muted/30 p-3 text-sm">
                <p className="font-semibold">{selected.subject}</p>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{selected.message}</p>
              </div>

              {selected.context ? (
                <details className="text-xs">
                  <summary className="cursor-pointer font-semibold">Attached profile & job context</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/20 p-2">
                    {JSON.stringify(selected.context, null, 2)}
                  </pre>
                </details>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery log</p>
                {deliveries.map((d) => (
                  <div key={d.id} className="rounded-xl border border-border p-3 text-xs">
                    <p className="flex items-center gap-1.5 font-semibold capitalize">
                      {d.deliveryType === "sms" ? <Phone size={12} /> : <Mail size={12} />}
                      {d.deliveryType} → {d.recipientRole} ({d.recipientAddress})
                    </p>
                    <p className="text-muted-foreground mt-0.5">{fmtWhen(d.sentAt)} · {d.status}</p>
                    {d.subject ? <p className="mt-1 font-medium">{d.subject}</p> : null}
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-muted-foreground">{d.body}</pre>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
