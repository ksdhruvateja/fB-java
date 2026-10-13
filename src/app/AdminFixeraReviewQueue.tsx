import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "./platformApi";

type Outcome = { outcome: string; source?: string; details?: Record<string, unknown>; at?: string };

type ReviewItem = {
  id: string;
  job_id?: number | string | null;
  task_type: string;
  case_category?: string | null;
  quality_status: string;
  approved_for_training: boolean;
  gold_example: boolean;
  outcome_type?: string | null;
  corrected_diagnosis?: string | null;
  review_notes?: string | null;
  created_at: string;
  payload?: {
    category?: string;
    problem?: string;
    diagnosis?: string;
    likely_causes?: string[];
    diy_steps?: string[];
    safety?: { level?: string; decision?: string; factors?: string[] };
    question?: string;
    answer?: string;
    blocked_by?: string | null;
    scenario?: string;
    outcomes?: Outcome[];
    professional_correction?: { actual_cause?: string | null; findings?: string | null; diagnosis_match?: string | null } | null;
    reviewer_correction?: { diagnosis?: string; fix?: string | null } | null;
  };
};

type Counts = { needs_review?: number; with_outcome?: number; approved?: number; rejected?: number };

const FILTERS = [
  { id: "with_outcome", label: "Has an outcome" },
  { id: "needs_review", label: "Needs review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
] as const;

const OUTCOME_LABEL: Record<string, string> = {
  DIY_FIXED: "Homeowner fixed it (DIY)",
  DIY_STILL_BROKEN: "DIY did not fix it",
  PROFESSIONAL_REQUESTED: "Homeowner asked for a professional",
  PROFESSIONAL_COMPLETED: "Professional completed the job",
  SAFETY_CONFIRMED: "Homeowner confirmed the safety notice",
  SAFETY_DECLINED: "Homeowner chose a professional at the safety notice",
  USER_FEEDBACK: "Homeowner feedback",
};

function outcomeLine(o: Outcome) {
  const d = o.details || {};
  const extra = [d.action, d.actual_cause && `cause: ${d.actual_cause}`, d.professional_findings, d.diagnosis_match && `diagnosis ${d.diagnosis_match}`, d.helpful && `feedback: ${d.helpful}`, d.note]
    .filter(Boolean)
    .join(" · ");
  return `${OUTCOME_LABEL[o.outcome] || o.outcome}${extra ? ` — ${extra}` : ""}`;
}

/**
 * Review queue for the Fixera learning loop. Only approved or corrected cases are reused in
 * prompts and included in the training export.
 */
export default function AdminFixeraReviewQueue() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("with_outcome");
  const [task, setTask] = useState<"assessment" | "chat">("assessment");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correction, setCorrection] = useState({ diagnosis: "", fix: "", notes: "", gold: false });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const r = await api<{ ok: boolean; items?: ReviewItem[]; counts?: Counts; message?: string }>(
      `/api/admin/fixera/review?filter=${filter}&task=${task}`
    );
    setLoading(false);
    if (!r.ok) {
      setError(r.message || "Could not load the review queue.");
      return;
    }
    setItems(r.items || []);
    setCounts(r.counts || {});
  }, [filter, task]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: string, extra: Record<string, unknown> = {}) {
    setBusyId(id);
    setError("");
    const r = await api<{ ok: boolean; message?: string }>(`/api/admin/fixera/review/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ action, ...extra }),
    });
    setBusyId(null);
    if (!r.ok) {
      setError(r.message || "Could not save the review.");
      return;
    }
    setCorrecting(null);
    setCorrection({ diagnosis: "", fix: "", notes: "", gold: false });
    await load();
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        <p className="font-semibold">How Fixera learns</p>
        <p className="mt-1 text-muted-foreground">
          Approve cases whose diagnosis was right, correct the ones that were wrong, and reject the rest. Approved and
          corrected cases are added as reference to similar new requests, and appear in the training export. Nothing is
          reused until it is approved here. Text is de-identified before it reaches this screen.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === f.id ? "border-foreground bg-foreground text-background" : "border-border"}`}
          >
            {f.label} ({counts[f.id] ?? 0})
          </button>
        ))}
        <select
          className="ml-auto rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          value={task}
          onChange={(e) => setTask(e.target.value as "assessment" | "chat")}
          aria-label="Case type"
        >
          <option value="assessment">Assessments</option>
          <option value="chat">Chat</option>
        </select>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!loading && !items.length ? <p className="text-sm text-muted-foreground">Nothing here yet.</p> : null}
      {items.map((item) => {
        const p = item.payload || {};
        const isChat = task === "chat";
        return (
          <div key={item.id} className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border px-2 py-0.5 font-semibold">{item.quality_status}</span>
              <span>{p.category || item.case_category || item.task_type}</span>
              {item.job_id ? <span>Job #{String(item.job_id)}</span> : null}
              {p.safety?.level ? <span>Safety: {p.safety.level}{p.safety.decision ? ` (${p.safety.decision})` : ""}</span> : null}
              {item.gold_example ? <span className="font-semibold text-amber-700">Gold example</span> : null}
              <span>{new Date(item.created_at).toLocaleString()}</span>
            </div>
            {isChat ? (
              <>
                <p><span className="font-semibold">Asked:</span> {p.question || p.scenario || "—"}</p>
                <p><span className="font-semibold">Fixera:</span> {p.answer || "—"}</p>
                {p.blocked_by ? <p className="text-xs text-muted-foreground">Answered by safety policy: {p.blocked_by}</p> : null}
              </>
            ) : (
              <>
                <p><span className="font-semibold">Problem:</span> {p.problem || p.scenario || "—"}</p>
                <p><span className="font-semibold">Fixera&apos;s diagnosis:</span> {p.diagnosis || "—"}</p>
                {p.diy_steps?.length ? (
                  <p className="text-xs text-muted-foreground">DIY steps: {p.diy_steps.join(" → ")}</p>
                ) : null}
                {p.safety?.factors?.length ? <p className="text-xs text-muted-foreground">Risk factors: {p.safety.factors.join(", ")}</p> : null}
              </>
            )}
            {p.outcomes?.length ? (
              <ul className="list-disc space-y-0.5 pl-5 text-xs">
                {p.outcomes.map((o, i) => <li key={i}>{outcomeLine(o)}</li>)}
              </ul>
            ) : null}
            {p.professional_correction ? (
              <p className="rounded-lg bg-amber-500/10 p-2 text-xs">
                Professional found: {p.professional_correction.actual_cause || p.professional_correction.findings}
                {p.professional_correction.diagnosis_match ? ` (Fixera ${p.professional_correction.diagnosis_match})` : ""}
              </p>
            ) : null}
            {item.corrected_diagnosis ? <p className="text-xs"><span className="font-semibold">Corrected diagnosis:</span> {item.corrected_diagnosis}</p> : null}
            {correcting === item.id ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <textarea
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Correct diagnosis (required)"
                  value={correction.diagnosis}
                  onChange={(e) => setCorrection({ ...correction, diagnosis: e.target.value })}
                />
                <textarea
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  rows={2}
                  placeholder="What actually fixed it (optional)"
                  value={correction.fix}
                  onChange={(e) => setCorrection({ ...correction, fix: e.target.value })}
                />
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Reviewer notes (optional)"
                  value={correction.notes}
                  onChange={(e) => setCorrection({ ...correction, notes: e.target.value })}
                />
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={correction.gold} onChange={(e) => setCorrection({ ...correction, gold: e.target.checked })} />
                  Gold example (a model answer worth prioritising)
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.id || !correction.diagnosis.trim()}
                    onClick={() => void review(item.id, "correct", {
                      correctedDiagnosis: correction.diagnosis,
                      correctedFix: correction.fix,
                      notes: correction.notes,
                      gold: correction.gold,
                    })}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Save correction and approve
                  </button>
                  <button type="button" onClick={() => setCorrecting(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <button type="button" disabled={busyId === item.id} onClick={() => void review(item.id, "approve")} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                  Approve
                </button>
                <button type="button" disabled={busyId === item.id} onClick={() => void review(item.id, "approve", { gold: true })} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
                  Approve as gold
                </button>
                {!isChat ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCorrecting(item.id);
                      setCorrection({ diagnosis: p.professional_correction?.actual_cause || "", fix: "", notes: "", gold: false });
                    }}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                  >
                    Correct
                  </button>
                ) : null}
                <button type="button" disabled={busyId === item.id} onClick={() => void review(item.id, "reject")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
                  Reject
                </button>
                <button type="button" disabled={busyId === item.id} onClick={() => void review(item.id, "safety_reject")} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-700">
                  Unsafe guidance
                </button>
                {item.quality_status !== "UNREVIEWED" ? (
                  <button type="button" disabled={busyId === item.id} onClick={() => void review(item.id, "reset")} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                    Reset
                  </button>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
