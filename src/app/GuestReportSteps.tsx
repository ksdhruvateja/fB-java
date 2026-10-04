import { ServiceThumb } from "./serviceVisuals";
import { useRef } from "react";
import { motion } from "motion/react";
import { Camera, CheckCircle2, Check, ImagePlus, X } from "lucide-react";
import { AuthFieldLabel } from "./AuthShell";
import AddressAutocompleteField from "./AddressAutocompleteField";
import ServiceAdaptiveQuestions from "./ServiceAdaptiveQuestions";
import { useAuthSurfaceStyles } from "./authSurfaceStyles";
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
  photoConfirmed: boolean;
  setPhotoConfirmed: (confirmed: boolean) => void;
  onClearMedia: () => void;
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
  const s = useAuthSurfaceStyles();

  return (
    <div className={`p-3.5 text-sm ${s.surface}`}>
      <p className={s.surfaceTitle}>
        {reportLocation && reportTradeId ? serviceRequestTitle(reportLocation, reportTradeId) : "Service request"}
      </p>
      <p className={`mt-1 line-clamp-2 text-xs ${s.surfaceMuted}`}>{reportDescription}</p>
      <p className={`mt-1 text-xs ${s.surfaceMuted}`}>
        {[reportAddressLine1, reportAddressLine2, reportCity, reportState, reportZip].filter(Boolean).join(", ")}
      </p>
    </div>
  );
}

export default function GuestReportSteps(props: Props) {
  const s = useAuthSurfaceStyles();
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
    photoConfirmed,
    setPhotoConfirmed,
    onClearMedia,
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
  const cameraInput = useRef<HTMLInputElement | null>(null);
  const photoInput = useRef<HTMLInputElement | null>(null);

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
        <p className={`text-sm ${s.heading}`}>What do you need?</p>
        <p className={`text-xs ${s.muted}`}>Pick the closest match — AI refines the exact service.</p>
        <div className="grid grid-cols-2 gap-2.5">
          {SERVICE_TRADE_OPTIONS.map((opt) => {
            const selected = reportTradeId === opt.id;
            return (
              <motion.button
                key={opt.id}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  setReportTradeId(opt.id);
                  setError("");
                }}
                className={`relative rounded-xl border px-3 py-3 text-left text-sm font-semibold transition active:scale-[0.98] ${s.optionButton(selected)}`}
              >
                {selected ? (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                    <Check size={12} strokeWidth={3} />
                  </span>
                ) : null}
                <span className="flex items-center gap-2"><ServiceThumb name={opt.label} serviceId={opt.id} className="h-10 w-10" /><span className="min-w-0">{opt.label}</span></span>
              </motion.button>
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
        <p className={`text-sm ${s.heading}`}>Where is it?</p>
        <p className={`text-xs ${s.muted}`}>Choose the area of your home.</p>
        <div className="grid grid-cols-2 gap-2.5">
          {SERVICE_LOCATION_OPTIONS.map((loc) => {
            const selected = reportLocation === loc;
            return (
              <motion.button
                key={loc}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  setReportLocation(loc);
                  setError("");
                }}
                className={`relative rounded-xl border px-3 py-3 text-sm font-semibold transition active:scale-[0.98] ${s.optionButton(selected)}`}
              >
                {selected ? (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                    <Check size={12} strokeWidth={3} />
                  </span>
                ) : null}
                {loc}
              </motion.button>
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
            className={`${s.input} min-h-[96px] resize-y`}
          />
        </div>
        <div>
          <AuthFieldLabel soft>Add a photo (optional)</AuthFieldLabel>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => cameraInput.current?.click()} className={`min-h-16 rounded-xl border px-3 py-3 text-sm font-semibold ${s.uploadZone}`}>
              <Camera className="mx-auto mb-1 h-5 w-5 text-primary" aria-hidden />
              Take Photo
            </button>
            <button type="button" onClick={() => photoInput.current?.click()} className={`min-h-16 rounded-xl border px-3 py-3 text-sm font-semibold ${s.uploadZone}`}>
              <ImagePlus className="mx-auto mb-1 h-5 w-5 text-primary" aria-hidden />
              Upload Photo
            </button>
          </div>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label="Take a photo with the camera" onChange={(event) => { onFileChange(event); event.currentTarget.value = ""; }} className="sr-only" />
          <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a photo from this device" onChange={(event) => { onFileChange(event); event.currentTarget.value = ""; }} className="sr-only" />
          {mediaDataUrl ? (
            <div className={`space-y-2 rounded-xl border p-3 ${s.uploadZone}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                  {photoConfirmed ? <CheckCircle2 size={15} /> : null}
                  {photoConfirmed ? "Photo confirmed" : "Photo selected"}
                </span>
                <div className="flex gap-3">
                  {!photoConfirmed ? <button type="button" onClick={() => setPhotoConfirmed(true)} className="text-xs font-semibold text-primary">Use this photo</button> : null}
                  <button type="button" onClick={() => { onClearMedia(); setPhotoConfirmed(false); }} aria-label="Remove photo" className="text-xs font-semibold text-muted-foreground"><X size={14} /></button>
                </div>
              </div>
              {mediaType?.startsWith("video") ? (
                <video src={mediaDataUrl} controls className="max-h-44 w-full rounded-lg" aria-label={mediaName || "Existing attached video"} />
              ) : (
                <img src={mediaDataUrl} alt={mediaName || "Selected repair photo"} className="max-h-44 w-full rounded-lg object-contain" />
              )}
            </div>
          ) : null}
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
