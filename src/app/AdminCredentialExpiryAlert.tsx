import { AlertTriangle, ShieldAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  expiryBadgeClass,
  expiryLabel,
  type AdminCredentialAlert,
} from "./contractorExpiry";

export default function AdminCredentialExpiryAlert({
  alerts,
  open,
  onClose,
  onOpenContractor,
}: {
  alerts: AdminCredentialAlert[];
  open: boolean;
  onClose: () => void;
  onOpenContractor: (contractorId: number) => void;
}) {
  if (!open || alerts.length === 0) return null;

  const blocking = alerts.filter((a) => a.worst === "expired" || a.worst === "missing");
  const title =
    blocking.length > 0
      ? `${blocking.length} contractor${blocking.length === 1 ? "" : "s"} with expired / missing credentials`
      : `${alerts.length} contractor credential renewal${alerts.length === 1 ? "" : "s"} coming up`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          role="dialog"
          aria-labelledby="admin-expiry-title"
        >
          <div
            className={`flex items-start justify-between gap-3 border-b border-border px-5 py-4 ${
              blocking.length ? "bg-red-500/10" : "bg-amber-500/10"
            }`}
          >
            <div className="flex items-start gap-3">
              {blocking.length ? (
                <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
              )}
              <div>
                <h2 id="admin-expiry-title" className="text-lg font-bold tracking-tight">
                  Credential alerts
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{title}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <ul className="flex-1 divide-y divide-border overflow-y-auto">
            {alerts.map((alert) => (
              <li key={alert.contractorId}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-2 px-5 py-3.5 text-left hover:bg-muted/50"
                  onClick={() => onOpenContractor(alert.contractorId)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{alert.contractorName}</p>
                      <p className="text-xs text-muted-foreground">
                        {alert.company ? `${alert.company} · ` : ""}
                        {alert.contractorEmail || `ID #${alert.contractorId}`}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${expiryBadgeClass(alert.worst)}`}
                    >
                      {expiryLabel(alert.worst)}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {alert.items.map((item) => (
                      <li key={item.id} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">{item.label}:</span> {item.message}
                      </li>
                    ))}
                  </ul>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/20 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                if (alerts[0]) onOpenContractor(alerts[0].contractorId);
              }}
              className="rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-105"
            >
              Review &amp; request updates
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
