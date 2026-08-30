import { useEffect, useState } from "react";
import { Loader2, Plus, Check } from "lucide-react";
import { formatMoney } from "./managedJobs";
import {
  listChangeOrders,
  createChangeOrder,
  approveChangeOrder,
  priceChangeOrder,
  type ChangeOrder,
} from "./changeOrdersApi";
import { ConsentCheckbox, ConsentSection, consentsFromState } from "./ConsentCheckbox";
import { mergeConsentRecords, useAcknowledgmentGate } from "./useAcknowledgmentGate";
import type { AcceptanceType } from "./legalDocuments";

export default function ChangeOrderPanel({
  jobId,
  role,
  originalApprovedTotal,
  onChanged,
}: {
  jobId: number;
  role: "contractor" | "admin" | "homeowner";
  originalApprovedTotal?: number | null;
  onChanged?: () => void;
}) {
  const [orders, setOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [retailDraft, setRetailDraft] = useState<Record<number, string>>({});
  const [changeOrderAck, setChangeOrderAck] = useState<Record<number, boolean>>({});
  const ackGate = useAcknowledgmentGate();
  const changeOrderConsentKeys: AcceptanceType[] = ["CHANGE_ORDER_APPROVAL"];

  const refresh = async () => {
    setLoading(true);
    const r = await listChangeOrders(jobId);
    setLoading(false);
    if (r.ok) setOrders(r.changeOrders || []);
    else setError(r.message || "Could not load change orders.");
  };

  useEffect(() => {
    void refresh();
  }, [jobId]);

  const approvedAdditional = orders
    .filter((co) => co.status === "approved" && co.retailAmount != null)
    .reduce((sum, co) => sum + Number(co.retailAmount || 0), 0);

  const submitContractor = async () => {
    setBusy(true);
    setError(null);
    const net = Number(amount);
    if (!(net > 0) || !description.trim()) {
      setError("Description and amount are required.");
      setBusy(false);
      return;
    }
    const r = await createChangeOrder(jobId, {
      description: description.trim(),
      contractorNet: net,
      reason: reason.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message || "Submit failed.");
      return;
    }
    setDescription("");
    setReason("");
    setAmount("");
    await refresh();
    onChanged?.();
  };

  const sendToHomeowner = async (co: ChangeOrder) => {
    const retail = Number(retailDraft[co.id] || co.retailAmount || 0);
    if (!(retail > 0)) {
      setError("Enter a retail amount for the homeowner.");
      return;
    }
    setBusy(true);
    const r = await priceChangeOrder(co.id, retail);
    setBusy(false);
    if (!r.ok) {
      setError(r.message || "Could not send to homeowner.");
      return;
    }
    await refresh();
    onChanged?.();
  };

  const approve = async (co: ChangeOrder, extraConsents?: Record<string, boolean>) => {
    const consentState = mergeConsentRecords(
      { CHANGE_ORDER_APPROVAL: changeOrderAck[co.id] === true },
      extraConsents
    );
    const missing = ackGate.missingConsentKeys(consentState, changeOrderConsentKeys);
    if (missing.length) {
      ackGate.prompt({
        missing,
        currentState: consentState,
        description: "Approve this change order by accepting the required acknowledgment below.",
        onConfirm: async (consents) => {
          if (consents.CHANGE_ORDER_APPROVAL) {
            setChangeOrderAck((state) => ({ ...state, [co.id]: true }));
          }
          await approve(co, consents);
        },
      });
      return;
    }
    setBusy(true);
    const r = await approveChangeOrder(jobId, co.id, consentsFromState(consentState));
    setBusy(false);
    if (!r.ok) {
      if (
        ackGate.promptFromResponse(r, {
          currentState: consentState,
          fallbackMissing: changeOrderConsentKeys,
          onConfirm: async (consents) => {
            if (consents.CHANGE_ORDER_APPROVAL) {
              setChangeOrderAck((state) => ({ ...state, [co.id]: true }));
            }
            await approve(co, consents);
          },
        })
      ) {
        return;
      }
      setError(r.message || "Could not approve.");
      return;
    }
    await refresh();
    onChanged?.();
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="font-semibold">Change orders</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Additional work must be approved before it is added to final billing.
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {role === "contractor" && (
        <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Additional work needed</p>
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Reason (e.g. discovered leak behind wall)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <textarea
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[72px]"
            placeholder="Description and scope"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Your cost estimate ($)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitContractor()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Submit change order
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No change orders yet.</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((co) => {
            const additional = Number(co.retailAmount || 0);
            const original = Number(originalApprovedTotal || 0);
            const updatedTotal = original + approvedAdditional + (co.status === "approved" ? 0 : additional);

            return (
            <li key={co.id} className="rounded-xl border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs uppercase text-muted-foreground">{co.status.replace(/_/g, " ")}</span>
                {co.approvedAt ? (
                  <span className="text-xs text-emerald-600 font-semibold">Approved {new Date(co.approvedAt).toLocaleDateString()}</span>
                ) : null}
              </div>
              <p className="mt-2 font-medium">{co.description}</p>
              {role !== "homeowner" && co.contractorNet != null ? (
                <p className="text-muted-foreground">Contractor: {formatMoney(co.contractorNet)}</p>
              ) : null}
              {(role === "admin" || role === "homeowner") && co.retailAmount != null ? (
                <p className="font-semibold">Homeowner price: {formatMoney(co.retailAmount)}</p>
              ) : null}

              {role === "homeowner" && co.status === "sent_to_homeowner" && co.retailAmount != null && (
                <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/15 p-3 text-xs tabular-nums">
                  {original > 0 ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Original approved total</span>
                        <span>{formatMoney(original)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Additional change order</span>
                        <span>{formatMoney(additional)}</span>
                      </div>
                      <div className="flex justify-between border-t border-border pt-2 font-semibold">
                        <span>Updated total</span>
                        <span>{formatMoney(updatedTotal)}</span>
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              {role === "admin" && ["submitted", "admin_reviewed"].includes(co.status) && (
                <div className="mt-3 flex flex-wrap gap-2 items-end">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm w-32"
                    placeholder="Retail $"
                    value={retailDraft[co.id] ?? ""}
                    onChange={(e) => setRetailDraft((d) => ({ ...d, [co.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void sendToHomeowner(co)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Send to homeowner
                  </button>
                </div>
              )}

              {role === "homeowner" && co.status === "sent_to_homeowner" && (
                <div className="mt-3 space-y-2">
                  <ConsentSection title="Change order approval">
                    <ConsentCheckbox
                      id={`co-ack-${co.id}`}
                      checked={!!changeOrderAck[co.id]}
                      onChange={(v) => setChangeOrderAck((prev) => ({ ...prev, [co.id]: v }))}
                      label="I approve this additional scope and additional price."
                    />
                  </ConsentSection>
                  <button
                    type="button"
                    disabled={busy || !changeOrderAck[co.id]}
                    onClick={() => void approve(co)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve Change Order
                    {co.retailAmount != null ? ` ${formatMoney(co.retailAmount)}` : ""}
                  </button>
                </div>
              )}

              {co.status === "approved" && co.retailAmount != null ? (
                <p className="mt-2 text-xs text-muted-foreground">Locked — included in final invoice.</p>
              ) : null}
            </li>
          );
          })}
        </ul>
      )}
      {ackGate.modal}
    </section>
  );
}
