import type { AdaptiveAnswers, AdaptiveField } from "./serviceRequestFlow";
import { adaptiveFieldsForTrade } from "./serviceRequestFlow";

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: AdaptiveField;
  value: string | number | boolean | string[] | undefined;
  onChange: (id: string, next: string | number | boolean | string[]) => void;
}) {
  if (field.type === "select") {
    return (
      <select
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40"
        value={String(value ?? "")}
        onChange={(e) => onChange(field.id, e.target.value)}
      >
        <option value="">Select…</option>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        min={field.min}
        max={field.max}
        placeholder={field.placeholder}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40"
        value={value === undefined || value === "" ? "" : String(value)}
        onChange={(e) => onChange(field.id, e.target.value === "" ? "" : Number(e.target.value))}
      />
    );
  }

  if (field.type === "text") {
    return (
      <input
        type="text"
        placeholder={field.placeholder}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40"
        value={String(value ?? "")}
        onChange={(e) => onChange(field.id, e.target.value)}
      />
    );
  }

  const selected = Array.isArray(value) ? value : [];
  return (
    <div className="flex flex-wrap gap-2">
      {field.options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              const next = on ? selected.filter((v) => v !== o.value) : [...selected, o.value];
              onChange(field.id, next);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              on
                ? "border-primary bg-primary text-white"
                : "border-border bg-card hover:border-primary/40"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ServiceAdaptiveQuestions({
  tradeId,
  answers,
  onChange,
}: {
  tradeId: string;
  answers: AdaptiveAnswers;
  onChange: (answers: AdaptiveAnswers) => void;
}) {
  const { family, fields } = adaptiveFieldsForTrade(tradeId);
  if (!tradeId || fields.length === 0) return null;

  const heading =
    family === "cleaning"
      ? "Cleaning details"
      : family === "landscaping"
        ? "Outdoor service details"
        : "A few quick questions";

  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/15 p-4">
      <div>
        <p className="text-sm font-semibold">{heading}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Only what matters for this service — skip anything you&apos;re not sure about.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field.id} className={`grid gap-1.5 text-sm ${field.type === "checkbox" ? "sm:col-span-2" : ""}`}>
            <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
            <FieldControl
              field={field}
              value={answers[field.id]}
              onChange={(id, next) => onChange({ ...answers, [id]: next })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
