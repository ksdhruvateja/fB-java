import { motion } from "motion/react";
import { Camera, CheckCircle2 } from "lucide-react";
import { AuthFieldLabel, authInputClass } from "./AuthShell";
import AddressAutocompleteField from "./AddressAutocompleteField";
import ServiceAdaptiveQuestions from "./ServiceAdaptiveQuestions";
import {
  SERVICE_TRADE_OPTIONS,
  SERVICE_LOCATION_OPTIONS,
  serviceRequestTitle,
  type AdaptiveAnswers,
  type ServiceLocation,
  type ServiceTradeId,
} from "./serviceRequestFlow";
import { normalizeZip } from "./zipCode";

type Props = {
  reportStep: 0 | 1 | 2 | 3;
  reportTradeId: ServiceTradeId | "";
  setReportTradeId: (id: ServiceTradeId | "") => void;
  reportLocation: ServiceLocation | "";
  setReportLocation: (loc: ServiceLocation | "") => void;
  reportDescription: string;
  setReportDescription: (v: string) => void;
  adaptiveAnswers: AdaptiveAnswers;
  setAdaptiveAnswers: (a: AdaptiveAnswers) => void;
  mediaDataUrl: string | null;
  mediaType: string | null;
  mediaName: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  reportAddressLine1: string;
  reportAddressLine2: string;
  reportCity: string;
  reportState: string;
  reportZip: string;
  setReportAddressLine1: (v: string) => void;
  setReportAddressLine2: (v: string) => void;
  setReportCity: (v: string) => void;
  setReportState: (v: string) => void;
  setReportZip: (v: string) => void;
  setError: (e: string) => void;
};

export function GuestReportSummary({
  reportLocation,
  reportTradeId,
  reportDescription,
  reportAddressLine1,
  reportAddressLine2,
  reportCity,
  reportState,
  reportZip,
}: {
  reportLocation: ServiceLocation | "";
  reportTradeId: ServiceTradeId | "";
  reportDescription: string;
  reportAddressLine1: string;
  reportAddressLine2: string;
  reportCity: string;
  reportState: string;
  reportZip: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-sm dark:border-border dark:bg-muted/20">
      <p className="font-semibold text-foreground">
        {reportLocation && reportTradeId ? serviceRequestTitle(reportLocation, reportTradeId) : "Service request"}
      </p>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{reportDescription}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {[reportAddressLine1, reportAddressLine2, reportCity, reportState, reportZip].filter(Boolean).join(", ")}
      </p>
    </div>
  );
}

export default function GuestReportSteps(props: Props) {
  const {
    reportStep,
    reportTradeId,
    setReportTradeId,
    reportLocation,
    setReportLocation,
    reportDescription,
    setReportDescription,
    adaptiveAnswers,
    setAdaptiveAnswers,
    mediaDataUrl,
    mediaType,
    mediaName,
    onFileChange,
    reportAddressLine1,
    reportAddressLine2,
    reportCity,
    reportState,
    reportZip,
    setReportAddressLine1,
    setReportAddressLine2,
    setReportCity,
    setReportState,
    setReportZip,
    setError,
  } = props;

  if (reportStep === 0) {
    return (
      <motion.div
        key="r0"
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -12 }}
        transition={{ duration: 0.22 }}
        className="space-y-3"
      >
        <p className="text-sm font-semibold">What do you need?</p>
        <p className="text-xs text-muted-foreground">Pick the closest match — AI refines the exact service.</p>
        <div className="grid grid-cols-2 gap-2.5">
          {SERVICE_TRADE_OPTIONS.map((opt) => {
            const selected = reportTradeId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setReportTradeId(opt.id);
                  setError("");
                }}
                className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${
                  selected
                    ? "border-neutral-900 bg-neutral-50 dark:border-primary dark:bg-primary/5"
                    : "border-neutral-200 bg-white dark:border-border dark:bg-background"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </motion.div>
    );
  }

  if (reportStep === 1) {
    return (
      <motion.div
        key="r1"
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -12 }}
        transition={{ duration: 0.22 }}
        className="space-y-3"
      >
        <p className="text-sm font-semibold">Where is it?</p>
        <p className="text-xs text-muted-foreground">Choose the area of your home.</p>
        <div className="grid grid-cols-2 gap-2.5">
          {SERVICE_LOCATION_OPTIONS.map((loc) => {
            const selected = reportLocation === loc;
            return (
              <button
                key={loc}
                type="button"
                onClick={() => {
                  setReportLocation(loc);
                  setError("");
                }}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                  selected
                    ? "border-neutral-900 bg-neutral-50 dark:border-primary dark:bg-primary/5"
                    : "border-neutral-200 bg-white dark:border-border dark:bg-background"
                }`}
              >
                {loc}
              </button>
            );
          })}
        </div>
      </motion.div>
    );
  }

  if (reportStep === 2) {
    return (
      <motion.div
        key="r2"
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -12 }}
        transition={{ duration: 0.22 }}
        className="space-y-4"
      >
        <div>
          <AuthFieldLabel soft>Tell us what happened</AuthFieldLabel>
          <textarea
            rows={3}
            placeholder="What's happening? When did it start?"
            value={reportDescription}
            onChange={(e) => setReportDescription(e.target.value)}
            className={`${authInputClass} min-h-[96px] resize-y`}
          />
        </div>
        <div>
          <AuthFieldLabel soft>Photo or video (optional)</AuthFieldLabel>
          <label className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center transition hover:border-neutral-400 hover:bg-white dark:border-border dark:bg-muted/20">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary transition group-hover:scale-105">
              {mediaDataUrl ? <CheckCircle2 size={20} /> : <Camera size={20} />}
            </span>
            <span className="text-sm font-medium">
              {mediaDataUrl ? mediaName || "Media attached" : "Tap to add photo or video"}
            </span>
            <input type="file" accept="image/*,video/*" onChange={onFileChange} className="hidden" />
          </label>
        </div>
        {reportTradeId ? (
          <ServiceAdaptiveQuestions tradeId={reportTradeId} answers={adaptiveAnswers} onChange={setAdaptiveAnswers} />
        ) : null}
        <AddressAutocompleteField
          idPrefix="report-guest"
          requireAuth={false}
          streetAddress={reportAddressLine1}
          unit={reportAddressLine2}
          city={reportCity}
          state={reportState}
          zip={reportZip}
          onStreetAddressChange={setReportAddressLine1}
          onUnitChange={setReportAddressLine2}
          onCityChange={setReportCity}
          onStateChange={setReportState}
          onZipChange={(v) => setReportZip(normalizeZip(v))}
        />
      </motion.div>
    );
  }

  return null;
}
