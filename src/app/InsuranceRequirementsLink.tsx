import { ExternalLink, FileText } from "lucide-react";
import { FIXBRIDGE_INSURANCE_REQUIREMENTS_PDF_URL } from "./contractorApplication";

type Props = {
  label?: string;
  className?: string;
  variant?: "button" | "link";
};

export default function InsuranceRequirementsLink({
  label = "View FixBridge Insurance Requirements / Sample COI",
  className = "",
  variant = "button",
}: Props) {
  const base =
    variant === "link"
      ? "inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      : "inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-card px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors";

  return (
    <a
      href={FIXBRIDGE_INSURANCE_REQUIREMENTS_PDF_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} ${className}`}
    >
      {variant === "button" ? <FileText className="h-4 w-4 shrink-0" /> : <ExternalLink className="h-3.5 w-3.5 shrink-0" />}
      {label}
    </a>
  );
}
