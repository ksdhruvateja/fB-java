function asTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      return String(row.instruction || row.title || row.text || row.step || "").trim();
    })
    .filter(Boolean);
}

export function extractDiyStepTexts(assessment: unknown): string[] {
  if (!assessment || typeof assessment !== "object") return [];
  const row = assessment as Record<string, unknown>;
  const fromSteps = asTextList(row.diy_steps);
  if (fromSteps.length) return fromSteps;
  return asTextList(row.diy_guide_steps);
}

export function fallbackDiyMethod(category = "", subcategory = "", summary = ""): string[] {
  const hay = `${category} ${subcategory} ${summary}`.toLowerCase();
  if (/plumb|pipe|leak|faucet|drain|valve|water/.test(hay)) {
    return [
      "Shut off the water to this pipe or the nearest shutoff valve, then confirm the leak slows or stops.",
      "Dry the pipe and fittings so you can see the exact leak point: a loose nut, a pinhole, or a cracked section.",
      "If a compression or slip-nut is loose, tighten it a quarter turn with a wrench. Do not force a cracked fitting.",
      "For a small pinhole or joint seep, apply a pipe-repair clamp or epoxy putty after the pipe is dry, then restore water and watch for drips.",
      "If water sprays, the pipe is split, the shutoff will not hold, or the leak returns, stop and hire a plumber.",
    ];
  }
  return [
    "Make the area safe and gather the tools named for this repair before you start.",
    "Confirm the failed part matches the diagnosis before you loosen or replace anything.",
    "Complete the first repair action on that part only, then check the result.",
    "Test the system the way it normally runs. If the original problem is gone, you are done.",
    "Stop and hire a professional if the part is damaged beyond a simple fix or a new hazard appears.",
  ];
}

export function suggestedFixture(
  assessment: unknown,
  category = "",
  subcategory = "",
  summary = "",
): string {
  const row = assessment && typeof assessment === "object" ? (assessment as Record<string, unknown>) : {};
  const materials = asTextList(row.materials_needed);
  if (materials[0]) return materials[0];
  const named = String(row.service_subcategory || row.problem_classification || subcategory || "").replace(/_/g, " ").trim();
  const hay = `${category} ${named} ${subcategory} ${summary} ${row.summary || ""}`.toLowerCase();
  if (/faucet|tap|aerator/.test(hay)) return "Matching faucet cartridge or aerator for the faucet in the photo";
  if (/toilet/.test(hay)) return "Matching toilet fill valve or flapper for the tank in the photo";
  if (/garbage|disposal/.test(hay)) return "Disposal reset or matching splash guard / drain flange";
  if (/pipe|leak|valve|shutoff/.test(hay)) return "Pipe-repair clamp or matching compression fitting for the leaking joint";
  if (/outlet|switch|cover/.test(hay)) return "Replacement outlet, switch, or cover plate matching the existing fixture";
  if (/filter|furnace|hvac/.test(hay)) return "Replacement filter or access-panel part matching the unit in the photo";
  if (/door|hinge|handle/.test(hay)) return "Matching hinge, latch, or handle for the door in the photo";
  return named || String(row.summary || "The failed fixture shown in the photo").slice(0, 90);
}

export function suggestedTools(
  assessment: unknown,
  category = "",
  subcategory = "",
  summary = "",
): string[] {
  const row = assessment && typeof assessment === "object" ? (assessment as Record<string, unknown>) : {};
  const listed = asTextList(row.tools_required);
  if (listed.length) return listed;
  const hay = `${category} ${subcategory} ${summary} ${row.summary || ""}`.toLowerCase();
  if (/plumb|pipe|leak|faucet|drain|valve|water|toilet/.test(hay)) {
    return [
      "Adjustable wrench",
      "Channel-lock pliers",
      "Flashlight",
      "Bucket and towels",
      "Pipe-repair clamp or epoxy putty",
    ];
  }
  if (/electr|outlet|switch|light/.test(hay)) {
    return ["Non-contact voltage tester", "Screwdriver set", "Flashlight", "Replacement fixture matching the photo"];
  }
  return ["Flashlight", "Screwdriver set", "Clean cloths"];
}

export function diyPlanSteps(
  assessment: unknown,
  category = "",
  subcategory = "",
  summary = "",
): string[] {
  const extracted = extractDiyStepTexts(assessment);
  return extracted.length ? extracted : fallbackDiyMethod(category, subcategory, summary);
}
