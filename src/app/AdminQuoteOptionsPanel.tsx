import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, Loader2, Plus, Send, Trash2 } from "lucide-react";
import {
  adminDuplicateQuote,
  adminJobQuoteOptions,
  adminRemoveDraftQuoteOption,
  adminSaveQuoteDocument,
  adminSendQuoteOptionGroup,
  formatMoney,
} from "./managedJobs";
import type { QuoteDocument } from "./quoteDocument";

type OptionRow = QuoteDocument & {
  customerTotal?: number;
  contractorAmount?: number;
  margin?: number;
  letter?: string | null;
  customerTitle?: string | null;
  historical?: boolean;
};

function letterLabel(opt: OptionRow, idx: number) {
  const raw = String(opt.letter || opt.quoteOptionLabel || "").replace(/^option\s+/i, "").trim();
  return raw || String.fromCharCode(65 + idx);
}

export default function AdminQuoteOptionsPanel({
  jobId,
  currentQuoteId,
  onOpenQuote,
  onMessage,
  onChanged,
}: {
  jobId: number;
  currentQuoteId: number;
  onOpenQuote: (id: number) => void;
  onMessage: (msg: string) => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [edits, setEdits] = useState<Record<number, { title: string; scope: string }>>({});

  const load = async () => {
    setLoading(true);
    const r = await adminJobQuoteOptions(jobId);
    setLoading(false);
    if (!r.ok) {
      onMessage(r.message || "Could not load options.");
      return;
    }
    const rows = r.options || [];
    setOptions(rows);
    const next: Record<number, { title: string; scope: string }> = {};
    rows.forEach((o) => {
      next[o.id] = {
        title: o.quoteOptionTitle || o.customerTitle || "",
        scope: o.scopeSummary || "",
      };
    });
    setEdits(next);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when quote/job changes
  }, [jobId, currentQuoteId]);

  const active = useMemo(
    () => options.filter((o) => !["superseded", "canceled", "cancelled", "declined"].includes(String(o.status).toLowerCase())),
    [options],
  );
  const comparable = active.filter((o) => ["draft", "sent", "viewed"].includes(String(o.status).toLowerCase()));

  const saveMeta = async (id: number) => {
    const e = edits[id];
    if (!e) return;
    const r = await adminSaveQuoteDocument(id, {
      quoteOptionTitle: e.title,
      scopeSummary: e.scope,
    });
    if (!r.ok) onMessage(r.message || "Could not save option.");
  };

  return (
    <section className="rounded-2xl border border-border p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Service options</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Build Option A / B alternatives. Revisions stay on the same letter.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
            onClick={async () => {
              setBusy(true);
              const r = await adminDuplicateQuote(currentQuoteId, { asOption: true });
              setBusy(false);
              if (!r.ok || !r.quote) {
                onMessage(r.message || "Could not add option.");
                return;
              }
              onMessage(`Added Option ${r.quote.quoteOptionLabel || ""}`.trim());
              await load();
              onOpenQuote(r.quote.id);
              await onChanged?.();
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add Option
          </button>
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
            onClick={async () => {
              setBusy(true);
              const r = await adminDuplicateQuote(currentQuoteId, { asOption: true });
              setBusy(false);
              if (!r.ok || !r.quote) {
                onMessage(r.message || "Could not duplicate option.");
                return;
              }
              onMessage("Duplicated option.");
              await load();
              onOpenQuote(r.quote.id);
              await onChanged?.();
            }}
          >
            <Copy className="h-3.5 w-3.5" /> Duplicate Option
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
            onClick={() => setPreview(true)}
          >
            <Eye className="h-3.5 w-3.5" /> Preview customer options
          </button>
          <button
            type="button"
            disabled={busy || comparable.length < 1}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              const r = await adminSendQuoteOptionGroup(currentQuoteId);
              setBusy(false);
              if (!r.ok) {
                onMessage(r.message || "Could not send options.");
                return;
              }
              onMessage(r.message || `Sent ${r.sent} options.`);
              await load();
              await onChanged?.();
            }}
          >
            <Send className="h-3.5 w-3.5" /> Send {comparable.length || ""} option{comparable.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading options…
        </p>
      ) : (
        <div className="grid gap-3">
          {options.map((opt, idx) => {
            const letter = letterLabel(opt, idx);
            const customer = Number(opt.customerTotal ?? opt.total ?? 0);
            const contractor = Number(opt.contractorAmount ?? opt.contractorQuoteAmount ?? 0);
            const margin = Number(opt.margin ?? customer - contractor);
            const locked = ["accepted", "approved", "converted", "paid"].includes(String(opt.status).toLowerCase());
            const draft = String(opt.status).toLowerCase() === "draft";
            const historical = Boolean(opt.historical) || String(opt.status).toLowerCase() === "superseded";
            return (
              <div
                key={opt.id}
                className={`rounded-xl border p-3 ${opt.id === currentQuoteId ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" className="text-left" onClick={() => onOpenQuote(opt.id)}>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Option {letter}</p>
                    <p className="text-sm font-semibold">
                      {opt.quoteNumber} v{opt.versionNumber || 1} · {opt.status}
                      {historical ? " · Superseded" : ""}
                    </p>
                  </button>
                  {draft && !locked ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-red-700"
                      onClick={async () => {
                        const r = await adminRemoveDraftQuoteOption(opt.id);
                        if (!r.ok) {
                          onMessage(r.message || "Could not remove option.");
                          return;
                        }
                        onMessage("Draft option removed.");
                        await load();
                        await onChanged?.();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove draft
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs">
                    <span className="text-muted-foreground">Customer-facing title</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                      disabled={locked || historical}
                      value={edits[opt.id]?.title ?? ""}
                      onChange={(e) => setEdits((p) => ({ ...p, [opt.id]: { ...(p[opt.id] || { title: "", scope: "" }), title: e.target.value } }))}
                      onBlur={() => void saveMeta(opt.id)}
                      placeholder="Repair / Replacement"
                    />
                  </label>
                  <label className="text-xs sm:col-span-2">
                    <span className="text-muted-foreground">Scope</span>
                    <textarea
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                      disabled={locked || historical}
                      value={edits[opt.id]?.scope ?? ""}
                      onChange={(e) => setEdits((p) => ({ ...p, [opt.id]: { ...(p[opt.id] || { title: "", scope: "" }), scope: e.target.value } }))}
                      onBlur={() => void saveMeta(opt.id)}
                    />
                  </label>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-[11px] uppercase text-muted-foreground">Customer total</dt>
                    <dd className="font-semibold tabular-nums">{formatMoney(customer)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase text-muted-foreground">Contractor</dt>
                    <dd className="font-semibold tabular-nums">{formatMoney(contractor)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase text-muted-foreground">Margin</dt>
                    <dd className="font-semibold tabular-nums">{formatMoney(margin)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase text-muted-foreground">Discount</dt>
                    <dd className="font-semibold tabular-nums">{formatMoney(Number(opt.discountAmount || 0))}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      )}

      {comparable.length >= 2 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-3"> </th>
                {comparable.map((o, i) => (
                  <th key={o.id} className="py-2 pr-3">
                    Option {letterLabel(o, i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Customer", (o: OptionRow) => formatMoney(Number(o.customerTotal ?? o.total ?? 0))],
                ["Contractor", (o: OptionRow) => formatMoney(Number(o.contractorAmount ?? o.contractorQuoteAmount ?? 0))],
                [
                  "Margin",
                  (o: OptionRow) =>
                    formatMoney(
                      Number(
                        o.margin ??
                          Number(o.customerTotal ?? o.total ?? 0) - Number(o.contractorAmount ?? o.contractorQuoteAmount ?? 0),
                      ),
                    ),
                ],
                ["Discount", (o: OptionRow) => formatMoney(Number(o.discountAmount || 0))],
              ].map(([label, val]) => (
                <tr key={String(label)} className="border-t border-border">
                  <td className="py-2 pr-3 text-muted-foreground">{label as string}</td>
                  {comparable.map((o) => (
                    <td key={o.id} className="py-2 pr-3 tabular-nums font-medium">
                      {(val as (o: OptionRow) => string)(o)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-background p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Preview customer options</p>
            <h2 className="mt-1 text-lg font-semibold">Choose the option that works best for you</h2>
            <div className="mt-4 grid grid-cols-1 gap-3">
              {comparable.map((o, i) => (
                <div key={o.id} className="rounded-xl border border-border p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    Option {letterLabel(o, i)}
                  </p>
                  <p className="mt-1 font-semibold">{edits[o.id]?.title || o.quoteOptionTitle || o.scopeSummary || "Service option"}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(Number(o.customerTotal ?? o.total ?? 0))}</p>
                  {edits[o.id]?.scope || o.scopeSummary ? (
                    <p className="mt-2 text-sm text-muted-foreground">{edits[o.id]?.scope || o.scopeSummary}</p>
                  ) : null}
                  <p className="mt-4 rounded-xl bg-primary px-4 py-2 text-center text-sm font-semibold text-white">
                    Select Option {letterLabel(o, i)}
                  </p>
                </div>
              ))}
            </div>
            <button type="button" className="mt-4 w-full rounded-xl border border-border py-2 text-sm font-semibold" onClick={() => setPreview(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
