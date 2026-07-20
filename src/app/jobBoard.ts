export type JobCategory =
  | "Plumbing"
  | "Electrical"
  | "HVAC"
  | "Painting"
  | "Roofing"
  | "Flooring"
  | "Carpentry"
  | "Others";

export type StoredAssessment = {
  overview: string;
  diagnosis: string;
  likelyRootCause: string;
  toolsRequired: string[];
  diySteps: string[];
  safetyNotes: string;
  estimatedCost: string;
  estimatedDuration: string;
  urgency: string;
  professionalRecommended: boolean;
};

export type JobBoardItem = {
  id: number;
  category: JobCategory;
  tag: string;
  title: string;
  description?: string;
  mediaDataUrl?: string;
  mediaType?: "image" | "video";
  aiAssessment?: StoredAssessment;
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

// ── Sync pure helpers (no DB needed) ─────────────────────────────────────────

const REQUIREMENTS_MAP: Record<JobCategory, string[]> = {
  Plumbing:   ["Licensed plumber", "Leak diagnosis tools", "Pipe repair experience"],
  Electrical: ["Licensed electrician", "Panel/circuit safety knowledge", "Code-compliant wiring"],
  HVAC:       ["HVAC certification", "Troubleshooting equipment", "Heating/cooling repair experience"],
  Painting:   ["Surface prep experience", "Interior/exterior painting tools", "Finish quality references"],
  Roofing:    ["Roof safety gear", "Shingle/flashings expertise", "Weatherproofing experience"],
  Flooring:   ["Floor leveling skills", "Cutting/installation tools", "Material-specific installation knowledge"],
  Carpentry:  ["Framing/finish carpentry skills", "Measurement/cutting precision", "Structural repair experience"],
  Others:     ["General contractor capability", "Problem diagnosis ability", "Willingness to scope unfamiliar jobs"],
};

export function getJobRequirements(category: JobCategory): string[] {
  return REQUIREMENTS_MAP[category];
}

export function contractorCanDoJob(contractorTrade: string | undefined, category: JobCategory): boolean {
  if (category === "Others") return true;
  if (!contractorTrade) return false;
  return contractorTrade.toLowerCase().includes(category.toLowerCase());
}

// ── Custom event for same-tab real-time notifications ─────────────────────────

export const NEW_JOB_EVENT = "fixbridge-new-job";

// ── Async API ─────────────────────────────────────────────────────────────────

export async function getJobBoardJobs(): Promise<JobBoardItem[]> {
  const res = await fetch("/api/jobs");
  return res.json();
}

export async function addJobBoardJob(
  job: Omit<JobBoardItem, "id" | "posted" | "requirements" | "tag">,
): Promise<JobBoardItem> {
  const tag = job.urgent
    ? `${job.category.toUpperCase()} · URGENT`
    : job.category.toUpperCase();
  const requirements = getJobRequirements(job.category);

  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...job, tag, requirements }),
  });
  const created: JobBoardItem = await res.json();

  // Broadcast to any open contractor portal for the real-time toast
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NEW_JOB_EVENT, { detail: created }));
  }
  return created;
}
