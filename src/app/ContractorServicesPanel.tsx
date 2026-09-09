import { useState } from "react";
import { Check, Plus, Power, Trash2 } from "lucide-react";
import {
  DEFAULT_OFFERINGS,
  uid,
  type ContractorWorkspace,
  type TradeGroup,
} from "./contractorWorkspaceStore";

export default function ContractorServicesPanel({
  workspace,
  onChange,
}: {
  workspace: ContractorWorkspace;
  onChange: (next: ContractorWorkspace) => void;
}) {
  const [addingTrade, setAddingTrade] = useState(false);
  const [newTrade, setNewTrade] = useState("");
  const [newServiceByTrade, setNewServiceByTrade] = useState<Record<string, string>>({});

  const setTrades = (trades: TradeGroup[]) => onChange({ ...workspace, trades });

  const addTrade = () => {
    const trade = newTrade.trim();
    if (!trade) return;
    if (workspace.trades.some((t) => t.trade.toLowerCase() === trade.toLowerCase())) return;
    const offerings = DEFAULT_OFFERINGS[trade] || [`${trade} Service`, `Emergency ${trade}`];
    setTrades([
      ...workspace.trades,
      {
        trade,
        active: true,
        services: offerings.map((name) => ({ id: uid("svc"), name, active: true })),
      },
    ]);
    setNewTrade("");
    setAddingTrade(false);
  };

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">Services</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your trades and offerings shown to FixBridge dispatch.</p>
      </div>

      <div className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Your trades</p>
        {workspace.trades.map((group) => (
          <div key={group.trade} className="rounded-[1.5rem] border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{group.trade}</h2>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    group.active
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {group.active ? "ACTIVE" : "INACTIVE"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setTrades(
                      workspace.trades.map((t) =>
                        t.trade === group.trade ? { ...t, active: !t.active } : t
                      )
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs font-semibold"
                >
                  <Power className="h-3.5 w-3.5" />
                  {group.active ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(`Remove ${group.trade} from your services?`)) return;
                    setTrades(workspace.trades.filter((t) => t.trade !== group.trade));
                  }}
                  className="rounded-xl border border-border px-2.5 py-1.5 text-xs font-semibold text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {group.services.map((svc) => (
                <li key={svc.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="inline-flex items-center gap-2">
                    <Check className={`h-4 w-4 ${svc.active ? "text-emerald-500" : "text-muted-foreground"}`} />
                    <span className={svc.active ? "" : "text-muted-foreground line-through"}>{svc.name}</span>
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary hover:underline"
                    onClick={() =>
                      setTrades(
                        workspace.trades.map((t) =>
                          t.trade !== group.trade
                            ? t
                            : {
                                ...t,
                                services: t.services.map((s) =>
                                  s.id === svc.id ? { ...s, active: !s.active } : s
                                ),
                              }
                        )
                      )
                    }
                  >
                    {svc.active ? "Deactivate" : "Activate"}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                placeholder="Add service offering"
                value={newServiceByTrade[group.trade] || ""}
                onChange={(e) =>
                  setNewServiceByTrade((m) => ({ ...m, [group.trade]: e.target.value }))
                }
              />
              <button
                type="button"
                className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
                onClick={() => {
                  const name = (newServiceByTrade[group.trade] || "").trim();
                  if (!name) return;
                  setTrades(
                    workspace.trades.map((t) =>
                      t.trade !== group.trade
                        ? t
                        : { ...t, services: [...t.services, { id: uid("svc"), name, active: true }] }
                    )
                  );
                  setNewServiceByTrade((m) => ({ ...m, [group.trade]: "" }));
                }}
              >
                Add
              </button>
            </div>
          </div>
        ))}
      </div>

      {addingTrade ? (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-4">
          <input
            className="min-w-[200px] flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            placeholder="Trade name (e.g. Roofing)"
            value={newTrade}
            onChange={(e) => setNewTrade(e.target.value)}
            list="trade-suggestions"
          />
          <datalist id="trade-suggestions">
            {Object.keys(DEFAULT_OFFERINGS).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button type="button" onClick={addTrade} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">
            Save trade
          </button>
          <button type="button" onClick={() => setAddingTrade(false)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingTrade(true)}
          className="inline-flex items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3 text-sm font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <Plus className="h-4 w-4" /> Add Trade
        </button>
      )}
    </section>
  );
}
