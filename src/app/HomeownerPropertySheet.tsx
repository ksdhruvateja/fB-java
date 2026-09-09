import { Check, Plus } from "lucide-react";
import type { Property } from "./managedJobs";
import { formatPropertyLine } from "./homeownerPropertyHealth";

export default function HomeownerPropertySheet({
  properties,
  selectedId,
  onSelect,
  onManage,
  onAdd,
  onClose,
}: {
  properties: Property[];
  selectedId?: number | null;
  onSelect: (id: number) => void;
  onManage: () => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-[1.75rem] border-t border-border bg-background p-5 shadow-2xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" aria-hidden />
        <h2 className="text-lg font-semibold">My Properties</h2>
        <ul className="mt-4 space-y-2">
          {properties.map((p) => {
            const selected = p.id === selectedId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(p.id);
                    onClose();
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                    selected ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{p.label || p.addressLine1 || "Home"}</p>
                    <p className="text-xs text-muted-foreground">{formatPropertyLine(p)}</p>
                  </span>
                  {selected ? <Check size={18} className="shrink-0 text-primary" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              onAdd();
              onClose();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-semibold"
          >
            <Plus size={16} /> Add Property
          </button>
          <button
            type="button"
            onClick={() => {
              onManage();
              onClose();
            }}
            className="rounded-xl bg-muted py-3 text-sm font-semibold"
          >
            Manage Properties
          </button>
        </div>
      </div>
    </div>
  );
}
