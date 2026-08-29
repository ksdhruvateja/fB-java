import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";

const TIME_WINDOWS = [
  { value: "", label: "No preference" },
  { value: "8-10", label: "8:00 AM – 10:00 AM" },
  { value: "9-11", label: "9:00 AM – 11:00 AM" },
  { value: "11-1", label: "11:00 AM – 1:00 PM" },
  { value: "1-3", label: "1:00 PM – 3:00 PM" },
  { value: "3-5", label: "3:00 PM – 5:00 PM" },
];

export default function RecurringRescheduleDialog({
  open,
  serviceLabel,
  currentDate,
  currentTimeWindow,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  serviceLabel: string;
  currentDate?: string | null;
  currentTimeWindow?: string | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (newDate: string, timeWindow: string | null) => void;
}) {
  const [date, setDate] = useState(currentDate || "");
  const [timeWindow, setTimeWindow] = useState(currentTimeWindow || "");

  useEffect(() => {
    if (open) {
      setDate(currentDate || "");
      setTimeWindow(currentTimeWindow || "");
    }
  }, [open, currentDate, currentTimeWindow]);

  const minDate = new Date().toISOString().slice(0, 10);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= minDate;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reschedule next visit</DialogTitle>
          <DialogDescription>
            This changes only the next {serviceLabel.toLowerCase()} visit. Your regular {serviceLabel.toLowerCase()}{" "}
            schedule stays the same after that.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">New date</span>
            <input
              type="date"
              className="rounded-lg border border-border px-3 py-2"
              value={date}
              min={minDate}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Preferred time window</span>
            <select
              className="rounded-lg border border-border px-3 py-2"
              value={timeWindow}
              onChange={(e) => setTimeWindow(e.target.value)}
            >
              {TIME_WINDOWS.map((w) => (
                <option key={w.value || "none"} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={!valid || busy}
            onClick={() => onConfirm(date, timeWindow || null)}
          >
            {busy ? "Saving…" : "Confirm reschedule"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
