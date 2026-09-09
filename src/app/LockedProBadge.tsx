import { Lock } from "lucide-react";

export default function LockedProBadge({
  compact,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-[#4A90D9]/30 bg-[#4A90D9]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2f6fad] dark:text-[#8ec5ff] ${className}`}
    >
      <Lock className="h-3 w-3 shrink-0" aria-hidden />
      {compact ? "Pro" : "HomeCare Pro"}
    </span>
  );
}
