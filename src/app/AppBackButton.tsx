import { ArrowLeft } from "lucide-react";

type Props = {
  onBack: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
};

/** Controlled back navigation — never uses raw browser history. */
export default function AppBackButton({
  onBack,
  disabled,
  label = "Back",
  className = "",
}: Props) {
  if (disabled) return null;

  return (
    <button
      type="button"
      onClick={onBack}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-primary outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/40 ${className}`}
      aria-label="Go back"
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </button>
  );
}
