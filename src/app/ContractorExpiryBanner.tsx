import { FileWarning, ShieldAlert } from "lucide-react";
import {
  expiryBadgeClass,
  expiryLabel,
  type CredentialExpiryItem,
} from "./contractorExpiry";

/** Inline dashboard banner — not a modal. */
export default function ContractorExpiryBanner({
  items,
  onUpdate,
}: {
  items: CredentialExpiryItem[];
  onUpdate: () => void;
}) {
  if (!items.length) return null;

  const hasBlocking = items.some((i) => i.severity === "expired" || i.severity === "missing");

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 ${
        hasBlocking
          ? "border-red-500/35 bg-red-500/5"
          : "border-amber-500/35 bg-amber-500/5"
      }`}
      role="region"
      aria-label="Credential expiration reminders"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert
          className={`mt-0.5 h-5 w-5 shrink-0 ${hasBlocking ? "text-red-600" : "text-amber-600"}`}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-bold">
              {hasBlocking ? "Credentials need attention" : "Upcoming credential expirations"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Keep your license and insurance current so you stay eligible for new jobs.
            </p>
          </div>

          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex gap-2.5 rounded-xl border border-border/60 bg-card/80 px-3 py-2.5">
                <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${expiryBadgeClass(item.severity)}`}
                    >
                      {expiryLabel(item.severity)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.message}</p>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onUpdate}
            className="rounded-xl bg-[#FF4D1C] px-4 py-2 text-xs font-semibold text-white hover:brightness-105"
          >
            Update details
          </button>
        </div>
      </div>
    </div>
  );
}
