import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, X } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { ApiError } from "./api";

/** Joins class names; later classes win over conflicting earlier ones (e.g. w-24 over w-full). */
export const cx = (...parts: Array<string | false | null | undefined>) => twMerge(...parts);

type Tone = "primary" | "secondary" | "ghost" | "danger" | "success";
const TONES: Record<Tone, string> = {
  primary: "bg-primary text-white hover:bg-primary/90 disabled:bg-primary/50",
  secondary: "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
  ghost: "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-400",
};

export function Button({
  tone = "primary",
  size = "md",
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "sm" | "md" | "lg" | "xl"; busy?: boolean }) {
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-5 py-3 text-base", xl: "px-6 py-5 text-lg" };
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70",
        TONES[tone],
        sizes[size],
        className
      )}
      disabled={busy || rest.disabled}
      {...rest}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  // Hint and error sit outside the <label> so the field's accessible name is just its label.
  return (
    <div className={cx("block text-sm", className)}>
      <label className="block">
        <span className="mb-1 block font-medium text-slate-800 dark:text-slate-200">{label}</span>
        {children}
      </label>
      {hint ? <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{error}</span> : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputClass, "min-h-[90px]", props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputClass, "pr-8", props.className)} />;
}

export function Card({ title, actions, children, className, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx("rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5", className)}>
      {title || actions ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const BADGE: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  blue: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
};
export function Badge({ tone = "slate", children, className }: { tone?: keyof typeof BADGE; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", BADGE[tone], className)}>{children}</span>;
}

export function statusTone(status: string): keyof typeof BADGE {
  if (["received"].includes(status)) return "amber";
  if (["awaiting_approval", "proposal_needed", "return_visit_needed"].includes(status)) return "orange";
  if (["in_progress", "accepted"].includes(status)) return "blue";
  if (["completed", "work_complete", "invoiced", "paid", "sent", "acknowledged"].includes(status)) return "green";
  if (["declined", "cancelled", "delivery_failed", "disputed", "void"].includes(status)) return "red";
  return "slate";
}

export function priorityTone(p: string): keyof typeof BADGE {
  return p === "emergency" ? "red" : p === "urgent" ? "orange" : p === "scheduled" ? "blue" : "slate";
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className={cx("max-h-[92svh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const checks: any[] = error instanceof ApiError ? error.body?.checks || error.body?.flags || [] : [];
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" role="alert">
      <p className="font-medium">{message}</p>
      {checks.length ? (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {checks.filter((c) => c.ok === false || c.message).map((c) => (
            <li key={c.code}>{c.label || c.message}{c.detail ? ` — ${c.detail}` : ""}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{children}</p>;
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function money(n: number | string | null | undefined) {
  if (n == null || n === "") return "—";
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function when(value: string | null | undefined, timeZone?: string) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-US", { timeZone: timeZone || undefined, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: timeZone ? "short" : undefined });
  } catch {
    return new Date(value).toLocaleString();
  }
}

/** Value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

/** Loads data and exposes reload; ignores responses that arrive after unmount. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const value = await loader();
      if (alive.current) {
        setData(value);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e);
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    alive.current = true;
    reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);
  return { data, error, loading, reload, setData };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Shrinks large photos before upload so they go through on a phone connection. */
export async function compressImage(file: File, maxSide = 1800): Promise<string> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return fileToDataUrl(file);
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return fileToDataUrl(file);
  }
}
