import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Ticket } from "lucide-react";
import type { AuthUser } from "./auth";
import {
  createSupportTicket,
  getMySupportTicket,
  listMySupportTickets,
  replySupportTicket,
  type SupportTicket,
  type TicketMessage,
} from "./supportTickets";

const CATEGORIES = [
  "Job Issue",
  "Homeowner Issue",
  "Quote Question",
  "Payment / Payout",
  "Account",
  "Compliance",
  "Technical Issue",
  "Schedule",
  "Other",
];

function fmtWhen(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function ContractorSupportPanel({ user }: { user: AuthUser }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");

  useEffect(() => {
    void listMySupportTickets(filter === "all" ? undefined : filter)
      .then((r) => setTickets(r.tickets || []))
      .catch(() => setTickets([]));
  }, [filter, busy]);

  useEffect(() => {
    if (!selected) {
      setThread([]);
      return;
    }
    void getMySupportTicket(selected)
      .then((r) => setThread(r.messages || []))
      .catch(() => setThread([]));
  }, [selected]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await createSupportTicket({
        channel: "help",
        subject: subject.trim(),
        message: message.trim(),
        category,
        priority: "normal",
      });
      setSelected(r.ticket.ticketNumber);
      setSubject("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create ticket.");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    try {
      await replySupportTicket(selected, reply.trim());
      setReply("");
      const r = await getMySupportTicket(selected);
      setThread(r.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">My Support Tickets</h1>
        <p className="text-sm text-muted-foreground mt-1">Create tickets and follow up with FixBridge support.</p>
      </div>

      <form onSubmit={(e) => void submit(e)} className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <p className="text-sm font-semibold">Create Support Ticket</p>
        <select className="w-full rounded-xl border border-border px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="w-full rounded-xl border border-border px-3 py-2 text-sm" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        <textarea rows={4} className="w-full rounded-xl border border-border px-3 py-2 text-sm" placeholder="Describe the issue…" value={message} onChange={(e) => setMessage(e.target.value)} required />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare size={16} />} Submit ticket
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {["all", "open", "resolved", "closed"].map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${filter === f ? "bg-primary text-white" : "border border-border"}`}>{f}</button>
        ))}
      </div>

      <div className="space-y-2">
        {tickets.map((t) => (
          <button key={t.id} type="button" onClick={() => setSelected(t.ticketNumber)} className={`w-full rounded-2xl border p-4 text-left ${selected === t.ticketNumber ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
            <p className="font-semibold flex items-center gap-2"><Ticket size={14} /> {t.ticketNumber}</p>
            <p className="text-sm mt-1">{t.subject}</p>
            <p className="text-xs text-muted-foreground mt-1 capitalize">{t.status.replace(/_/g, " ")} · Updated {fmtWhen(t.updatedAt)}</p>
          </button>
        ))}
      </div>

      {selected && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <p className="font-semibold">Conversation — {selected}</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {thread.map((m) => (
              <div key={m.id} className="rounded-xl bg-muted/30 p-3 text-sm">
                <p className="text-xs font-semibold capitalize">{m.senderRole}{m.senderName ? ` · ${m.senderName}` : ""}</p>
                <p className="text-[10px] text-muted-foreground">{fmtWhen(m.createdAt)}</p>
                <p className="mt-1 whitespace-pre-wrap">{m.message}</p>
              </div>
            ))}
          </div>
          <textarea rows={2} className="w-full rounded-xl border border-border px-3 py-2 text-sm" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Your reply…" />
          <button type="button" disabled={busy} onClick={() => void sendReply()} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">Send reply</button>
        </div>
      )}
    </section>
  );
}
