import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquare, Send, CheckCircle2, XCircle } from "lucide-react";
import {
  formatMoney,
  listNegotiations,
  requestNegotiation,
  respondNegotiation,
  finalizeEstimate,
  type Negotiation,
  type Proposal,
} from "./managedJobs";

export default function QuoteNegotiationPanel({
  jobId,
  proposal,
  role,
  onChanged,
  onMessage,
}: {
  jobId: number;
  proposal: Proposal;
  role: "homeowner" | "admin";
  onChanged?: () => void | Promise<void>;
  onMessage?: (message: string) => void;
}) {
  const [items, setItems] = useState<Negotiation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [scope, setScope] = useState("");
  const [message, setMessage] = useState("");
  const [counterAmount, setCounterAmount] = useState("");
  const [adminMessage, setAdminMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setItems([]);

    void listNegotiations(jobId)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setItems(
            (r.negotiations || []).filter(
              (n) => Number(n.jobId) === Number(jobId) && Number(n.proposalId) === Number(proposal.id),
            ),
          );
        } else {
          setItems([]);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, proposal.id]);

  // The API returns newest negotiation first. Keep the newest round as the source of truth.
  const latest = items[0];
  const pending = items.find((n) => n.action === "pending");
  const homeownerRequestsUsed = items.length;
  const adminCountersUsed = items.filter((n) => n.adminAmount != null).length;
  const maxNegotiations = 2;
  const maxAdminCounters = 2;
  const homeownerNegotiationsRemaining = Math.max(0, maxNegotiations - homeownerRequestsUsed);
  const adminCountersRemaining = Math.max(0, maxAdminCounters - adminCountersUsed);
  const canRequest = role === "homeowner" && ["sent", "viewed"].includes(String(proposal.status)) && !pending && homeownerNegotiationsRemaining > 0;
  const canFinalize = role === "admin" && proposal.status === "sent" && !pending;

  async function load() {
    const r = await listNegotiations(jobId);
    if (!r.ok) {
      setItems([]);
      return;
    }
    setItems(
      (r.negotiations || []).filter(
        (n) => Number(n.jobId) === Number(jobId) && Number(n.proposalId) === Number(proposal.id),
      ),
    );
  }

  async function homeownerSubmit() {
    setBusy(true);
    try {
      const r = await requestNegotiation(jobId, {
        proposalId: proposal.id,
        requestedAmount: amount.trim() ? Number(amount) : null,
        requestedScope: scope.trim(),
        message: message.trim(),
      });
      if (!r.ok) { onMessage?.(r.message || "Could not submit negotiation."); return; }
      setAmount(""); setScope(""); setMessage("");
      await load(); await onChanged?.();
    } finally { setBusy(false); }
  }

  async function adminRespond(action: "accept" | "counter" | "decline" | "finalize") {
    if (!latest && action === "finalize") {
      setBusy(true);
      try {
        const r = await finalizeEstimate(jobId);
        if (!r.ok) onMessage?.(r.message || "Could not finalize estimate.");
        else await onChanged?.();
      } finally { setBusy(false); }
      return;
    }
    if (!latest) return;
    setBusy(true);
    try {
      const r = await respondNegotiation(jobId, latest.id, {
        action,
        counterAmount: action === "counter" ? Number(counterAmount) : undefined,
        message: adminMessage.trim() || undefined,
      });
      if (!r.ok) { onMessage?.(r.message || "Could not update negotiation."); return; }
      setCounterAmount(""); setAdminMessage("");
      await load(); await onChanged?.();
    } finally { setBusy(false); }
  }

  const heading = role === "homeowner" ? "Negotiate this estimate" : "Homeowner negotiation";
  const statusText = useMemo(() => {
    if (!latest) return "No negotiation has been requested.";
    if (latest.action === "pending") return "Waiting for Admin response.";
    if (latest.action === "countered") return `Admin counter: ${formatMoney(latest.adminAmount || 0)}`;
    if (latest.action === "accepted") return `Admin accepted the requested amount${latest.adminAmount != null ? `: ${formatMoney(latest.adminAmount)}` : "."}`;
    if (latest.action === "declined") return "Admin declined the requested change. The original estimate remains available.";
    return "Negotiation updated.";
  }, [latest]);

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading negotiation…</div>;

  return (
    <section className="space-y-3 rounded-2xl border border-primary/20 bg-primary/[0.03] p-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <div>
          <p className="text-sm font-bold">{heading}</p>
          <p className="text-xs text-muted-foreground">Negotiation must be resolved before homeowner approval.</p>
        </div>
      </div>

      {latest ? (
        <div className="rounded-xl border border-border bg-background p-3 text-sm">
          <p className="font-semibold">{statusText}</p>
          {latest.requestedAmount != null ? <p className="mt-1 text-xs">Homeowner requested: <b>{formatMoney(latest.requestedAmount)}</b></p> : null}
          {latest.requestedScope ? <p className="mt-1 text-xs">Scope: {latest.requestedScope}</p> : null}
          {latest.homeownerMessage ? <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{latest.homeownerMessage}</p> : null}
          {latest.adminMessage ? <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">Admin: {latest.adminMessage}</p> : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs">
        <b>Negotiation limit:</b> Homeowner {homeownerRequestsUsed}/{maxNegotiations} requests used · Admin {adminCountersUsed}/{maxAdminCounters} counter offers used.
      </div>

      {role === "homeowner" && homeownerNegotiationsRemaining === 0 ? (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900">Homeowner negotiation limit reached. No more negotiation requests can be submitted for this estimate.</div>
      ) : null}

      {role === "admin" && adminCountersRemaining === 0 ? (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900">Admin counter-offer limit reached. No more counter offers can be sent for this estimate.</div>
      ) : null}

      {role === "homeowner" && pending ? (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900">Negotiation pending — approval is locked until Admin responds.</div>
      ) : null}

      {role === "homeowner" && canRequest && !pending ? (
        <div className="space-y-2">
          <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" type="number" min="1" step="0.01" placeholder="Requested price (optional)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <textarea className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" rows={2} placeholder="Scope change (optional)" value={scope} onChange={(e) => setScope(e.target.value)} />
          <textarea className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" rows={2} placeholder="Message to Admin" value={message} onChange={(e) => setMessage(e.target.value)} />
          <button type="button" disabled={busy} onClick={() => void homeownerSubmit()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send negotiation
          </button>
        </div>
      ) : null}

      {role === "homeowner" && latest?.action === "countered" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Admin sent a counter offer. You can accept it, decline it, or send another counter.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" disabled={busy} onClick={() => void adminRespond("accept")} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-60"><CheckCircle2 className="h-4 w-4" /> Accept counter</button>
            <button type="button" disabled={busy} onClick={() => void adminRespond("decline")} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-xs font-semibold disabled:opacity-60"><XCircle className="h-4 w-4" /> Decline</button>
            <div className="flex gap-1.5">
              <input className="min-w-0 flex-1 rounded-xl border border-border bg-background px-2.5 py-2 text-xs" type="number" min="1" step="0.01" placeholder="Counter" value={counterAmount} onChange={(e) => setCounterAmount(e.target.value)} />
              <button type="button" disabled={busy || !counterAmount || homeownerNegotiationsRemaining <= 0} onClick={() => void adminRespond("counter")} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">Counter</button>
            </div>
          </div>
        </div>
      ) : null}

      {role === "admin" && pending ? (
        <div className="space-y-2">
          <textarea className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" rows={2} placeholder="Response message" value={adminMessage} onChange={(e) => setAdminMessage(e.target.value)} />
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" disabled={busy} onClick={() => void adminRespond("accept")} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-60"><CheckCircle2 className="h-4 w-4" /> Accept</button>
            <button type="button" disabled={busy} onClick={() => void adminRespond("decline")} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-xs font-semibold disabled:opacity-60"><XCircle className="h-4 w-4" /> Decline</button>
            <div className="flex gap-1.5">
              <input className="min-w-0 flex-1 rounded-xl border border-border bg-background px-2.5 py-2 text-xs" type="number" min="1" step="0.01" placeholder="Counter" value={counterAmount} onChange={(e) => setCounterAmount(e.target.value)} />
              <button type="button" disabled={busy || !counterAmount || adminCountersRemaining <= 0} onClick={() => void adminRespond("counter")} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">Counter</button>
            </div>
          </div>
        </div>
      ) : null}

      {role === "admin" && canFinalize ? (
        <button type="button" disabled={busy} onClick={() => void adminRespond("finalize")} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">Finalize Estimate — {formatMoney(Number(proposal.retailAmount || latest?.adminAmount || 0))}</button>
      ) : null}

      {role === "homeowner" && proposal.status === "finalized" ? (
        <p className="rounded-xl border border-emerald-300/50 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Final estimate is ready for the 3-checkbox homeowner approval.</p>
      ) : null}
    </section>
  );
}
