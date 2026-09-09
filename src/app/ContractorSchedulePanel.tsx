import { useMemo, useState } from "react";
import {
  CalendarDays,
  Clock,
  Plus,
  ShieldAlert,
  User,
  X,
} from "lucide-react";
import type { ManagedJob } from "./managedJobs";
import {
  DAYS,
  formatHourLabel,
  hoursModeLabel,
  uid,
  type ContractorWorkspace,
  type DayHours,
  type ScheduleBlock,
  type TeamMember,
} from "./contractorWorkspaceStore";

const HOURS = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"];

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  x.setHours(12, 0, 0, 0);
  return x;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function ContractorSchedulePanel({
  jobs,
  workspace,
  onChange,
}: {
  jobs: ManagedJob[];
  workspace: ContractorWorkspace;
  onChange: (next: ContractorWorkspace) => void;
}) {
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [showBlock, setShowBlock] = useState(false);
  const [blockDate, setBlockDate] = useState(ymd(new Date()));
  const [blockStart, setBlockStart] = useState("09:00");
  const [blockEnd, setBlockEnd] = useState("11:00");
  const [blockLabel, setBlockLabel] = useState("");
  const [blockType, setBlockType] = useState<ScheduleBlock["type"]>("block");
  const [techId, setTechId] = useState<string>("");

  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(anchor, i)), [anchor]);

  const jobEvents = useMemo(() => {
    return jobs
      .filter((j) => ["scheduled", "contractor_en_route", "work_started", "approved"].includes(j.status))
      .map((j, idx) => {
        const base = weekDays[idx % weekDays.length];
        return {
          id: `job-${j.id}`,
          date: ymd(base),
          start: HOURS[idx % HOURS.length],
          title: j.title || j.category || "Job",
          bookingId: j.bookingId,
        };
      });
  }, [jobs, weekDays]);

  const monthLabel = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const setHours = (day: string, patch: Partial<DayHours>) => {
    onChange({
      ...workspace,
      workingHours: workspace.workingHours.map((h) => (h.day === day ? { ...h, ...patch } : h)),
    });
  };

  const addBlock = () => {
    const next: ScheduleBlock = {
      id: uid("blk"),
      date: blockDate,
      start: blockStart,
      end: blockEnd,
      label: blockLabel.trim() || (blockType === "unavailable" ? "Unavailable" : blockType === "emergency" ? "Emergency hold" : "Blocked"),
      type: blockType,
      technicianId: techId || null,
    };
    onChange({ ...workspace, blocks: [...workspace.blocks, next] });
    setShowBlock(false);
    setBlockLabel("");
  };

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">Schedule</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage working hours, blocks, emergency coverage, and technician assignments.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowBlock(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" /> Block time
          </button>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-sm"
            onClick={() => setAnchor(addDays(anchor, -7))}
          >
            ‹
          </button>
          <p className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" /> {monthLabel}
          </p>
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-sm"
            onClick={() => setAnchor(addDays(anchor, 7))}
          >
            ›
          </button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[72px_repeat(5,1fr)] gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span />
              {weekDays.map((d) => (
                <div key={d.toISOString()} className="rounded-lg bg-muted/40 py-2">
                  <p>{d.toLocaleDateString(undefined, { weekday: "short" })}</p>
                  <p className="text-foreground tabular-nums">{d.getDate()}</p>
                </div>
              ))}
            </div>
            <div className="mt-1 space-y-1">
              {HOURS.map((hour) => (
                <div key={hour} className="grid grid-cols-[72px_repeat(5,1fr)] gap-1">
                  <div className="flex items-start justify-end pr-2 pt-1 text-[11px] text-muted-foreground">
                    {formatHourLabel(hour)}
                  </div>
                  {weekDays.map((d) => {
                    const date = ymd(d);
                    const events = [
                      ...jobEvents.filter((e) => e.date === date && e.start === hour),
                      ...workspace.blocks.filter((b) => b.date === date && b.start === hour),
                    ];
                    return (
                      <div
                        key={`${date}-${hour}`}
                        className="min-h-[52px] rounded-lg border border-border/60 bg-background/50 p-1"
                      >
                        {events.map((e) => {
                          const isBlock = "type" in e;
                          return (
                            <div
                              key={e.id}
                              className={`mb-1 rounded-md px-1.5 py-1 text-[10px] font-semibold leading-tight ${
                                isBlock
                                  ? e.type === "emergency"
                                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                                    : "bg-muted text-muted-foreground"
                                  : "bg-primary/15 text-primary"
                              }`}
                            >
                              {"title" in e ? e.title : e.label}
                              {"bookingId" in e && e.bookingId ? (
                                <span className="block font-normal opacity-80">{e.bookingId}</span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Working hours
        </h2>
        <ul className="mt-4 divide-y divide-border">
          {DAYS.map((day) => {
            const row = workspace.workingHours.find((h) => h.day === day) || {
              day,
              mode: "hours" as const,
              start: "08:00",
              end: "18:00",
            };
            return (
              <li key={day} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="w-28 font-medium">{day}</span>
                <select
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={row.mode}
                  onChange={(e) => setHours(day, { mode: e.target.value as DayHours["mode"] })}
                >
                  <option value="hours">Open hours</option>
                  <option value="emergency">Emergency only</option>
                  <option value="unavailable">Unavailable</option>
                </select>
                {row.mode === "hours" ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      className="rounded-xl border border-border bg-background px-2 py-2 text-sm"
                      value={row.start}
                      onChange={(e) => setHours(day, { start: e.target.value })}
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="time"
                      className="rounded-xl border border-border bg-background px-2 py-2 text-sm"
                      value={row.end}
                      onChange={(e) => setHours(day, { end: e.target.value })}
                    />
                  </div>
                ) : (
                  <span className="text-muted-foreground">{hoursModeLabel(row)}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Technicians on schedule</h2>
        <ul className="mt-3 space-y-2">
          {workspace.team
            .filter((t) => t.role !== "Dispatcher")
            .map((t: TeamMember) => (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-sm">
                <span className="inline-flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {t.name}
                  <span className="text-xs text-muted-foreground">{t.role}</span>
                </span>
                <span className="text-xs text-muted-foreground">{t.jobsToday} jobs today</span>
              </li>
            ))}
        </ul>
      </div>

      {showBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setShowBlock(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Block / mark time</p>
              <button type="button" onClick={() => setShowBlock(false)} className="rounded-lg p-1.5 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <select
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              value={blockType}
              onChange={(e) => setBlockType(e.target.value as ScheduleBlock["type"])}
            >
              <option value="block">Block time</option>
              <option value="unavailable">Mark unavailable</option>
              <option value="emergency">Set emergency hours hold</option>
            </select>
            <input type="date" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input type="time" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} />
              <input type="time" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} />
            </div>
            <select
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              value={techId}
              onChange={(e) => setTechId(e.target.value)}
            >
              <option value="">Whole company</option>
              {workspace.team.map((t) => (
                <option key={t.id} value={t.id}>
                  Assign: {t.name}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              placeholder="Label (optional)"
              value={blockLabel}
              onChange={(e) => setBlockLabel(e.target.value)}
            />
            <button type="button" onClick={addBlock} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">
              <ShieldAlert className="h-4 w-4" /> Save
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
