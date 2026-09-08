import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bookmark,
  Bot,
  Check,
  ChevronLeft,
  Droplets,
  Fan,
  HardHat,
  Home,
  Lightbulb,
  Paperclip,
  Refrigerator,
  Search,
  Send,
  Shield,
  Wrench,
  Zap,
} from "lucide-react";
import type { ChatMessage } from "../geminiAssessment";
import DiySafetyFeedback from "../DiySafetyFeedback";
import { asGuideSteps, guideVisual, type GuideStep } from "./diyGuideVisual";

export type DiyView = "home" | "step" | "chat" | "ideas" | "complete";

type Risk = "green" | "yellow" | "red";

type Props = {
  userName: string;
  jobId: number;
  title: string;
  category: string;
  selectedCategory?: string | null;
  assessmentCategory?: string | null;
  subcategory?: string | null;
  description?: string | null;
  findings?: string[];
  summary?: string | null;
  photoUrl?: string | null;
  risk: Risk;
  steps: string[];
  guideSteps?: Array<Record<string, unknown>>;
  tools: string[];
  materials: string[];
  causes: string[];
  stopConditions: string[];
  completionChecks?: string[];
  stepIndex: number;
  completed: Record<number, boolean>;
  bookmarked: boolean;
  savingStep: boolean;
  stepSaved: boolean;
  chatMessages: ChatMessage[];
  chatInput: string;
  chatBusy: boolean;
  chatBlocked: boolean;
  speakingText: string | null;
  onBack: () => void;
  onOpenStep: () => void;
  onOpenIdeas: () => void;
  onCompleteStep: () => void;
  onStepFeedback?: (kind: "worked" | "failed" | "different") => void;
  onToggleBookmark: () => void;
  onHire: () => void;
  onNotComfortable: () => void;
  onChatInput: (value: string) => void;
  onSendChat: (text?: string) => void;
  onSpeak: (text: string) => void;
  onUnsafeChat: () => void;
  view: DiyView;
  onView: (view: DiyView) => void;
};

const cardShadow = "shadow-[0_6px_20px_rgba(0,0,0,0.06)]";

function firstName(name: string) {
  const part = name.trim().split(/\s+/)[0];
  return part || "there";
}

function splitStep(raw: string) {
  const text = raw.replace(/^\d+[\).\s-]+/, "").trim();
  const match = text.match(/^(.{12,90}?[.!?])\s+([\s\S]+)$/);
  if (match) return { title: match[1].trim(), body: match[2].trim() };
  if (text.length > 88) return { title: text.slice(0, 84).trim() + "…", body: text };
  return { title: text || "Next step", body: "" };
}

export function DIYCategoryCard({
  title,
  description,
  icon,
  tone,
  onClick,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  tone: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[112px] flex-col items-start rounded-[20px] p-4 text-left transition active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E07A4A] ${tone} ${cardShadow}`}
    >
      <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-2xl bg-white/70 text-[#3d3a36]">{icon}</span>
      <span className="text-[16px] font-semibold text-[#2c2926]">{title}</span>
      <span className="mt-1 text-[13px] leading-snug text-[#5c574f]">{description}</span>
    </button>
  );
}

export function DIYProgressCard({ completed, total }: { completed: number; total: number }) {
  const safeTotal = Math.max(total, 1);
  const pct = Math.round((completed / safeTotal) * 100);
  const r = 28;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <section className={`rounded-[22px] bg-white p-4 ${cardShadow}`} aria-label="Your DIY progress">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8a847b]">Your DIY progress</p>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-[72px] w-[72px] shrink-0" aria-hidden>
          <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
            <circle cx="36" cy="36" r={r} fill="none" stroke="#EFE8DF" strokeWidth="7" />
            <circle
              cx="36"
              cy="36"
              r={r}
              fill="none"
              stroke="#E07A4A"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold text-[#2c2926]">
            {completed}/{total || 0}
          </span>
        </div>
        <div>
          <p className="text-[18px] font-semibold text-[#2c2926]">
            {completed} of {total || 0}
          </p>
          <p className="text-[14px] text-[#5c574f]">Steps completed</p>
          <p className="mt-1 text-[13px] text-[#7a746c]">Keep going — you’ve got this!</p>
        </div>
      </div>
    </section>
  );
}

export function DIYStepProgress({ current, total, completed }: { current: number; total: number; completed: Record<number, boolean> }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const done = !!completed[i] || i < current;
        const active = i === current;
        return (
          <li key={i} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                active
                  ? "bg-[#E07A4A] text-white"
                  : done
                    ? "bg-[#DDE8D2] text-[#3d4a34]"
                    : "bg-[#EFE8DF] text-[#8a847b]"
              }`}
              aria-current={active ? "step" : undefined}
            >
              {done && !active ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            {i < total - 1 ? <span className={`h-1 flex-1 rounded-full ${done ? "bg-[#E07A4A]/70" : "bg-[#EFE8DF]"}`} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function DIYSafetyBadge({ risk }: { risk: Risk }) {
  const map = {
    green: {
      label: "Low risk",
      detail: "Safe for most homeowners",
      className: "bg-[#DDE8D2] text-[#31402c]",
    },
    yellow: {
      label: "Use caution",
      detail: "Only do the limited checks you understand",
      className: "bg-[#F8E6AF] text-[#5a4520]",
    },
    red: {
      label: "Stop DIY",
      detail: "Request professional help",
      className: "bg-[#F6D5D0] text-[#7a3028]",
    },
  }[risk];
  return (
    <div className={`flex items-start gap-3 rounded-[20px] px-4 py-3 ${map.className}`} role="status">
      <Shield className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="text-[13px] font-semibold uppercase tracking-wide">{map.label}</p>
        <p className="text-[13px] leading-snug">{map.detail}</p>
      </div>
    </div>
  );
}

export function DIYToolChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#eadfd4] bg-white px-3 py-1.5 text-[13px] text-[#3d3a36]">
      <Wrench className="h-3.5 w-3.5 text-[#8a847b]" aria-hidden />
      {label}
    </span>
  );
}

export function DIYProTip({ text }: { text: string }) {
  return (
    <div className="flex gap-3 rounded-[20px] bg-[#F8E6AF]/70 px-4 py-3">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6230]" aria-hidden />
      <div>
        <p className="text-[13px] font-semibold text-[#5a4520]">Pro tip</p>
        <p className="mt-0.5 text-[14px] leading-relaxed text-[#4d4338]">{text}</p>
      </div>
    </div>
  );
}

export function DIYQuickAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-[18px] bg-white px-3 py-3 text-left text-[13px] font-medium text-[#2c2926] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E07A4A] ${cardShadow}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#F8F7F4] text-[#5c574f]">{icon}</span>
      {label}
    </button>
  );
}

export function DIYChatBubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: ReactNode;
}) {
  const mine = role === "user";
  return (
    <div className={`max-w-[88%] rounded-[18px] px-3.5 py-2.5 text-[14px] leading-relaxed ${mine ? "ml-auto bg-[#FADBCB] text-[#3d2c24]" : "bg-[#DDEAF7] text-[#243140]"}`}>
      {children}
    </div>
  );
}

export function DIYRepairSummaryCard({
  title,
  tone,
  children,
}: {
  title: string;
  tone: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-[22px] p-4 ${tone}`}>
      <h3 className="text-[16px] font-semibold text-[#2c2926]">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function DIYProfessionalCTA({ onClick, label = "Hire a Professional" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-full items-center justify-center gap-2 rounded-[16px] border border-[#eadfd4] bg-white px-4 py-3 text-[15px] font-semibold text-[#2c2926] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E07A4A]"
    >
      <HardHat className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}

function HeaderBar({ title, onBack, extra }: { title: string; onBack: () => void; extra?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#2c2926] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E07A4A]"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h2 className="min-w-0 flex-1 truncate text-[18px] font-semibold text-[#2c2926]">{title}</h2>
      {extra}
    </div>
  );
}

type CategorySource = "user_selected" | "ai_detected" | "service_request" | "assessment";

type CategoryGuess = {
  id: string;
  title: string;
  subcategory: string;
  confidence: number;
  source: CategorySource;
  reason: string;
};

const CATEGORY_RULES: Array<{ id: string; title: string; match: RegExp }> = [
  { id: "plumbing", title: "Plumbing", match: /plumb|faucet|sink|toilet|drain|leak|water heater|pipe|shut-?off/i },
  { id: "electrical", title: "Electrical", match: /electr|outlet|switch|breaker|wiring|light/i },
  { id: "hvac", title: "HVAC", match: /hvac|heat|cool|filter|furnace|thermostat|condensate|air condition/i },
  { id: "appliances", title: "Appliances", match: /appliance|washer|dryer|fridge|refriger|dishwasher|oven/i },
  { id: "safety", title: "Safety Check", match: /safety|hazard|gas leak|carbon monoxide/i },
];

const SUBCATEGORY_RULES: Array<{ category: string; label: string; match: RegExp }> = [
  { category: "plumbing", label: "Kitchen Faucet Leak", match: /faucet|sink/i },
  { category: "plumbing", label: "Toilet", match: /toilet/i },
  { category: "plumbing", label: "Drain", match: /drain|clog/i },
  { category: "plumbing", label: "Water Heater", match: /water heater/i },
  { category: "hvac", label: "Condensate drain", match: /condensate|drain pan/i },
  { category: "hvac", label: "Filter", match: /filter/i },
  { category: "hvac", label: "Thermostat", match: /thermostat/i },
  { category: "hvac", label: "AC not cooling", match: /not cooling|air condition|ac /i },
  { category: "appliances", label: "Refrigerator", match: /fridge|refriger/i },
  { category: "appliances", label: "Dishwasher", match: /dishwasher/i },
  { category: "appliances", label: "Washer", match: /washer|washing machine/i },
  { category: "electrical", label: "Outlet", match: /outlet|receptacle/i },
  { category: "electrical", label: "Switch or light", match: /switch|light/i },
];

function normalizeCategoryId(value?: string | null) {
  const text = String(value || "");
  return CATEGORY_RULES.find((rule) => rule.match.test(text) || rule.title.toLowerCase() === text.toLowerCase())?.id || "";
}

function guessFromText(text: string, source: CategorySource): CategoryGuess | null {
  const rule = CATEGORY_RULES.find((item) => item.match.test(text));
  if (!rule) return null;
  const sub = SUBCATEGORY_RULES.find((item) => item.category === rule.id && item.match.test(text));
  const hits = (text.match(rule.match) || []).length;
  return {
    id: rule.id,
    title: rule.title,
    subcategory: sub?.label || "",
    confidence: Math.min(0.95, 0.62 + hits * 0.08),
    source,
    reason: text.slice(0, 180),
  };
}

function sessionKey(jobId: number) {
  return `fixbridge-diy-category:${jobId}`;
}

function readConfirmedCategory(jobId: number): { id: string; subcategory: string } | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(jobId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; subcategory?: string };
    return parsed?.id ? { id: parsed.id, subcategory: parsed.subcategory || "" } : null;
  } catch {
    return null;
  }
}

function writeConfirmedCategory(jobId: number, id: string, subcategory: string, source: CategorySource) {
  try {
    sessionStorage.setItem(
      sessionKey(jobId),
      JSON.stringify({ id, subcategory, source, categoryConfirmed: true })
    );
  } catch {
    /* session confirmation is optional */
  }
}

export default function HomeownerDiyExperience(props: Props) {
  const {
    userName,
    title,
    category,
    selectedCategory,
    assessmentCategory,
    subcategory,
    description,
    findings,
    summary,
    photoUrl,
    risk,
    steps,
  guideSteps = [],
    tools,
    materials,
    causes,
    stopConditions,
    completionChecks = [],
    stepIndex,
    completed,
    bookmarked,
    savingStep,
    stepSaved,
    chatMessages,
    chatInput,
    chatBusy,
    chatBlocked,
    speakingText,
    onBack,
    onOpenStep,
    onOpenIdeas,
    onCompleteStep,
    onStepFeedback,
    onToggleBookmark,
    onHire,
    onNotComfortable,
    onChatInput,
    onSendChat,
    onSpeak,
    onUnsafeChat,
    jobId,
    view,
    onView,
  } = props;

  const chatEndRef = useRef<HTMLDivElement>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [confirmedId, setConfirmedId] = useState<string | null>(() => readConfirmedCategory(jobId)?.id || null);
  const doneCount = Object.values(completed).filter(Boolean).length;
  const guides = useMemo(() => asGuideSteps(guideSteps, steps), [guideSteps, steps]);
  const currentGuide: GuideStep | undefined = guides[stepIndex];
  const current = currentGuide?.instruction || steps[stepIndex] || "";
  const parsed = currentGuide
    ? { title: currentGuide.title, body: currentGuide.instruction }
    : splitStep(current);
  const visualUrl = currentGuide ? guideVisual(currentGuide, category) : null;
  const tip =
    stopConditions[0] ||
    "Work in a dry, well-lit area and stop if this step looks different from what you expected.";
  const toolList = tools.length ? tools : materials;
  const blocked = risk === "red";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatMessages, chatBusy, view]);

  const categories = useMemo(
    () => [
      { id: "plumbing", title: "Plumbing", description: "Leaks, faucets, toilets & more", icon: <Droplets className="h-4 w-4" />, tone: "bg-[#DDEAF7]", match: /plumb|faucet|leak|toilet|drain/i },
      { id: "electrical", title: "Electrical", description: "Lights, outlets, switches & more", icon: <Zap className="h-4 w-4" />, tone: "bg-[#F8E6AF]", match: /electr|outlet|switch|light/i },
      { id: "hvac", title: "HVAC", description: "Heating, cooling, filters & more", icon: <Fan className="h-4 w-4" />, tone: "bg-[#DDE8D2]", match: /hvac|heat|cool|filter|furnace/i },
      { id: "appliances", title: "Appliances", description: "Washers, dryers, refrigerators & more", icon: <Refrigerator className="h-4 w-4" />, tone: "bg-[#FADBCB]", match: /appliance|washer|dryer|fridge|refriger/i },
      { id: "safety", title: "Safety Check", description: "Keep your home safe and sound", icon: <Shield className="h-4 w-4" />, tone: "bg-[#E8E3F4]", match: /safety|hazard/i },
    ],
    []
  );

  const evidenceText = [title, description, summary, subcategory, ...(findings || [])].filter(Boolean).join(" ");
  const userPick = normalizeCategoryId(selectedCategory);
  const detected =
    guessFromText(evidenceText, photoUrl ? "ai_detected" : "assessment") ||
    guessFromText(String(assessmentCategory || ""), "assessment") ||
    guessFromText(String(category || ""), "service_request");
  const saved = readConfirmedCategory(jobId);
  const servicePick = normalizeCategoryId(category) || normalizeCategoryId(assessmentCategory);
  const workingId = confirmedId || saved?.id || userPick || detected?.id || servicePick || "";
  const working = categories.find((item) => item.id === workingId) || null;
  const detectedSub =
    saved?.subcategory ||
    subcategory ||
    SUBCATEGORY_RULES.find((item) => item.category === workingId && item.match.test(evidenceText))?.label ||
    detected?.subcategory ||
    "";
  const mismatch =
    Boolean(userPick && detected?.id && userPick !== detected.id && detected.confidence >= 0.75);
  const confidence = userPick ? Math.max(detected?.confidence || 0, 0.9) : detected?.confidence || 0;
  const showConfirm = !browseOpen && Boolean(working) && (confidence >= 0.55 || Boolean(userPick) || Boolean(servicePick));

  function confirmCategory(id: string, nextSubcategory: string, source: CategorySource) {
    setConfirmedId(id);
    setBrowseOpen(false);
    writeConfirmedCategory(jobId, id, nextSubcategory, source);
    if (!blocked) onOpenStep();
  }

  useEffect(() => {
    if (browseOpen || blocked || mismatch || !userPick || !working || confirmedId) return;
    const timer = window.setTimeout(() => {
      confirmCategory(working.id, detectedSub, "user_selected");
    }, 900);
    return () => window.clearTimeout(timer);
    // confirm once when the homeowner already chose this category
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, userPick, working?.id, mismatch, browseOpen, blocked, confirmedId]);

  function openGuided() {
    if (blocked) return;
    if (working) writeConfirmedCategory(jobId, working.id, detectedSub, userPick ? "user_selected" : "ai_detected");
    onOpenStep();
  }

  const chatPanel = (
    <section className="flex min-h-[420px] flex-col rounded-[22px] bg-white p-4 lg:min-h-[640px]" aria-label="DIY Chat">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#DDEAF7] text-[#31445c]">
          <Bot className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-[16px] font-semibold text-[#2c2926]">DIY Chat</h3>
          <p className="text-[12px] text-[#7a746c]">Ask about this repair, tools, or next steps</p>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {chatMessages.map((msg, idx) => (
          <div key={`${msg.role}-${idx}`} className={msg.role === "user" ? "flex justify-end" : ""}>
            <DIYChatBubble role={msg.role === "user" ? "user" : "assistant"}>
              <p className="whitespace-pre-line">{msg.content}</p>
              {msg.role === "assistant" ? (
                <div className="mt-2">
                  <DiySafetyFeedback
                    jobId={jobId}
                    riskLevel={risk}
                    messageIndex={idx}
                    chatExcerpt={msg.content}
                    onUnsafe={onUnsafeChat}
                  />
                  <button
                    type="button"
                    onClick={() => onSpeak(msg.content)}
                    className="mt-1 text-[11px] font-medium text-[#5c574f] underline-offset-2 hover:underline"
                  >
                    {speakingText === msg.content ? "Stop reading" : "Read aloud"}
                  </button>
                </div>
              ) : null}
            </DIYChatBubble>
          </div>
        ))}
        {chatBusy ? (
          <DIYChatBubble role="assistant">FixBridge is thinking...</DIYChatBubble>
        ) : null}
        <div ref={chatEndRef} />
      </div>
      <div className="mt-3">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Try these quick options</p>
        <div className="grid grid-cols-2 gap-2">
          <DIYQuickAction label="What should I check first?" icon={<Search className="h-4 w-4" />} onClick={() => onSendChat("What should I check first?")} />
          <DIYQuickAction label="Show tools needed" icon={<Wrench className="h-4 w-4" />} onClick={() => onSendChat("Show tools needed")} />
          <DIYQuickAction label="Is this safe to DIY?" icon={<Shield className="h-4 w-4" />} onClick={() => onSendChat("Is this safe to DIY?")} />
          <DIYQuickAction label="Get repair ideas" icon={<Lightbulb className="h-4 w-4" />} onClick={() => onSendChat("Get repair ideas")} />
        </div>
      </div>
      <form
        className="sticky bottom-0 mt-3 flex items-center gap-2 rounded-full border border-[#eadfd4] bg-[#F8F7F4] px-2 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (chatBlocked) return;
          onSendChat();
        }}
      >
        <button
          type="button"
          aria-label="Attach a note about the existing repair photo"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#5c574f]"
          onClick={() => onSendChat(photoUrl ? "Please use the photo already attached to this repair." : "I don't have a new photo. Continue from the description.")}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          value={chatInput}
          onChange={(e) => onChatInput(e.target.value)}
          disabled={chatBusy || chatBlocked}
          placeholder={chatBlocked ? "Chat paused — request a professional" : "Type a message..."}
          aria-label="Message the DIY assistant"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-[#2c2926] outline-none placeholder:text-[#8a847b]"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={chatBusy || chatBlocked || !chatInput.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E07A4A] text-white disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );

  const landing = (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#E07A4A]">FixBridge DIY</p>
          <h2 className="mt-1 text-[30px] font-semibold leading-tight text-[#2c2926]">Hi {firstName(userName)}!</h2>
          <p className="mt-1 max-w-sm text-[15px] text-[#5c574f]">A more comfortable home is always within reach.</p>
        </div>
        <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#FADBCB] text-[#8a4b32]" aria-hidden>
          <Home className="h-7 w-7" />
        </div>
      </div>
      <DIYProgressCard completed={doneCount} total={steps.length} />
      {showConfirm && working ? (
        <section className={`rounded-[22px] bg-white p-4 ${cardShadow}`} aria-label="Category confirmation">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8a847b]">
            {mismatch ? "This photo appears to be a different issue" : userPick ? "Category confirmed" : "We think this is a match"}
          </p>
          <h3 className="mt-2 text-[22px] font-semibold text-[#2c2926]">
            {mismatch ? detected?.title : working.title}
          </h3>
          {detectedSub ? <p className="mt-1 text-[15px] text-[#5c574f]">{detectedSub}</p> : null}
          <p className="mt-2 text-[14px] leading-relaxed text-[#5c574f]">
            {mismatch
              ? `This photo appears to be related to ${detected?.title} rather than ${working.title}.`
              : photoUrl
                ? `Based on your photo, this appears to be a ${working.title.toLowerCase()} issue${detectedSub ? ` involving ${detectedSub.toLowerCase()}` : ""}.`
                : `We'll continue with ${working.title}${detectedSub ? ` — ${detectedSub}` : ""}.`}
          </p>
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() =>
                confirmCategory(
                  mismatch ? detected!.id : working.id,
                  mismatch ? detected?.subcategory || detectedSub : detectedSub,
                  userPick && !mismatch ? "user_selected" : "ai_detected"
                )
              }
              className="inline-flex w-full items-center justify-center rounded-[16px] bg-[#E07A4A] px-4 py-3.5 text-[16px] font-semibold text-white"
            >
              {mismatch ? `Use ${detected?.title}` : "Confirm & Continue"}
            </button>
            {mismatch ? (
              <button
                type="button"
                onClick={() => confirmCategory(working.id, detectedSub, "user_selected")}
                className="inline-flex w-full items-center justify-center rounded-[16px] border border-[#eadfd4] bg-white px-4 py-3 text-[15px] font-semibold text-[#2c2926]"
              >
                Keep {working.title}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setBrowseOpen(true)}
              className="w-full py-2 text-[14px] font-medium text-[#5c574f] underline-offset-2 hover:underline"
            >
              Change category
            </button>
          </div>
        </section>
      ) : browseOpen || (!steps.length && !summary) ? (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-[20px] font-semibold text-[#2c2926]">Browse by Category</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((item) => (
              <DIYCategoryCard
                key={item.id}
                title={item.title}
                description={item.description}
                icon={item.icon}
                tone={item.tone}
                onClick={() => confirmCategory(item.id, "", "user_selected")}
              />
            ))}
          </div>
        </>
      ) : null}
      {steps.length > 0 && !blocked ? (
        <div>
          <h3 className="mb-3 text-[20px] font-semibold text-[#2c2926]">Continue your repair</h3>
          <button
            type="button"
            onClick={openGuided}
            className={`flex w-full items-center gap-3 rounded-[22px] bg-white p-3 text-left ${cardShadow}`}
          >
            <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-[#DDEAF7] text-[#31445c]">
              {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : <Wrench className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-semibold text-[#2c2926]">{title}</span>
              <span className="mt-0.5 block text-[13px] text-[#7a746c]">
                Step {Math.min(stepIndex + 1, steps.length)} of {steps.length}
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#EFE8DF]">
                <span
                  className="block h-full rounded-full bg-[#E07A4A]"
                  style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }}
                />
              </span>
            </span>
          </button>
        </div>
      ) : null}
      {blocked ? (
        <div className="space-y-3">
          <DIYSafetyBadge risk="red" />
          <p className="text-[14px] text-[#5c574f]">Repair steps stay hidden for this safety risk.</p>
          <DIYProfessionalCTA onClick={onHire} label="Request professional help" />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onOpenIdeas} className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#2c2926]">
          Repair ideas
        </button>
        <button type="button" onClick={() => onView("chat")} className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#2c2926] lg:hidden">
          DIY Chat
        </button>
      </div>
      <p className="text-[12px] text-[#8a847b]">Current repair: {category || title}</p>
    </div>
  );

  const stepScreen = (
    <div className="space-y-4">
      <HeaderBar
        title={title}
        onBack={onBack}
        extra={
          <button
            type="button"
            onClick={onToggleBookmark}
            aria-label={bookmarked ? "Remove bookmark" : "Save this repair"}
            aria-pressed={bookmarked}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#2c2926]"
          >
            <Bookmark className={`h-4 w-4 ${bookmarked ? "fill-[#E07A4A] text-[#E07A4A]" : ""}`} />
          </button>
        }
      />
      <p className="text-[13px] font-medium text-[#7a746c]">Guided by Fixa · Step {stepIndex + 1} of {steps.length || 1}</p>
      {steps.length > 0 ? <DIYStepProgress current={stepIndex} total={steps.length} completed={completed} /> : null}
      <DIYSafetyBadge risk={risk} />
      {blocked ? (
        <div className="space-y-3 rounded-[22px] bg-white p-4">
          <h3 className="text-[26px] font-semibold text-[#2c2926]">Stop DIY</h3>
          <p className="text-[15px] leading-relaxed text-[#5c574f]">Request professional help. Unsafe steps are not shown.</p>
          <DIYProfessionalCTA onClick={onHire} label="Request professional help" />
        </div>
      ) : (
        <>
          <div className="rounded-[22px] bg-white p-4">
            <h3 className="text-[26px] font-semibold leading-tight text-[#2c2926]">{parsed.title}</h3>
            {currentGuide?.goal ? (
              <p className="mt-2 text-[14px] text-[#5c574f]">{currentGuide.goal}</p>
            ) : null}
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">What to do</p>
            <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-[#5c574f]">{currentGuide?.instruction || parsed.body || parsed.title}</p>
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Why this matters</p>
            <p className="mt-1 text-[15px] leading-relaxed text-[#5c574f]">
              {currentGuide?.explanation || "This check confirms the cause before any part is replaced."}
            </p>
          </div>
          <div className="overflow-hidden rounded-[22px] bg-[#EFE8DF]">
            {visualUrl ? (
              <img src={visualUrl} alt="" className="h-52 w-full object-cover" />
            ) : currentGuide?.image_needed ? (
              <div className="flex h-48 items-center justify-center text-[14px] text-[#8a847b]">Visual unavailable</div>
            ) : photoUrl ? (
              <img src={photoUrl} alt="" className="h-52 w-full object-cover" />
            ) : (
              <div className="flex h-48 items-center justify-center text-[#8a847b]">
                <Wrench className="h-10 w-10" aria-hidden />
              </div>
            )}
          </div>
          <div>
            <p className="mb-2 text-[14px] font-semibold text-[#2c2926]">Tools needed</p>
            <div className="flex flex-wrap gap-2">
              {(currentGuide?.tools?.length ? currentGuide.tools : toolList.length ? toolList : ["No special tools listed"]).map((tool) => (
                <DIYToolChip key={tool} label={tool} />
              ))}
            </div>
            {currentGuide?.materials?.length ? (
              <div className="mt-3">
                <p className="mb-2 text-[14px] font-semibold text-[#2c2926]">Materials</p>
                <div className="flex flex-wrap gap-2">
                  {currentGuide.materials.map((item) => (
                    <DIYToolChip key={item} label={item} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="rounded-[22px] bg-white p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Safety note</p>
            <p className="mt-1 text-[15px] leading-relaxed text-[#5c574f]">{currentGuide?.safety_note || tip}</p>
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">What you should look for</p>
            <p className="mt-1 text-[15px] leading-relaxed text-[#5c574f]">
              {currentGuide?.what_to_look_for || "A clear change from the condition you started with."}
            </p>
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">What you should see</p>
            <p className="mt-1 text-[15px] leading-relaxed text-[#5c574f]">
              {currentGuide?.expected_result || "The step finishes without a new leak, spark, odor, or unusual resistance."}
            </p>
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">If this does not happen</p>
            <p className="mt-1 text-[15px] leading-relaxed text-[#5c574f]">
              {currentGuide?.failure_signs || "Nothing changes, or a new problem appears."}
            </p>
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">What to do if it does not work</p>
            <p className="mt-1 text-[15px] leading-relaxed text-[#5c574f]">
              {currentGuide?.if_not || "Do not force the part. Use Hire a Professional and keep this step noted."}
            </p>
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">When to stop</p>
            <p className="mt-1 text-[15px] leading-relaxed text-[#5c574f]">
              {currentGuide?.when_to_stop || "Stop if you cannot complete this action safely."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => (onStepFeedback ? onStepFeedback("worked") : onCompleteStep())} className="rounded-[16px] bg-white px-3 py-3 text-[13px] font-semibold text-[#2c2926]">
              It worked
            </button>
            <button type="button" onClick={() => onStepFeedback?.("failed")} className="rounded-[16px] bg-white px-3 py-3 text-[13px] font-semibold text-[#2c2926]">
              It did not work
            </button>
            <button type="button" onClick={() => onStepFeedback?.("different")} className="rounded-[16px] bg-white px-3 py-3 text-[13px] font-semibold text-[#2c2926]">
              I see something different
            </button>
            <button type="button" onClick={onNotComfortable} className="rounded-[16px] bg-white px-3 py-3 text-[13px] font-semibold text-[#2c2926]">
              I am not comfortable continuing
            </button>
          </div>
          <div className="sticky bottom-3 space-y-2 bg-[#F8F7F4]/90 pb-1 pt-2 backdrop-blur-sm">
            <button
              type="button"
              onClick={onCompleteStep}
              disabled={!steps.length || savingStep}
              className="inline-flex w-full items-center justify-center rounded-[16px] bg-[#E07A4A] px-4 py-3.5 text-[16px] font-semibold text-white disabled:opacity-60"
            >
              {savingStep ? "Saving step" : stepSaved ? "Saved — next step" : "I completed this step"}
            </button>
            <DIYProfessionalCTA onClick={onHire} />
            <button
              type="button"
              onClick={onNotComfortable}
              className="w-full py-2 text-[14px] font-medium text-[#5c574f] underline-offset-2 hover:underline"
            >
              I’m not comfortable doing this
            </button>
          </div>
        </>
      )}
    </div>
  );

  const ideas = (
    <div className="space-y-4">
      <HeaderBar title="Repair Ideas" onBack={onBack} />
      <div className="rounded-[22px] bg-white p-4">
        <h3 className="text-[22px] font-semibold text-[#2c2926]">{title}</h3>
        <p className="mt-1 text-[14px] text-[#7a746c]">Simple fixes. Real results.</p>
      </div>
      <DIYRepairSummaryCard title="Possible Cause" tone="bg-[#DDE8D2]">
        <ul className="space-y-2 text-[14px] text-[#31402c]">
          {(causes.length ? causes : ["Review the assessment details before changing any parts."]).map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </DIYRepairSummaryCard>
      <DIYRepairSummaryCard title="Recommended Fix" tone="bg-[#DDEAF7]">
        <ol className="space-y-2">
          {(steps.length ? steps : ["Request a professional if no safe steps were generated."]).slice(0, 6).map((step, i) => (
            <li key={step} className="flex gap-3 text-[14px] text-[#243140]">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[12px] font-semibold">{i + 1}</span>
              <span>{splitStep(step).title}</span>
            </li>
          ))}
        </ol>
      </DIYRepairSummaryCard>
      <DIYRepairSummaryCard title="Tools Needed" tone="bg-[#F8E6AF]">
        <div className="flex flex-wrap gap-2">
          {(toolList.length ? toolList : ["None listed"]).map((tool) => (
            <DIYToolChip key={tool} label={tool} />
          ))}
        </div>
      </DIYRepairSummaryCard>
      <DIYRepairSummaryCard title="When to call a pro" tone="bg-[#FADBCB]">
        <ul className="space-y-2 text-[14px] text-[#5a3a28]">
          {(stopConditions.length
            ? stopConditions
            : [
                "The issue continues after the listed checks",
                "You see damaged parts or worsening conditions",
                "You’re uncomfortable continuing",
                "There is major leakage, sparking, or water damage",
              ]
          ).map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </DIYRepairSummaryCard>
      <div className="rounded-[22px] bg-white p-4">
        <p className="mb-2 text-[14px] font-semibold text-[#2c2926]">Need help?</p>
        <DIYProfessionalCTA onClick={onHire} />
      </div>
    </div>
  );

  const completeScreen = (
    <div className="space-y-4">
      <HeaderBar title="Verify the repair" onBack={onBack} />
      <div className="rounded-[22px] bg-white p-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Repair steps completed</p>
        <h3 className="mt-1 text-[26px] font-semibold text-[#2c2926]">Check the result before calling it fixed</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-[#5c574f]">
          Completing the steps does not prove the repair is finished. Confirm the original issue is gone.
        </p>
      </div>
      <div className="rounded-[22px] bg-white p-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Things to check now</p>
        <ul className="mt-2 space-y-2 text-[15px] leading-relaxed text-[#5c574f]">
          {(completionChecks.length ? completionChecks : ["The original problem no longer happens during a normal check."]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="grid gap-2">
        <button type="button" onClick={onBack} className="rounded-[16px] bg-[#E07A4A] px-4 py-3 text-[15px] font-semibold text-white">
          Issue Resolved
        </button>
        <button type="button" onClick={onHire} className="rounded-[16px] bg-white px-4 py-3 text-[15px] font-semibold text-[#2c2926]">
          Hire a Professional
        </button>
        <button type="button" onClick={onBack} className="rounded-[16px] bg-white px-4 py-3 text-[15px] font-semibold text-[#2c2926]">
          Return to Property
        </button>
      </div>
    </div>
  );

  const main = view === "complete" ? completeScreen : view === "step" ? stepScreen : view === "ideas" ? ideas : view === "chat" ? null : landing;

  return (
    <div className="rounded-[24px] bg-[#F8F7F4] p-4 text-[#2c2926] sm:p-5">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.85fr)]">
        <div className={view === "chat" ? "hidden lg:block" : ""}>{main}</div>
        <div className={view === "chat" ? "block" : "hidden lg:block"}>{chatPanel}</div>
      </div>
      <div className="mx-auto mt-4 flex max-w-6xl gap-2 lg:hidden">
        {(["home", "chat", "ideas"] as DiyView[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onView(id === "home" ? "home" : id)}
            className={`flex-1 rounded-full px-3 py-2 text-[12px] font-semibold ${view === id ? "bg-[#E07A4A] text-white" : "bg-white text-[#5c574f]"}`}
          >
            {id === "home" ? "Home" : id === "chat" ? "Chat" : "Ideas"}
          </button>
        ))}
      </div>
    </div>
  );
}
