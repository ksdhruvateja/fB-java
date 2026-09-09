import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { approveProposal, formatMoney, type ManagedJob, type Proposal } from "./managedJobs";
import { getStoredToken } from "./auth";

type QuoteOption = Proposal & {
  quoteOptionLabel?: string | null;
  quoteOptionTitle?: string | null;
  optionGroup?: string | null;
  total?: number;
};

async function fetchQuoteOptions(jobId: number) {
  const token = getStoredToken();
  const res = await fetch(`/api/managed/jobs/${jobId}/quote-options`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Could not load quote options");
  return data as { ok: boolean; options: QuoteOption[]; hasAlternatives: boolean };
}

function optionLetter(opt: QuoteOption, idx: number) {
  const raw = String(opt.quoteOptionLabel || "").replace(/^option\s+/i, "").trim();
  return raw || String.fromCharCode(65 + idx);
}

export default function HomeownerQuoteOptionsPanel({
  job,
  onRefresh,
  onError,
  onBusy,
}: {
  job: ManagedJob;
  onRefresh: () => void | Promise<void>;
  onError: (msg: string | null) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [options, setOptions] = useState<QuoteOption[]>([]);
  const [hasAlternatives, setHasAlternatives] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchQuoteOptions(job.id)
      .then((r) => {
        if (cancelled) return;
        setOptions(r.options || []);
        setHasAlternatives(Boolean(r.hasAlternatives));
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job.id, job.updatedAt]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading quote options…
      </div>
    );
  }

  if (!hasAlternatives || options.length < 2) return null;

  const activeOptions = options.filter((o) => ["sent", "viewed"].includes(String(o.status)));

  if (activeOptions.length < 2) return null;

  async function selectOption(proposalId: number) {
    onBusy(true);
    setSelectingId(proposalId);
    onError(null);
    try {
      const r = await approveProposal(job.id, undefined, proposalId);
      if (!r.ok) {
        onError(r.message || "Could not select option.");
        return;
      }
      await onRefresh();
    } finally {
      setSelectingId(null);
      onBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">Choose the option that works best for you</p>
      <div className="grid grid-cols-1 gap-3 overflow-x-hidden">
        {activeOptions.map((opt, idx) => {
          const letter = optionLetter(opt, idx);
          const title = opt.quoteOptionTitle || opt.scopeSummary || "Service option";
          return (
            <div key={opt.id} className="min-w-0 rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Option {letter}</p>
              <p className="mt-1 break-words font-medium">{title}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(Number(opt.total ?? opt.retailAmount ?? 0))}</p>
              {opt.scopeSummary && opt.quoteOptionTitle ? (
                <p className="mt-2 break-words text-sm text-muted-foreground">{opt.scopeSummary}</p>
              ) : null}
              <button
                type="button"
                disabled={selectingId != null}
                onClick={() => void selectOption(opt.id)}
                className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {selectingId === opt.id ? "Selecting…" : `Select Option ${letter}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
