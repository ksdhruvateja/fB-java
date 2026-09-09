import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle,
  HardHat,
  Loader2,
  Mic,
  Sparkles,
  X,
} from "lucide-react";
import { useIsMobile } from "./components/ui/use-mobile";
import ServiceAdaptiveQuestions from "./ServiceAdaptiveQuestions";
import {
  SERVICE_LOCATION_OPTIONS,
  serviceRequestTitle,
  tradeToCategory,
  resolveRequestTradeId,
  inferTradeFromDescription,
  type AdaptiveAnswers,
  type ServiceLocation,
} from "./serviceRequestFlow";
import type { Property } from "./managedJobs";
import { AI_ASSESSMENT_DESCRIBE_FIRST } from "./aiAssessmentCopy";

function IntakeActionButtons({
  busy,
  description,
  onSubmitAi,
  onHirePro,
  preferHire,
}: {
  busy: boolean;
  description: string;
  onSubmitAi: () => void;
  onHirePro: () => void;
  preferHire?: boolean;
}) {
  const canAssess = Boolean(description.trim());
  return (
    <div className="space-y-2 border-t border-border/70 pt-5">
      <p className="text-sm font-semibold">{preferHire ? "Request a professional" : "What would you like to do next?"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {preferHire ? (
          <button
            type="button"
            disabled={busy || !canAssess}
            onClick={onHirePro}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#FF4D1C] px-4 py-3.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardHat className="h-4 w-4" />}
            Request Professional
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !canAssess}
            onClick={onSubmitAi}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#FF4D1C] px-4 py-3.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Get AI assessment
          </button>
        )}
        {preferHire ? (
          <button
            type="button"
            disabled={busy || !canAssess}
            onClick={onSubmitAi}
            className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-[#FF4D1C] px-4 py-3.5 text-sm font-medium text-[#FF4D1C] disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            Get AI assessment
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onHirePro}
            className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-[#FF4D1C] px-4 py-3.5 text-sm font-medium text-[#FF4D1C] disabled:opacity-60"
          >
            <HardHat className="h-4 w-4" />
            Hire a Professional
          </button>
        )}
      </div>
      {!canAssess ? <p className="text-xs text-muted-foreground">{AI_ASSESSMENT_DESCRIBE_FIRST}</p> : null}
    </div>
  );
}

export type IntakePhase = "location" | "describe" | "details";

export function normalizeIntakePhase(phase: string | null | undefined): IntakePhase {
  if (phase === "location" || phase === "describe" || phase === "details") return phase;
  return "describe";
}

const INTAKE_STEP_META: Record<IntakePhase, { step: number; title: string }> = {
  describe: { step: 1, title: "Describe the problem" },
  location: { step: 2, title: "Where is it?" },
  details: { step: 3, title: "Review & submit" },
};

const TOTAL_INTAKE_STEPS = 3;

type Props = {
  intakePhase: IntakePhase;
  setIntakePhase: (p: IntakePhase) => void;
  requestSystemId: string;
  setRequestSystemId: (id: string) => void;
  setCategory: (c: string) => void;
  issueArea: ServiceLocation | "";
  setIssueArea: (a: ServiceLocation | "") => void;
  description: string;
  setDescription: (d: string) => void;
  adaptiveAnswers: AdaptiveAnswers;
  setAdaptiveAnswers: (a: AdaptiveAnswers) => void;
  voiceListening: boolean;
  setVoiceListening: (v: boolean) => void;
  voiceRecRef: RefObject<{ stop: () => void } | null>;
  voiceBaseRef: RefObject<string>;
  fileRef: RefObject<HTMLInputElement | null>;
  videoRef: RefObject<HTMLInputElement | null>;
  onFile: (file: File | null) => void;
  mediaDataUrl: string | null;
  mediaType: string | null;
  propertyId: number | "";
  setPropertyId: (id: number | "") => void;
  properties: Property[];
  onAddAddress: () => void;
  partnerCode: string;
  setPartnerCode: (c: string) => void;
  partnerLookingUp: boolean;
  partnerInfo: { name: string; company?: string } | null;
  partnerConsent: boolean;
  setPartnerConsent: (v: boolean) => void;
  busy: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  onBack: () => void;
  onSubmitAi: () => void;
  onHirePro: () => void;
  preferHire?: boolean;
  onClearMedia?: () => void;
  draftSavedAt?: string | null;
};

function startVoiceInput(
  description: string,
  voiceRecRef: RefObject<{ stop: () => void } | null>,
  voiceBaseRef: RefObject<string>,
  setDescription: (d: string) => void,
  setVoiceListening: (v: boolean) => void,
  setError: (e: string | null) => void,
  voiceListening: boolean
) {
  type SpeechRec = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onerror: (() => void) | null;
    onresult: ((ev: {
      resultIndex: number;
      results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
    }) => void) | null;
  };
  const W = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const SpeechRecognition = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setError("Voice input isn't supported — type the problem or add a photo.");
    return;
  }
  setError(null);
  if (voiceListening) {
    try {
      voiceRecRef.current?.stop();
    } catch {
      /* ignore */
    }
    voiceRecRef.current = null;
    setVoiceListening(false);
    return;
  }
  voiceBaseRef.current = description.trim();
  const rec = new SpeechRecognition();
  voiceRecRef.current = rec;
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  rec.onstart = () => setVoiceListening(true);
  rec.onend = () => {
    voiceRecRef.current = null;
    setVoiceListening(false);
  };
  rec.onerror = () => {
    voiceRecRef.current = null;
    setVoiceListening(false);
    setError("Couldn't capture voice. Try typing instead.");
  };
  rec.onresult = (ev) => {
    let finalChunk = "";
    let interimChunk = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const piece = ev.results[i][0]?.transcript || "";
      if (ev.results[i].isFinal) finalChunk += piece;
      else interimChunk += piece;
    }
    if (finalChunk) {
      voiceBaseRef.current = [voiceBaseRef.current, finalChunk.trim()].filter(Boolean).join(" ").trim();
      setDescription(voiceBaseRef.current);
    } else if (interimChunk) {
      setDescription([voiceBaseRef.current, interimChunk.trim()].filter(Boolean).join(" ").trim());
    }
  };
  try {
    rec.start();
  } catch {
    setVoiceListening(false);
    setError("Couldn't start the microphone. Check browser permissions.");
  }
}

export default function HomeownerServiceIntake(props: Props) {
  const {
    intakePhase,
    setIntakePhase,
    requestSystemId,
    setRequestSystemId,
    setCategory,
    issueArea,
    setIssueArea,
    description,
    setDescription,
    adaptiveAnswers,
    setAdaptiveAnswers,
    voiceListening,
    setVoiceListening,
    voiceRecRef,
    voiceBaseRef,
    fileRef,
    videoRef,
    onFile,
    mediaDataUrl,
    mediaType,
    propertyId,
    setPropertyId,
    properties,
    onAddAddress,
    partnerCode,
    setPartnerCode,
    partnerLookingUp,
    partnerInfo,
    partnerConsent,
    setPartnerConsent,
    busy,
    error,
    setError,
    onBack,
    onSubmitAi,
    onHirePro,
    preferHire,
    onClearMedia,
    draftSavedAt,
  } = props;

  const isMobile = useIsMobile();
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "adding" | "added">("idle");
  const [previewOpen, setPreviewOpen] = useState(false);
  const safeIntakePhase = normalizeIntakePhase(intakePhase);
  const stepMeta = INTAKE_STEP_META[safeIntakePhase];
  const resolvedTradeId = resolveRequestTradeId(requestSystemId, description);

  useEffect(() => {
    if (!mediaDataUrl) {
      setUploadState("idle");
      setPreviewOpen(false);
      return;
    }
    setUploadState("added");
  }, [mediaDataUrl]);

  function addMedia(file: File | null) {
    if (!file) return;
    setUploadState("adding");
    onFile(file);
  }

  function goNextFromLocation() {
    if (!issueArea) {
      setError("Pick where the issue is to continue.");
      return;
    }
    setError(null);
    if (!requestSystemId) {
      const inferred = inferTradeFromDescription(description);
      setRequestSystemId(inferred);
      setCategory(tradeToCategory(inferred));
    }
    setIntakePhase("details");
  }

  function goNextFromDescribe() {
    if (!description.trim()) {
      setError("Describe the problem so we can analyze it.");
      return;
    }
    setError(null);
    if (!requestSystemId) {
      const inferred = inferTradeFromDescription(description);
      setRequestSystemId(inferred);
      setCategory(tradeToCategory(inferred));
    }
    setIntakePhase("location");
  }

  return (
    <div className="space-y-5 rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm sm:p-6 pb-24 sm:pb-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
          <span>
            Step {stepMeta.step} of {TOTAL_INTAKE_STEPS}
          </span>
          {draftSavedAt ? <span className="text-emerald-700 dark:text-emerald-400">Saved</span> : null}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(stepMeta.step / TOTAL_INTAKE_STEPS) * 100}%` }}
          />
        </div>
        <p className="text-sm font-semibold">{stepMeta.title}</p>
      </div>
      {error ? (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {safeIntakePhase === "describe" && (
        <div className="space-y-5">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <p className="text-lg font-semibold">Tell us what happened</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Type, speak, or upload photos or video. AI identifies the exact service and asks only what&apos;s missing.
            </p>
            {requestSystemId ? (
              <p className="mt-2 text-sm font-semibold">Selected service: {tradeToCategory(resolvedTradeId)}</p>
            ) : null}
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">What&apos;s going on?</span>
            <textarea
              rows={4}
              className={`rounded-2xl border bg-background px-4 py-3 outline-none focus:border-primary/40 ${
                voiceListening ? "border-primary ring-[3px] ring-primary/15" : "border-border"
              }`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={'e.g. "Water is leaking under the kitchen sink."'}
            />
          </label>
          <button
            type="button"
            onClick={() =>
              startVoiceInput(
                description,
                voiceRecRef,
                voiceBaseRef,
                setDescription,
                setVoiceListening,
                setError,
                voiceListening
              )
            }
            className={`inline-flex min-h-11 items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold ${
              voiceListening ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/20"
            }`}
          >
            <Mic className="h-4 w-4 text-primary" />
            {voiceListening ? "Listening…" : "Speak"}
          </button>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Add photos or videos</p>
            <p className="text-sm text-muted-foreground">Help us understand what&apos;s happening.</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => cameraRef.current?.click()} className="min-h-24 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-3 py-4 text-sm font-semibold">
                <Camera className="mx-auto mb-1 h-5 w-5 text-primary" />
                Take a photo
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className="min-h-24 rounded-2xl border border-dashed border-border px-3 py-4 text-sm font-semibold">
                Photo library
              </button>
              <button type="button" onClick={() => videoRef.current?.click()} className="min-h-24 rounded-2xl border border-dashed border-border px-3 py-4 text-sm font-semibold">
                Add video
              </button>
            </div>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => addMedia(e.target.files?.[0] || null)} />
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => addMedia(e.target.files?.[0] || null)} />
          <input
            ref={videoRef}
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(e) => addMedia(e.target.files?.[0] || null)}
          />
          {uploadState === "adding" ? <p className="text-sm text-muted-foreground">Adding photo…</p> : null}
          {mediaDataUrl ? (
            <div className="rounded-xl border border-border bg-muted/20 p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-emerald-700">Photo added</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPreviewOpen(true)} className="text-xs font-semibold text-primary">
                    View
                  </button>
                  <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-semibold">
                    Replace
                  </button>
                  {onClearMedia ? (
                    <button type="button" onClick={onClearMedia} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                      <X size={12} /> Remove
                    </button>
                  ) : null}
                </div>
              </div>
              <button type="button" onClick={() => setPreviewOpen(true)} className="block w-full">
                {mediaType === "image" ? (
                  <img src={mediaDataUrl} alt="Uploaded issue photo" className="max-h-48 w-full rounded-xl border object-contain" />
                ) : mediaType?.startsWith("video") ? (
                  <span className="flex min-h-24 items-center justify-center rounded-xl border text-sm font-semibold">Video attached</span>
                ) : null}
              </button>
            </div>
          ) : null}
          {previewOpen && mediaDataUrl ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Attachment preview">
              <div className="w-full max-w-lg rounded-2xl bg-card p-3">
                {mediaType === "image" ? (
                  <img src={mediaDataUrl} alt="Uploaded issue photo" className="max-h-[70vh] w-full object-contain" />
                ) : (
                  <video src={mediaDataUrl} controls className="max-h-[70vh] w-full" />
                )}
                <div className="mt-3 flex justify-end gap-2">
                  {onClearMedia ? (
                    <button type="button" onClick={() => { onClearMedia(); setPreviewOpen(false); }} className="min-h-11 rounded-xl border px-3 text-sm font-semibold">
                      Remove
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setPreviewOpen(false)} className="min-h-11 rounded-xl bg-primary px-3 text-sm font-semibold text-white">
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <IntakeActionButtons
            busy={busy}
            description={description}
            onSubmitAi={onSubmitAi}
            onHirePro={onHirePro}
            preferHire={preferHire}
          />
          <div className="hidden justify-end sm:flex">
            <button
              type="button"
              onClick={goNextFromDescribe}
              className="inline-flex items-center gap-2 rounded-2xl border border-border px-5 py-3 text-sm font-semibold text-foreground"
            >
              Continue <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {safeIntakePhase === "location" && (
        <div className="space-y-5">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <p className="text-lg font-semibold">Where is it?</p>
            <p className="mt-1 text-sm text-muted-foreground">Choose the area of your home.</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {SERVICE_LOCATION_OPTIONS.map((loc) => {
              const selected = issueArea === loc;
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => {
                    setIssueArea(loc);
                    setError(null);
                  }}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                    selected ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/35"
                  }`}
                >
                  {loc}
                </button>
              );
            })}
          </div>
          <IntakeActionButtons
            busy={busy}
            description={description}
            onSubmitAi={onSubmitAi}
            onHirePro={onHirePro}
            preferHire={preferHire}
          />
          <div className="hidden justify-end sm:flex">
            <button
              type="button"
              onClick={goNextFromLocation}
              className="inline-flex items-center gap-2 rounded-2xl border border-border px-5 py-3 text-sm font-semibold text-foreground"
            >
              Continue <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {safeIntakePhase === "details" && (
        <div className="space-y-5">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <ArrowLeft size={14} /> Back
          </button>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <p className="font-semibold">{serviceRequestTitle(issueArea, resolvedTradeId)}</p>
            <p className="mt-1 line-clamp-3 text-muted-foreground">{description}</p>
          </div>

          <ServiceAdaptiveQuestions tradeId={resolvedTradeId} answers={adaptiveAnswers} onChange={setAdaptiveAnswers} />

          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">
              Property address <span className="text-red-500">*</span>
            </span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Select property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label || p.addressLine1}
                </option>
              ))}
            </select>
            <button type="button" onClick={onAddAddress} className="text-xs font-semibold text-primary hover:underline self-start">
              Add a new address
            </button>
          </div>

          <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-semibold">Referral</p>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Referral code</span>
              <input
                className="rounded-md border border-border bg-background px-3 py-2 font-mono uppercase"
                value={partnerCode}
                onChange={(e) => setPartnerCode(e.target.value)}
                placeholder="Partner referral code"
              />
            </label>
            {partnerLookingUp && partnerCode.trim() ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up…
              </p>
            ) : partnerInfo ? (
              <div className="rounded-md border border-teal-500/30 bg-teal-500/10 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium text-teal-800 dark:text-teal-300">
                  <CheckCircle className="h-4 w-4" /> Referral applied
                </p>
                <p className="mt-1">
                  {partnerInfo.name}
                  {partnerInfo.company ? ` · ${partnerInfo.company}` : ""}
                </p>
                <label className="mt-3 flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={partnerConsent} onChange={(e) => setPartnerConsent(e.target.checked)} />
                  <span>Share approved status updates with this partner (no pricing or payment details).</span>
                </label>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Optional — from your referring partner.</p>
            )}
          </div>

          <IntakeActionButtons
            busy={busy}
            description={description}
            onSubmitAi={onSubmitAi}
            onHirePro={onHirePro}
            preferHire={preferHire}
          />
        </div>
      )}

      {isMobile && safeIntakePhase !== "details" ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (safeIntakePhase === "location") goNextFromLocation();
              else goNextFromDescribe();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            Continue <ArrowRight size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
