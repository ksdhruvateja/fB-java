import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import type { ManagedJob, Property } from "./managedJobs";
import { useProFeature } from "./ProFeatureProvider";
import {
  fetchQuoteSecondOpinion,
  sendHomeAssistantMessage,
  type AssistantAction,
  type AssistantChatMessage,
} from "./homeAssistantApi";
import type { ProFeatureId } from "./proFeatures";
import { saveAssistantHandoff } from "./assistantHandoff";
import { PREFERRED_PROVIDER_PRIORITY_COPY } from "./preferredProviderCopy";
import {
  inferRecurrenceFromText,
  inferRecurringServiceType,
  saveRecurringHandoff,
} from "./recurringHandoff";

const STARTER_PROMPTS = [
  "There's water around my water heater.",
  "My AC isn't cooling well.",
  "Does my latest quote look reasonable?",
  "I need someone to clean every two weeks.",
];

function formatQuoteOpinion(op: {
  summary?: string;
  scopeReview?: string;
  pricingContext?: string;
  thingsToAsk?: string | string[];
  recommendation?: string;
  disclaimer?: string;
}) {
  const parts: string[] = [];
  if (op.summary) parts.push(op.summary);
  if (op.scopeReview) parts.push(`**Scope:** ${op.scopeReview}`);
  if (op.pricingContext) parts.push(`**Pricing context:** ${op.pricingContext}`);
  const ask = Array.isArray(op.thingsToAsk) ? op.thingsToAsk.join("; ") : op.thingsToAsk;
  if (ask) parts.push(`**Questions to consider:** ${ask}`);
  if (op.recommendation) parts.push(op.recommendation);
  if (op.disclaimer) parts.push(`_${op.disclaimer}_`);
  return parts.join("\n\n");
}

export default function HomeAssistantPanel({
  properties,
  propertyId,
  jobs,
  onStartReport,
  onOpenRecurring,
  onOpenJob,
}: {
  properties: Property[];
  propertyId?: number | null;
  jobs: ManagedJob[];
  onStartReport?: () => void;
  onOpenRecurring?: () => void;
  onOpenJob?: (jobId: number) => void;
}) {
  const { requestFeature, openUpgrade } = useProFeature();
  const [messages, setMessages] = useState<AssistantChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi — I'm your FixBridge Home Assistant. Tell me what's going on and I'll use what we already know about your home to guide you safely.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [riskLevel, setRiskLevel] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const property = properties.find((p) => p.id === propertyId) || properties[0] || null;
  const activeJob = jobs.find((j) => !["completed", "closed", "cancelled"].includes(String(j.status).toLowerCase()));
  const quotedJob =
    activeJob ||
    jobs.find((j) => j.customerRetailEstimateHigh != null || j.status === "awaiting_customer_approval");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const userMsg: AssistantChatMessage = { role: "user", content: text.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setActions([]);

    const r = await sendHomeAssistantMessage({
      messages: nextMessages,
      propertyId: property?.id ?? null,
      jobId: quotedJob?.id ?? null,
      intent: text.trim(),
    });

    setBusy(false);

    if (!r.ok) {
      if (r.code === "PRO_SUBSCRIPTION_REQUIRED" && r.feature) {
        openUpgrade(r.feature as ProFeatureId, "home-assistant");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Property-aware assistance is part of HomeCare Pro. Upgrade to continue with full home memory." },
        ]);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "AI assistance is temporarily unavailable. You can still request service directly — use Request Service below or the main menu.",
        },
      ]);
      setActions([{ id: "remote_quote", label: "Request Service" }]);
      return;
    }

    setRiskLevel(r.riskLevel || null);
    setActions(r.suggestedActions || []);
    setMessages((prev) => [...prev, { role: "assistant", content: r.reply || "How can I help?" }]);
  }

  function buildHandoff(intent: "remote_quote" | "site_visit" | "diy") {
    const userLines = messages.filter((m) => m.role === "user").map((m) => m.content);
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
    const issue = userLines.join("\n").trim();
    const lower = issue.toLowerCase();
    let category = "Others";
    if (/plumb|leak|drain|water|sink|toilet/.test(lower)) category = "Plumbing";
    else if (/hvac|ac\b|furnace|heat|cool/.test(lower)) category = "HVAC & Heating/Cooling";
    else if (/electric|outlet|breaker|light/.test(lower)) category = "Electrical";
    else if (/roof|gutter/.test(lower)) category = "Roofing & Gutters";
    else if (/appliance|fridge|dishwasher|washer|dryer/.test(lower)) category = "Appliances";
    else if (/clean/.test(lower)) category = "Cleaning";
    else if (/landscap|mow|lawn/.test(lower)) category = "Landscaping";

    saveAssistantHandoff({
      propertyId: property?.id ?? null,
      category,
      title: issue.split("\n")[0]?.slice(0, 120) || "Service request from Home Assistant",
      description: issue.slice(0, 2800),
      intent,
      assistantSummary: lastAssistant.slice(0, 500),
    });
  }

  function openRecurringWithPrefill(actionId: string) {
    const userText = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ");
    const serviceType =
      actionId === "recurring_landscaping"
        ? "recurring_landscaping"
        : inferRecurringServiceType(userText) || "recurring_cleaning";
    const feature = serviceType === "recurring_landscaping" ? "recurring_landscaping" : "recurring_cleaning";
    if (!requestFeature(feature, "home-assistant")) return;
    saveRecurringHandoff({
      propertyId: property?.id ?? null,
      serviceType,
      recurrence: inferRecurrenceFromText(userText) || "biweekly",
      openAdd: true,
    });
    onOpenRecurring?.();
  }

  async function handleAction(action: AssistantAction) {
    if (action.id === "diy") {
      buildHandoff("diy");
      onStartReport?.();
      return;
    }
    if (action.id === "remote_quote") {
      buildHandoff("remote_quote");
      onStartReport?.();
      return;
    }
    if (action.id === "site_visit") {
      buildHandoff("site_visit");
      onStartReport?.();
      return;
    }
    if (action.id === "recurring_cleaning" || action.id === "recurring_landscaping") {
      openRecurringWithPrefill(action.id);
      return;
    }
    if (action.id === "quote_second_opinion") {
      const jobId = quotedJob?.id;
      if (!jobId) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "I don't see an active quote on file. Open a job with a quote first, or request service to get a new estimate." },
        ]);
        return;
      }
      if (!requestFeature("quote_second_opinion", "home-assistant")) return;
      setBusy(true);
      const r = await fetchQuoteSecondOpinion(jobId);
      setBusy(false);
      if (!r.ok) {
        if (r.code === "PRO_SUBSCRIPTION_REQUIRED" && r.feature) {
          openUpgrade(r.feature as ProFeatureId, "home-assistant");
          return;
        }
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: r.message || "Could not load quote review right now." },
        ]);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: r.opinion
            ? formatQuoteOpinion(r.opinion)
            : "I reviewed your quote but could not generate a summary. Open the job for full details.",
        },
      ]);
      setActions([{ id: "open_job_quote", label: "View Full Job Details" }]);
      return;
    }
    if (action.id === "open_job_quote" && quotedJob?.id) {
      onOpenJob?.(quotedJob.id);
    }
  }

  return (
    <div className="flex h-[min(70vh,640px)] flex-col rounded-[1.5rem] border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <p className="font-semibold">Home Assistant</p>
            <p className="text-xs text-muted-foreground">
              {property ? `Using memory for ${property.label || property.addressLine1}` : "Add a property for home-aware help"}
            </p>
          </div>
        </div>
        {riskLevel === "EMERGENCY" || riskLevel === "HIGH" ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            Safety priority: professional help recommended for this issue.
          </p>
        ) : null}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${
              m.role === "user" ? "ml-auto bg-primary text-white" : "bg-muted/60"
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
          </div>
        ) : null}
        {actions.length > 0 ? (
          <div className="space-y-2 pt-1">
            {actions.some((a) => a.id === "remote_quote" && a.label.includes("Same Provider")) ? (
              <p className="text-[11px] text-muted-foreground italic">{PREFERRED_PROVIDER_PRIORITY_COPY}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => void handleAction(a)}
                  disabled={busy}
                  className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {messages.length <= 1 ? (
        <div className="flex flex-wrap gap-2 border-t border-border/60 px-4 py-2">
          {STARTER_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => void send(p)}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              {p}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
          placeholder="Describe what's happening…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-white disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
