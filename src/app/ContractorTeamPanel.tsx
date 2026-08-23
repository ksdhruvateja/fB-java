import { useState } from "react";
import { Plus, Users, X } from "lucide-react";
import { uid, type ContractorWorkspace, type TeamMember } from "./contractorWorkspaceStore";

const ROLES: TeamMember["role"][] = ["Field Technician", "Technician", "Dispatcher", "Manager", "Owner"];
const STATUSES: TeamMember["status"][] = ["available", "on_job", "online", "offline"];

function statusMeta(s: TeamMember["status"]) {
  if (s === "available") return { label: "Available", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" };
  if (s === "on_job") return { label: "On Job", className: "bg-amber-500/15 text-amber-800 dark:text-amber-200" };
  if (s === "online") return { label: "Online", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300" };
  return { label: "Offline", className: "bg-muted text-muted-foreground" };
}

export default function ContractorTeamPanel({
  companyName,
  workspace,
  onChange,
}: {
  companyName: string;
  workspace: ContractorWorkspace;
  onChange: (next: ContractorWorkspace) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<TeamMember["role"]>("Field Technician");
  const [trades, setTrades] = useState("");

  const fieldCount = workspace.team.filter((t) =>
    ["Field Technician", "Technician"].includes(t.role)
  ).length;

  const addMember = () => {
    if (!name.trim()) return;
    const member: TeamMember = {
      id: uid("tm"),
      name: name.trim(),
      role,
      trades: trades
        .split(/[,/]/)
        .map((t) => t.trim())
        .filter(Boolean),
      status: role === "Dispatcher" ? "online" : "available",
      jobsToday: 0,
    };
    onChange({ ...workspace, team: [...workspace.team, member] });
    setName("");
    setTrades("");
    setShowAdd(false);
  };

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">Team</h1>
          <p className="mt-1 text-lg font-semibold">{companyName}</p>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            {workspace.team.length} Team Members · {fieldCount} Field Technicians
            {workspace.companySize ? ` · Company size ${workspace.companySize}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> Add member
        </button>
      </div>

      <label className="grid max-w-xs gap-1.5 text-sm">
        <span className="text-xs text-muted-foreground">Company size (field technicians)</span>
        <select
          className="rounded-xl border border-border bg-card px-3 py-2.5"
          value={workspace.companySize}
          onChange={(e) => onChange({ ...workspace, companySize: e.target.value })}
        >
          {["1", "2–5", "6–10", "11–25", "26–50", "50+"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <ul className="space-y-3">
        {workspace.team.map((m) => {
          const st = statusMeta(m.status);
          return (
            <li key={m.id} className="rounded-[1.25rem] border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold">{m.name}</p>
                  <p className="text-sm text-muted-foreground">{m.role}</p>
                  {m.trades.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">{m.trades.join(" · ")}</p>
                  )}
                </div>
                <div className="text-right space-y-2">
                  <select
                    className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold ${st.className}`}
                    value={m.status}
                    onChange={(e) =>
                      onChange({
                        ...workspace,
                        team: workspace.team.map((t) =>
                          t.id === m.id ? { ...t, status: e.target.value as TeamMember["status"] } : t
                        ),
                      })
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusMeta(s).label}
                      </option>
                    ))}
                  </select>
                  {["Field Technician", "Technician"].includes(m.role) && (
                    <p className="text-xs text-muted-foreground">Jobs Today: {m.jobsToday}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-red-600 hover:underline"
                  onClick={() =>
                    onChange({ ...workspace, team: workspace.team.filter((t) => t.id !== m.id) })
                  }
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setShowAdd(false)} />
          <div className="relative z-10 w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Add team member</p>
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg p-1.5 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as TeamMember["role"])}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              placeholder="Trades (e.g. HVAC, Plumbing)"
              value={trades}
              onChange={(e) => setTrades(e.target.value)}
            />
            <button type="button" onClick={addMember} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">
              Save member
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
