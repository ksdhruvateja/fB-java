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

export function diyPlanSteps(
  assessment: unknown,
  category = "",
  subcategory = "",
  summary = "",
): string[] {
  const extracted = extractDiyStepTexts(assessment);
  return extracted.length ? extracted : fallbackDiyMethod(category, subcategory, summary);
}
