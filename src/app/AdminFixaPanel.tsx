import { useEffect, useState, type ReactNode } from "react";
import { api } from "./platformApi";

type FixeraProvider = {
  id: string;
  name: string;
  status: string;
  defaultModel?: string | null;
  keyHint?: string | null;
  note?: string;
};

type FixeraAdmin = {
  assistant: string;
  principle?: string;
  currentProvider?: string;
  currentModel?: string;
  connection?: string;
  health?: {
    configured?: boolean;
    authenticated?: boolean | null;
    modelReachable?: boolean | null;
    provider?: string | null;
    model?: string | null;
    fallbackProvider?: string | null;
    fallbackModel?: string | null;
    fallbackProviders?: Array<{ provider: string; model?: string | null }>;
    healthy?: boolean;
    providerStatus?: number;
    providerCode?: string;
    code?: string;
    latencyMs?: number;
  };
  providers: FixeraProvider[];
  observability?: {
    successRate?: number | null;
    avgLatencyMs?: number | null;
    schemaFailures?: number;
    safetyRejections?: number;
    evaluatorFailures?: number;
  };
  note?: string;
};

type PricingIntel = {
  comparisonLevel?: string;
  confidence?: string;
  sampleSize?: number;
  median?: number | null;
  typicalRange?: { low: number; high: number } | null;
  authority?: string;
  homeownerSafeSummary?: string | null;
  evaluation?: { signal?: string; recommendedAction?: string; fact?: string } | null;
};

type TrainingOverview = {
  productName?: string;
  datasetVersion?: string;
  totalCandidates?: number;
  approvedForTraining?: number;
  goldExamples?: number;
  safetyRejected?: number;
  professionalCorrected?: number;
  interactions?: number;
  exportReady?: boolean;
};

type KnowledgeEntry = {
  id: number;
  title: string;
  category: string;
  content: string;
  tags: string[];
  source?: string | null;
  status: "draft" | "active" | "archived";
  updated_at?: string;
};

type KnowledgeForm = {
  id?: number;
  title: string;
  category: string;
  content: string;
  tags: string;
  source: string;
  status: "draft" | "active" | "archived";
};

const EMPTY_KNOWLEDGE_FORM: KnowledgeForm = {
  title: "",
  category: "general",
  content: "",
  tags: "",
  source: "",
  status: "draft",
};

const TABS = ["Overview", "Providers", "Health", "Experience", "Knowledge", "Pricing", "Evaluations", "Training", "Models"] as const;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2 space-y-1 text-sm">{children}</div>
    </div>
  );
}

export default function AdminFixeraPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [data, setData] = useState<FixeraAdmin | null>(null);
  const [pricing, setPricing] = useState<PricingIntel | null>(null);
  const [training, setTraining] = useState<TrainingOverview | null>(null);
  const [error, setError] = useState("");
  const [zip, setZip] = useState("");
  const [category, setCategory] = useState("");
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([]);
  const [knowledgeForm, setKnowledgeForm] = useState<KnowledgeForm>(EMPTY_KNOWLEDGE_FORM);
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState("");
  const [knowledgeMessage, setKnowledgeMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<FixeraAdmin & { ok?: boolean; message?: string }>("/api/admin/fixera/providers")
      .then((res) => {
        if (cancelled) return;
        if (!res?.providers) {
          setError(res?.message || "Fixera provider status is unavailable.");
          return;
        }
        setData(res);
      })
      .catch(() => {
        if (!cancelled) setError("Fixera provider status is unavailable.");
      });
    api<TrainingOverview>("/api/admin/fixera/training")
      .then((res) => {
        if (!cancelled) setTraining(res);
      })
      .catch(() => {
        if (!cancelled) setTraining(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab !== "Knowledge") return;
    let cancelled = false;
    api<{ entries?: KnowledgeEntry[]; message?: string }>("/api/admin/fixera/knowledge")
      .then((result) => {
        if (cancelled) return;
        setKnowledgeEntries(result.entries || []);
        setKnowledgeError(result.message || "");
      })
      .catch(() => {
        if (!cancelled) setKnowledgeError("Could not load Fixera knowledge.");
      });
    return () => { cancelled = true; };
  }, [tab]);

  async function loadPricing() {
    const params = new URLSearchParams();
    if (zip.trim()) params.set("zip", zip.trim());
    if (category.trim()) params.set("category", category.trim());
    const res = await api<PricingIntel>(`/api/admin/fixera/pricing?${params.toString()}`);
    setPricing(res);
  }

  async function saveKnowledgeEntry() {
    setKnowledgeSaving(true);
    setKnowledgeError("");
    setKnowledgeMessage("");
    try {
      const result = await api<{ ok: boolean; entry?: KnowledgeEntry; message?: string }>("/api/admin/fixera/knowledge", {
        method: "POST",
        body: JSON.stringify({
          ...knowledgeForm,
          tags: knowledgeForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      if (!result.ok || !result.entry) {
        setKnowledgeError(result.message || "Could not save this knowledge entry.");
        return;
      }
      setKnowledgeEntries((current) => [result.entry!, ...current.filter((entry) => entry.id !== result.entry!.id)]);
      setKnowledgeForm(EMPTY_KNOWLEDGE_FORM);
      setKnowledgeMessage(result.entry.status === "active" ? "Knowledge entry is active for Fixera retrieval." : "Knowledge entry saved for review.");
    } catch {
      setKnowledgeError("Could not save this knowledge entry.");
    } finally {
      setKnowledgeSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Fixera</h2>
        <p className="text-sm text-muted-foreground">
          Permanent intelligence for FixBridge. Models are replaceable. Fixera does not change customer prices.
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${tab === name ? "border-foreground bg-foreground text-background" : "border-border"}`}
          >
            {name}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {tab === "Overview" || tab === "Health" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="Fixera status">
            <p className="font-semibold">{data?.connection === "connected" ? "Healthy" : data?.connection || "Unknown"}</p>
            <p>Provider: {data?.currentProvider || "Not configured"}</p>
            <p>Model: {data?.currentModel || "Not configured"}</p>
            <p>Fallbacks: {data?.health?.fallbackProviders?.length
              ? data.health.fallbackProviders.map((fallback) => `${fallback.provider}${fallback.model ? ` (${fallback.model})` : ""}`).join(", ")
              : data?.health?.fallbackProvider || "None configured"}</p>
            <p>Authentication probe: {data?.health?.authenticated == null ? "Not checked" : data.health.authenticated ? "Passed" : "Failed"}</p>
            <p>Model probe: {data?.health?.modelReachable == null ? "Not checked" : data.health.modelReachable ? "Passed" : "Failed"}</p>
          </Card>
          <Card title="Signals">
            <p>Success rate: {data?.observability?.successRate ?? "—"}%</p>
            <p>Average latency: {data?.observability?.avgLatencyMs ?? "—"} ms</p>
            <p>Evaluator rejections: {data?.observability?.evaluatorFailures ?? 0}</p>
            <p>Safety rejections: {data?.observability?.safetyRejections ?? 0}</p>
            <p>Training candidates: {training?.totalCandidates ?? training?.interactions ?? 0}</p>
            <p>Approved examples: {training?.approvedForTraining ?? 0}</p>
          </Card>
        </div>
      ) : null}

      {tab === "Providers" || tab === "Models" ? (
        <div className="grid gap-3">
          {(data?.providers || []).map((provider) => (
            <div key={provider.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{provider.name}</p>
                  <p className="break-words text-sm text-muted-foreground">
                    {provider.defaultModel ? `Model: ${provider.defaultModel}` : provider.note || "Not configured"}
                  </p>
                  {provider.keyHint ? <p className="mt-1 text-xs text-muted-foreground">Identifier: {provider.keyHint}</p> : null}
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold">
                  {provider.status === "configured" || provider.status === "connected" ? "Active" : provider.status.replaceAll("_", " ")}
                </span>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Homeowners never see provider names. Fixera Local is not deployed and is not claimed as a working generative model.
          </p>
        </div>
      ) : null}

      {tab === "Experience" || tab === "Training" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="Fixera Super Training">
            <p>{training?.productName || "Fixera Super Training"}</p>
            <p>Dataset: {training?.datasetVersion || "fixera-training-v1"}</p>
            <p>Candidates: {training?.totalCandidates ?? 0}</p>
            <p>Approved: {training?.approvedForTraining ?? 0}</p>
            <p>Gold examples: {training?.goldExamples ?? 0}</p>
            <p>Professional corrections: {training?.professionalCorrected ?? 0}</p>
            <p>Safety-rejected, not trainable: {training?.safetyRejected ?? 0}</p>
          </Card>
          <Card title="Export">
            <p>Approved export is available only after review. Raw names, emails, phones, and addresses are not included.</p>
            <p>{training?.exportReady ? "Approved rows can be exported as JSONL." : "No approved examples yet."}</p>
          </Card>
        </div>
      ) : null}

      {tab === "Knowledge" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Global Repair Knowledge</h3>
            <p className="mt-1 text-xs text-muted-foreground">Only active, reviewed entries are retrieved for matching assessments. Keep customer and property details out of global guidance.</p>
            {knowledgeError ? <p className="mt-3 text-sm text-destructive">{knowledgeError}</p> : null}
            {knowledgeMessage ? <p className="mt-3 text-sm text-emerald-700">{knowledgeMessage}</p> : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold">Title
                <input value={knowledgeForm.title} onChange={(event) => setKnowledgeForm((form) => ({ ...form, title: event.target.value }))} maxLength={160} className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal" />
              </label>
              <label className="grid gap-1 text-xs font-semibold">Category
                <input value={knowledgeForm.category} onChange={(event) => setKnowledgeForm((form) => ({ ...form, category: event.target.value }))} maxLength={80} className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal" />
              </label>
              <label className="grid gap-1 text-xs font-semibold">Tags
                <input value={knowledgeForm.tags} onChange={(event) => setKnowledgeForm((form) => ({ ...form, tags: event.target.value }))} placeholder="appliance, cooling" className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal" />
              </label>
              <label className="grid gap-1 text-xs font-semibold">Source
                <input value={knowledgeForm.source} onChange={(event) => setKnowledgeForm((form) => ({ ...form, source: event.target.value }))} maxLength={240} className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal" />
              </label>
              <label className="grid gap-1 text-xs font-semibold">Review status
                <select value={knowledgeForm.status} onChange={(event) => setKnowledgeForm((form) => ({ ...form, status: event.target.value as KnowledgeForm["status"] }))} className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold sm:col-span-2">Guidance
                <textarea value={knowledgeForm.content} onChange={(event) => setKnowledgeForm((form) => ({ ...form, content: event.target.value }))} maxLength={12000} rows={5} className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={knowledgeSaving || !knowledgeForm.title.trim() || !knowledgeForm.content.trim()} onClick={() => void saveKnowledgeEntry()} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {knowledgeSaving ? "Saving…" : knowledgeForm.id ? "Save changes" : "Add entry"}
              </button>
              {knowledgeForm.id ? <button type="button" onClick={() => setKnowledgeForm(EMPTY_KNOWLEDGE_FORM)} className="min-h-10 rounded-lg border border-border px-4 text-sm font-semibold">Cancel edit</button> : null}
            </div>
          </div>
          <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
            {knowledgeEntries.length ? knowledgeEntries.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{entry.title}</p>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold">{entry.status}</span>
                    <span className="text-xs text-muted-foreground">{entry.category}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{entry.content}</p>
                  {entry.tags?.length ? <p className="mt-1 text-xs text-muted-foreground">Tags: {entry.tags.join(", ")}</p> : null}
                </div>
                <button type="button" onClick={() => setKnowledgeForm({ id: entry.id, title: entry.title, category: entry.category, content: entry.content, tags: (entry.tags || []).join(", "), source: entry.source || "", status: entry.status })} className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold">Edit</button>
              </div>
            )) : <p className="py-4 text-sm text-muted-foreground">No global knowledge entries yet.</p>}
          </div>
        </div>
      ) : null}

      {tab === "Evaluations" ? (
        <Card title="Fixera Evaluator">
          <p>Schema failures: {data?.observability?.schemaFailures ?? 0}</p>
          <p>Evaluator failures: {data?.observability?.evaluatorFailures ?? 0}</p>
          <p>Safety rejections stay in the evaluation set and are never promoted as good training examples.</p>
        </Card>
      ) : null}

      {tab === "Pricing" ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="ZIP"
              className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Category"
              className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button type="button" onClick={() => void loadPricing()} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">
              Compare
            </button>
          </div>
          <Card title="Pricing intelligence">
            <p>{pricing?.authority || "Admin pricing rules remain authoritative."}</p>
            <p>Level: {pricing?.comparisonLevel || "—"}</p>
            <p>Confidence: {pricing?.confidence || "—"}</p>
            <p>Sample: {pricing?.sampleSize ?? "—"}</p>
            <p>Median: {pricing?.median != null ? `$${pricing.median}` : "—"}</p>
            <p>
              Typical range: {pricing?.typicalRange ? `$${pricing.typicalRange.low}–$${pricing.typicalRange.high}` : "Insufficient history"}
            </p>
            <p>{pricing?.evaluation?.fact || pricing?.homeownerSafeSummary || "No quote comparison loaded."}</p>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
