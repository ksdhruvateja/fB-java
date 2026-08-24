import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Sparkles,
  Ticket,
} from "lucide-react";
import type { AuthUser } from "./auth";
import { brand } from "../config/brand";
import type { ManagedJob, Property } from "./managedJobs";
import {
  buildLocalContextPreview,
  createSupportTicket,
  getMySupportTicket,
  listMySupportTickets,
  type SupportChannel,
  type SupportTicket,
  type TicketDelivery,
} from "./supportTickets";

const ASSISTANT_PROMPTS = [
  "Help me understand my home health score",
  "What maintenance should I schedule next?",
  "Explain my latest quote",
  "How do I request a pro for an urgent issue?",
];

function fmtWhen(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function channelLabel(channel: SupportChannel) {
  return channel === "assistant" ? "FixBridge Assistant" : "Help & Support";
}

function DeliveryCard({ delivery }: { delivery: TicketDelivery }) {
  const [open, setOpen] = useState(delivery.recipientRole === "homeowner" && delivery.deliveryType === "email");
  const Icon = delivery.deliveryType === "sms" ? Phone : Mail;
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <p className="text-sm font-semibold capitalize">
            {delivery.deliveryType} · {delivery.recipientRole}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            To: {delivery.recipientAddress} · {fmtWhen(delivery.sentAt)}
          </p>
        </span>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border bg-muted/20 px-4 py-3">
          {delivery.subject ? (
            <p className="text-xs font-semibold text-muted-foreground">Subject: {delivery.subject}</p>
          ) : null}
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground">
            {delivery.body}
          </pre>
          <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            Status: {delivery.status} · No external mail provider — stored in FixBridge for your records
          </p>
        </div>
      )}
    </div>
  );
}

export default function HomeownerSupportPanel({
  channel,
  user,
  properties,
  jobs,
}: {
  channel: SupportChannel;
  user: AuthUser;
  properties: Property[];
  jobs: ManagedJob[];
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [relatedJobId, setRelatedJobId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<TicketDelivery[]>([]);
  const [lastSubmitted, setLastSubmitted] = useState<{
    ticketNumber: string;
    deliveries: TicketDelivery[];
  } | null>(null);

  const previewContext = useMemo(
    () => buildLocalContextPreview(user, properties, jobs),
    [user, properties, jobs]
  );

  const title = channel === "assistant" ? "FixBridge Assistant" : "Help & Support";
  const blurb =
    channel === "assistant"
      ? "Ask about DIY, scheduling, quotes, or home health. We attach your profile details and send you an email confirmation with ticket ID."
      : "Contact our team. Your profile, properties, and recent jobs are included automatically. Email and SMS confirmations are logged here — no third-party apps.";

  useEffect(() => {
    void listMySupportTickets()
      .then((r) => {
        const mine = (r.tickets || []).filter((t) => t.channel === channel);
        setTickets(mine);
      })
      .catch(() => setTickets([]));
  }, [channel, lastSubmitted?.ticketNumber]);

  useEffect(() => {
    if (!selectedTicket) {
      setDeliveries([]);
      return;
    }
    void getMySupportTicket(selectedTicket)
      .then((r) => setDeliveries(r.deliveries || []))
      .catch(() => setDeliveries([]));
  }, [selectedTicket]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setError("Enter a subject and message.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await createSupportTicket({
        channel,
        subject: subject.trim(),
        message: message.trim(),
        relatedJobId: relatedJobId === "" ? null : Number(relatedJobId),
      });
      setLastSubmitted({
        ticketNumber: r.ticket.ticketNumber,
        deliveries: r.deliveries || [],
      });
      setSelectedTicket(r.ticket.ticketNumber);
      setDeliveries(r.deliveries || []);
      setSubject("");
      setMessage("");
      setRelatedJobId("");
      const listed = await listMySupportTickets();
      setTickets((listed.tickets || []).filter((t) => t.channel === channel));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-5 space-y-3">
        <p className="text-sm font-semibold">Included with your request</p>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li>Profile: {user.name} · {user.email}{user.phone ? ` · ${user.phone}` : ""}</li>
          <li>{properties.length} propert{properties.length === 1 ? "y" : "ies"} on file</li>
          <li>{jobs.length} service request{jobs.length === 1 ? "" : "s"} in account</li>
          <li>Email confirmation to <span className="font-medium text-foreground">{user.email}</span></li>
          {user.phone ? (
            <li>SMS confirmation to <span className="font-medium text-foreground">{user.phone}</span></li>
          ) : (
            <li className="text-amber-700 dark:text-amber-300">Add a phone number in Profile to receive SMS confirmation</li>
          )}
          <li>Admin alert with ticket ID at {brand.supportEmail}</li>
        </ul>
      </div>

      {lastSubmitted && (
        <div className="rounded-[1.5rem] border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 size={18} /> Ticket created — {lastSubmitted.ticketNumber}
          </p>
          <p className="text-xs text-muted-foreground">
            Email confirmation sent to {user.email}.
            {user.phone ? ` SMS logged for ${user.phone}.` : ""} Admin notified.
          </p>
          <div className="space-y-2">
            {lastSubmitted.deliveries.map((d) => (
              <DeliveryCard key={d.id} delivery={d} />
            ))}
          </div>
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="rounded-[1.5rem] border border-border bg-card p-5 space-y-4">
        {channel === "assistant" && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick prompts</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ASSISTANT_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    setSubject(prompt);
                    if (!message.trim()) setMessage(prompt);
                  }}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:border-primary/40"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Subject</span>
          <input
            className="rounded-xl border border-border bg-background px-3 py-2.5"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={channel === "assistant" ? "What do you need help with?" : "Brief summary"}
            required
          />
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Message</span>
          <textarea
            rows={5}
            className="rounded-xl border border-border bg-background px-3 py-2.5"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe your question or issue in detail…"
            required
          />
        </label>

        {jobs.length > 0 && (
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Related job (optional)</span>
            <select
              className="rounded-xl border border-border bg-background px-3 py-2.5"
              value={relatedJobId}
              onChange={(e) => setRelatedJobId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">None</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.bookingId || `Job #${j.id}`} — {j.title || j.category || j.status}
                </option>
              ))}
            </select>
          </label>
        )}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : channel === "assistant" ? <Sparkles size={16} /> : <MessageSquare size={16} />}
          Submit & send confirmation
        </button>
      </form>

      {tickets.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Ticket size={16} /> Your {channel === "assistant" ? "assistant" : "support"} tickets
          </p>
          <ul className="space-y-2">
            {tickets.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelectedTicket(selectedTicket === t.ticketNumber ? null : t.ticketNumber)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedTicket === t.ticketNumber ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <p className="font-semibold text-sm">{t.ticketNumber}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.subject}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{fmtWhen(t.createdAt)} · {t.status}</p>
                </button>
                {selectedTicket === t.ticketNumber && deliveries.length > 0 && (
                  <div className="mt-2 space-y-2 pl-1">
                    {deliveries.map((d) => (
                      <DeliveryCard key={d.id} delivery={d} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="rounded-2xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-semibold text-foreground">Preview: data attached to your next request</summary>
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(previewContext, null, 2)}</pre>
      </details>
    </section>
  );
}
