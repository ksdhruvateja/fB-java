import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, MessageSquare, Send, XCircle } from "lucide-react";
import {
  adminRespondContractorBidNegotiation,
  adminStartContractorBidNegotiation,
  contractorRespondContractorBidNegotiation,
  formatMoney,
  listBids,
  listContractorBidNegotiations,
  type Bid,
  type ContractorBidNegotiation,
} from "./managedJobs";

export default function ContractorBidNegotiationPanel({
  jobId,
  bid: suppliedBid,
  role,
  onChanged,
  onMessage,
}: {
  jobId: number;
  bid?: Bid | null;
  role: "admin" | "contractor";
  onChanged?: () => void | Promise<void>;
  onMessage?: (message: string) => void;
}) {
  const [bid, setBid] = useState<Bid | null>(suppliedBid || null);
  const [items, setItems] = useState<ContractorBidNegotiation[]>([]);
  const [maxRounds, setMaxRounds] = useState(4);
  const [roundsRemaining, setRoundsRemaining] = useState(4);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setBid(suppliedBid || null);
  }, [suppliedBid?.id, suppliedBid?.netTotal]);

  async function load() {
    setLoading(true);
    try {
      let currentBid = suppliedBid || null;
      if (!currentBid) {
        const bidsResult = await listBids(jobId);
        currentBid = bidsResult.ok ? (bidsResult.bids || [])[0] || null : null;
        setBid(currentBid);
      }
      if (!currentBid) {
        setItems([]);
        return;
      }

      const r = await listContractorBidNegotiations(jobId, currentBid.id);
      if (!r.ok) {
        setItems([]);
        return;
      }
      setItems(r.negotiations || []);
      setMaxRounds(Number(r.maxRounds || 4));
      setRoundsRemaining(Number(r.roundsRemaining ?? 4));
      if (!amount) {
        setAmount(String(Number(currentBid.netTotal || 0)));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let stopped = false;
    void load();
    const onWorkflowMutated = () => {
      if (!stopped) void load();
    };
    window.addEventListener("fixbridge:workflow-mutated", onWorkflowMutated);
    return () => {
      stopped = true;
      window.removeEventListener("fixbridge:workflow-mutated", onWorkflowMutated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, suppliedBid?.id]);

  const latest = items[items.length - 1] || null;
  const roundsUsed = items.length;
  const waitingForContractor = latest?.action === "pending_contractor";
  const waitingForAdmin = latest?.action === "contractor_countered";
  const finalized = latest?.action === "accepted";
  const declined = latest?.action === "declined";

  const title = role === "admin"
    ? "Contractor estimate negotiation"
    : "Admin negotiation on your estimate";

  const statusText = useMemo(() => {
    if (!latest) {
      return role === "admin"
        ? "Contractor estimate received. You can negotiate up to 4 rounds before building the homeowner quote."
        : "Your contractor estimate is submitted. Waiting for Admin.";
    }
    if (latest.action === "pending_contractor") {
      return `Admin offer: ${formatMoney(latest.adminAmount || 0)} · waiting for your response.`;
    }
    if (latest.action === "contractor_countered") {
      return "Contractor counter received · waiting for Admin.";
    }
    if (latest.action === "accepted") {
      return `Final contractor estimate: ${formatMoney(latest.contractorAmount ?? latest.adminAmount ?? bid?.netTotal ?? 0)}.`;
    }
    if (latest.action === "declined") {
      return "Negotiation declined. The previous contractor estimate remains available.";
    }
    return "Negotiation updated.";
  }, [latest, role, bid?.netTotal]);

  async function refreshAfter(action: Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    try {
      const r = await action;
      if (!r.ok) {
        onMessage?.(r.message || "Could not update contractor negotiation.");
        return;
      }
      setAmount("");
      setMessage("");
      await load();
      window.dispatchEvent(new CustomEvent("fixbridge:workflow-mutated", {
        detail: { jobId, action: "contractor_estimate_negotiation" },
      }));
      await onChanged?.();
      if (r.message) onMessage?.(r.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading contractor negotiation…
      </div>
    );
  }

  if (!bid) return null;

  return (
    <section className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/50 p-4 dark:border-orange-900/40 dark:bg-orange-950/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold">
            <MessageSquare className="h-4 w-4" />
            {title}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Contractor estimate: <b>{formatMoney(Number(bid.netTotal || 0))}</b>
          </p>
        </div>
        <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-bold uppercase">
          {roundsUsed}/{maxRounds} rounds
        </span>
      </div>

      <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
        {/* {statusText} */}

        {role === "admin" &&
latest?.contractorAmount != null &&
latest.action === "contractor_countered" ? (
  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900/40 dark:bg-emerald-950/20">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      Latest contractor bid
    </div>

    <div className="mt-0.5 text-base font-bold">
      {formatMoney(latest.contractorAmount)}
    </div>
  </div>
) : null}
      </div>

      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((n) => (
            <div key={n.id} className="rounded-lg border border-border bg-background p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Round {n.roundNumber}</span>
                <span className="text-muted-foreground">
                  Admin {n.adminAmount != null ? formatMoney(n.adminAmount) : "—"}
                </span>
              </div>
              {n.adminMessage ? <p className="mt-1 text-muted-foreground">Admin: {n.adminMessage}</p> : null}
              {n.contractorMessage ? <p className="mt-1 text-muted-foreground">Contractor: {n.contractorMessage}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {role === "admin" && !finalized && !declined && !waitingForContractor && roundsRemaining > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold">
            {waitingForAdmin ? "Respond to contractor counter" : "Send first negotiation offer"}
          </p>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <input
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              type="number"
              min="0.01"
              step="0.01"
              // value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              disabled={busy}
            />
            <input
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message to contractor"
              disabled={busy}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {waitingForAdmin ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void refreshAfter(adminRespondContractorBidNegotiation(jobId, bid.id, latest!.id, {
                    action: "accept",
                    message: message.trim() || undefined,
                  }))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Accept {formatMoney(latest?.contractorAmount || 0)}
                </button>
                <button
                  type="button"
                  disabled={busy || roundsRemaining <= 0}
                  onClick={() => void refreshAfter(adminRespondContractorBidNegotiation(jobId, bid.id, latest!.id, {
                    action: "counter",
                    counterAmount: Number(amount),
                    message: message.trim() || undefined,
                  }))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" /> Send Counter
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void refreshAfter(adminRespondContractorBidNegotiation(jobId, bid.id, latest!.id, {
                    action: "decline",
                    message: message.trim() || undefined,
                  }))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" /> Decline
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy || !(Number(amount) > 0)}
                onClick={() => void refreshAfter(adminStartContractorBidNegotiation(jobId, bid.id, {
                  amount: Number(amount),
                  message: message.trim() || undefined,
                }))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> Send to Contractor
              </button>
            )}
          </div>
        </div>
      ) : null}

      {role === "admin" && waitingForContractor ? (
        <p className="text-xs font-medium text-amber-700">Waiting for contractor response. No second Admin offer can be sent until this round is resolved.</p>
      ) : null}

      {role === "contractor" && waitingForContractor ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold">Respond to Admin offer</p>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <input
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              type="number"
              min="0.01"
              step="0.01"
              // value={amount || String(latest?.adminAmount || bid.netTotal || "")}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
            />
            <input
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message to Admin"
              disabled={busy}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void refreshAfter(contractorRespondContractorBidNegotiation(jobId, bid.id, latest!.id, {
                action: "accept",
                message: message.trim() || undefined,
              }))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Accept {formatMoney(latest?.adminAmount || 0)}
            </button>
            <button
              type="button"
              disabled={busy || Number(amount) <= 0}
              onClick={() => void refreshAfter(contractorRespondContractorBidNegotiation(jobId, bid.id, latest!.id, {
                action: "counter",
                counterAmount: Number(amount),
                message: message.trim() || undefined,
              }))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Counter Admin
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void refreshAfter(contractorRespondContractorBidNegotiation(jobId, bid.id, latest!.id, {
                action: "decline",
                message: message.trim() || undefined,
              }))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" /> Decline
            </button>
          </div>
        </div>
      ) : null}

      {role === "contractor" && waitingForAdmin ? (
        <p className="text-xs font-medium text-amber-700">Counter sent to Admin. Waiting for the next response.</p>
      ) : null}

      {roundsRemaining === 0 && !finalized && !declined ? (
        <p className="text-xs font-semibold text-amber-700">
          Four Admin negotiation rounds have been used. The next decision must be Accept or Decline; no fifth counter is allowed.
        </p>
      ) : null}

      {finalized ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          Final contractor estimate agreed: {formatMoney(latest?.contractorAmount ?? latest?.adminAmount ?? bid.netTotal)}. Admin can now build/send the homeowner quote.
        </div>
      ) : null}
    </section>
  );
}
