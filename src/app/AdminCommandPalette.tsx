import { useEffect, useMemo, useState } from "react";
import { Command, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export type CommandAction = {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  run: () => void;
};

export default function AdminCommandPalette({
  open,
  onOpenChange,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: CommandAction[];
}) {
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return actions;
    return actions.filter((a) => `${a.label} ${a.hint || ""} ${a.group || ""}`.toLowerCase().includes(needle));
  }, [actions, q]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
      >
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Quick actions…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered[0]) {
                  filtered[0].run();
                  onOpenChange(false);
                }
              }}
            />
            <kbd className="hidden items-center gap-0.5 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </div>
          <ul className="max-h-80 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matching actions</li>
            ) : (
              filtered.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-muted"
                    onClick={() => {
                      a.run();
                      onOpenChange(false);
                    }}
                  >
                    <span>
                      <span className="font-medium">{a.label}</span>
                      {a.hint && <span className="mt-0.5 block text-xs text-muted-foreground">{a.hint}</span>}
                    </span>
                    {a.group && (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {a.group}
                      </span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
