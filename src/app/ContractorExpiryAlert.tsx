import { AlertTriangle, FileWarning, ShieldAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  expiryBadgeClass,
  expiryLabel,
  type CredentialExpiryItem,
} from "./contractorExpiry";

export default function ContractorExpiryAlert({
  items,
  open,
  onClose,
  onUpdate,
}: {
  items: CredentialExpiryItem[];
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}) {
  if (!open || items.length === 0) return null;

  const hasExpired = items.some((i) => i.severity === "expired" || i.severity === "missing");

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          role="dialog"
          aria-labelledby="expiry-alert-title"
        >
          <div
            className={`border-b border-border px-5 py-4 ${
              hasExpired ? "bg-red-500/10" : "bg-amber-500/10"
            }`}
          >
            <div className="flex items-start gap-3">
              {hasExpired ? (
                <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
              )}
              <div>
                <h2 id="expiry-alert-title" className="text-lg font-bold tracking-tight">
                  {hasExpired ? "Credentials need attention" : "Upcoming credential expirations"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keep your license and insurance current so you stay eligible for new jobs.
                </p>
              </div>
            </div>
          </div>

          <ul className="divide-y divide-border px-5 py-2">
            {items.map((item) => (
              <li key={item.id} className="flex gap-3 py-3.5">
                <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-sm">{item.label}</p>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${expiryBadgeClass(item.severity)}`}
                    >
                      {expiryLabel(item.severity)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/20 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"
            >
              Update details later
            </button>
            <button
              type="button"
              onClick={onUpdate}
              className="rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-105"
            >
              Update details now
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
