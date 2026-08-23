/** Client-side contractor workspace settings (schedule, team, services catalog). */

export type DayHours = {
  day: string;
  mode: "hours" | "emergency" | "unavailable";
  start: string;
  end: string;
};

export type ScheduleBlock = {
  id: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string;
  label: string;
  type: "block" | "unavailable" | "emergency";
  technicianId?: string | null;
};

export type TeamMember = {
  id: string;
  name: string;
  role: "Field Technician" | "Technician" | "Dispatcher" | "Manager" | "Owner";
  trades: string[];
  status: "available" | "on_job" | "offline" | "online";
  jobsToday: number;
};

export type TradeOffering = {
  id: string;
  name: string;
  active: boolean;
};

export type TradeGroup = {
  trade: string;
  active: boolean;
  services: TradeOffering[];
};

export type ContractorWorkspace = {
  workingHours: DayHours[];
  blocks: ScheduleBlock[];
  team: TeamMember[];
  trades: TradeGroup[];
  companySize: string;
  emergencySameAsNormal: boolean;
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

const DEFAULT_OFFERINGS: Record<string, string[]> = {
  HVAC: ["AC Repair", "Heating Repair", "HVAC Inspection", "Preventive Maintenance", "Emergency HVAC"],
  Plumbing: ["Leak Repair", "Drain Cleaning", "Fixture Installation", "Water Heater", "Emergency Plumbing"],
  Electrical: ["General Electrical", "Lighting", "Panel Upgrade", "Outlet / Switch"],
  Roofing: ["Roof Repair", "Gutter Service", "Leak Inspection"],
  Handyman: ["General Handyman", "Drywall", "Door / Lock"],
  Appliances: ["Appliance Repair", "Installation"],
  "Pest Control": ["General Pest", "Termite", "Seasonal Prevention"],
};

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultWorkingHours(availableDays?: string): DayHours[] {
  const raw = String(availableDays || "").toLowerCase();
  return DAYS.map((day) => {
    const key = day.slice(0, 3).toLowerCase();
    const mentioned = !raw.trim() || raw.includes(day.toLowerCase()) || raw.includes(key);
    if (day === "Saturday") {
      return { day, mode: raw.includes("sat") || raw.includes("weekend") ? "emergency" : "emergency", start: "08:00", end: "17:00" };
    }
    if (day === "Sunday") {
      return { day, mode: "unavailable", start: "08:00", end: "17:00" };
    }
    if (!mentioned && raw.trim()) {
      return { day, mode: "unavailable", start: "08:00", end: "18:00" };
    }
    return {
      day,
      mode: "hours" as const,
      start: "08:00",
      end: day === "Friday" ? "17:00" : "18:00",
    };
  });
}

export function defaultTradesFromPrimary(primary: string[]): TradeGroup[] {
  const list = primary.length ? primary : ["HVAC", "Plumbing"];
  return list.map((trade) => {
    const offerings = DEFAULT_OFFERINGS[trade] || [`${trade} Service`, `${trade} Inspection`, `Emergency ${trade}`];
    return {
      trade,
      active: true,
      services: offerings.map((name) => ({ id: uid("svc"), name, active: true })),
    };
  });
}

export function defaultTeam(companyName: string, companySize?: string): TeamMember[] {
  const size = companySize || "2–5";
  const owner: TeamMember = {
    id: uid("tm"),
    name: companyName || "Owner",
    role: "Owner",
    trades: ["HVAC", "Plumbing"],
    status: "available",
    jobsToday: 0,
  };
  if (size === "1") return [owner];
  return [
    owner,
    {
      id: uid("tm"),
      name: "Michael Rodriguez",
      role: "Field Technician",
      trades: ["HVAC", "Plumbing"],
      status: "available",
      jobsToday: 3,
    },
    {
      id: uid("tm"),
      name: "David Smith",
      role: "Technician",
      trades: ["Plumbing"],
      status: "on_job",
      jobsToday: 2,
    },
    {
      id: uid("tm"),
      name: "Sarah Wilson",
      role: "Dispatcher",
      trades: [],
      status: "online",
      jobsToday: 0,
    },
  ];
}

export function emptyWorkspace(seed?: {
  companyName?: string;
  primaryServices?: string[];
  availableDays?: string;
  companySize?: string;
}): ContractorWorkspace {
  return {
    workingHours: defaultWorkingHours(seed?.availableDays),
    blocks: [],
    team: defaultTeam(seed?.companyName || "Team", seed?.companySize),
    trades: defaultTradesFromPrimary(seed?.primaryServices || []),
    companySize: seed?.companySize || "2–5",
    emergencySameAsNormal: true,
  };
}

function storageKey(userId: number | string) {
  return `fixbridge_contractor_workspace_${userId}`;
}

export function loadWorkspace(
  userId: number | string,
  seed?: Parameters<typeof emptyWorkspace>[0]
): ContractorWorkspace {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return emptyWorkspace(seed);
    const parsed = JSON.parse(raw) as Partial<ContractorWorkspace>;
    const base = emptyWorkspace(seed);
    return {
      workingHours: Array.isArray(parsed.workingHours) && parsed.workingHours.length ? parsed.workingHours : base.workingHours,
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      team: Array.isArray(parsed.team) && parsed.team.length ? parsed.team : base.team,
      trades: Array.isArray(parsed.trades) && parsed.trades.length ? parsed.trades : base.trades,
      companySize: parsed.companySize || base.companySize,
      emergencySameAsNormal: parsed.emergencySameAsNormal !== false,
    };
  } catch {
    return emptyWorkspace(seed);
  }
}

export function saveWorkspace(userId: number | string, data: ContractorWorkspace) {
  localStorage.setItem(storageKey(userId), JSON.stringify(data));
}

export function formatHourLabel(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = ((h + 11) % 12) + 1;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${ampm}` : `${hour} ${ampm}`;
}

export function hoursModeLabel(d: DayHours) {
  if (d.mode === "unavailable") return "Unavailable";
  if (d.mode === "emergency") return "Emergency only";
  return `${formatHourLabel(d.start)} – ${formatHourLabel(d.end)}`;
}

export { uid, DAYS, DEFAULT_OFFERINGS };
