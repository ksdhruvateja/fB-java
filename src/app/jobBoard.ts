export type JobCategory =
  | "Plumbing"
  | "Electrical"
  | "HVAC"
  | "Painting"
  | "Roofing"
  | "Flooring"
  | "Carpentry"
  | "Others";

export type JobBoardItem = {
  id: number;
  category: JobCategory;
  tag: string;
  title: string;
  cityStateZip: string;
  fullAddress: string;
  contactName: string;
  contactPhone: string;
  dist: string;
  posted: string;
  est: string;
  bids: number;
  urgent: boolean;
  ai: boolean;
  requirements: string[];
};

const STORAGE_KEY = "fixbridge-job-board";

const REQUIREMENTS_MAP: Record<JobCategory, string[]> = {
  Plumbing: ["Licensed plumber", "Leak diagnosis tools", "Pipe repair experience"],
  Electrical: ["Licensed electrician", "Panel/circuit safety knowledge", "Code-compliant wiring"],
  HVAC: ["HVAC certification", "Troubleshooting equipment", "Heating/cooling repair experience"],
  Painting: ["Surface prep experience", "Interior/exterior painting tools", "Finish quality references"],
  Roofing: ["Roof safety gear", "Shingle/flashings expertise", "Weatherproofing experience"],
  Flooring: ["Floor leveling skills", "Cutting/installation tools", "Material-specific installation knowledge"],
  Carpentry: ["Framing/finish carpentry skills", "Measurement/cutting precision", "Structural repair experience"],
  Others: ["General contractor capability", "Problem diagnosis ability", "Willingness to scope unfamiliar jobs"],
};

const SEEDED_JOBS: JobBoardItem[] = [
  {
    id: 1,
    category: "Plumbing",
    tag: "PLUMBING",
    title: "Kitchen sink drain clog - backed up",
    cityStateZip: "Brooklyn, NY 11215",
    fullAddress: "145 7th Ave, Brooklyn, NY 11215",
    contactName: "Maria Santos",
    contactPhone: "(917) 555-0121",
    dist: "2.1 mi",
    posted: "1h ago",
    est: "$150-$320",
    bids: 2,
    urgent: false,
    ai: true,
    requirements: REQUIREMENTS_MAP.Plumbing,
  },
  {
    id: 2,
    category: "Plumbing",
    tag: "PLUMBING · URGENT",
    title: "Pipe burst under bathroom vanity",
    cityStateZip: "Astoria, NY 11102",
    fullAddress: "31-42 30th St, Astoria, NY 11102",
    contactName: "Kevin Patel",
    contactPhone: "(646) 555-0194",
    dist: "0.8 mi",
    posted: "25m ago",
    est: "$280-$520",
    bids: 1,
    urgent: true,
    ai: true,
    requirements: REQUIREMENTS_MAP.Plumbing,
  },
];

function canUseStorage() {
  if (typeof window === "undefined") return false;
  try {
    return typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function writeJobs(jobs: JobBoardItem[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    // Ignore storage errors to keep the UI responsive.
  }
}

export function getJobRequirements(category: JobCategory): string[] {
  return REQUIREMENTS_MAP[category];
}

export function getJobBoardJobs(): JobBoardItem[] {
  if (!canUseStorage()) return SEEDED_JOBS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      writeJobs(SEEDED_JOBS);
      return SEEDED_JOBS;
    }
    const parsed = JSON.parse(raw) as JobBoardItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      writeJobs(SEEDED_JOBS);
      return SEEDED_JOBS;
    }
    return parsed;
  } catch {
    writeJobs(SEEDED_JOBS);
    return SEEDED_JOBS;
  }
}

export function addJobBoardJob(job: Omit<JobBoardItem, "id" | "posted" | "requirements" | "tag">) {
  const jobs = getJobBoardJobs();
  const next: JobBoardItem = {
    ...job,
    id: Date.now(),
    posted: "Just now",
    tag: job.urgent ? `${job.category.toUpperCase()} · URGENT` : job.category.toUpperCase(),
    requirements: getJobRequirements(job.category),
  };
  writeJobs([next, ...jobs]);
}

export function contractorCanDoJob(contractorTrade: string | undefined, category: JobCategory): boolean {
  if (category === "Others") return true;
  if (!contractorTrade) return false;
  const normalizedTrade = contractorTrade.toLowerCase();
  return normalizedTrade.includes(category.toLowerCase());
}
