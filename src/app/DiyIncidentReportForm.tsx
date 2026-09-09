import { useState } from "react";
import { Loader2 } from "lucide-react";
import { submitDiyIncidentReport, type DiyIncidentType } from "./diySafetyApi";

const INCIDENT_OPTIONS: { value: DiyIncidentType; label: string }[] = [
  { value: "safety_concern", label: "Safety concern" },
  { value: "injury", label: "Injury" },
  { value: "property_damage", label: "Property damage" },
  { value: "gas_event", label: "Gas event" },
  { value: "electrical_event", label: "Electrical event" },
  { value: "fire_smoke", label: "Fire / smoke" },
  { value: "water_damage", label: "Water damage" },
  { value: "biohazard", label: "Biohazard" },
  { value: "other_serious", label: "Other serious incident" },
];

export default function DiyIncidentReportForm({ jobId }: { jobId?: number }) {
  const [open, setOpen] = useState(false);
  const [incidentType, setIncidentType] = useState<DiyIncidentType>("safety_concern");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!description.trim() || busy) return;
    setBusy(true);
    const r = await submitDiyIncidentReport({
      jobId,
      incidentType,
      description: description.trim(),
    });
    setBusy(false);
    if (r.ok) {
      setSent(true);
      setOpen(false);
    }
  }

  if (sent) {
    return (
      <p className="text-xs text-muted-foreground">
        Incident report submitted. If there is immediate danger, contact emergency services first.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-semibold text-primary hover:underline"
      >
        Report a Safety Issue / Injury / Property Damage
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            For immediate emergencies, contact emergency services or your utility first. This form is for follow-up
            reporting.
          </p>
          <select
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value as DiyIncidentType)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
          >
            {INCIDENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe what happened…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
          />
          <button
            type="button"
            disabled={busy || !description.trim()}
            onClick={() => void submit()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Submit report
          </button>
        </div>
      ) : null}
    </div>
  );
}
