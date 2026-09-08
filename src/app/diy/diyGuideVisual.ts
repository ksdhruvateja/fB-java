export type GuideStep = {
  step_number: number;
  title: string;
  goal: string;
  instruction: string;
  explanation: string;
  tools: string[];
  materials: string[];
  safety_note: string;
  what_to_look_for: string;
  expected_result: string;
  failure_signs: string;
  if_not: string;
  when_to_stop: string;
  image_needed: boolean;
  image_prompt: string;
};

const visualCache = new Map<string, string>();

function hashKey(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash.toString(16);
}

function svg(label: string, accent: string) {
  const safe = label.replace(/[<>&"]/g, "").slice(0, 42);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <rect width="640" height="360" fill="#F4EFE8"/>
      <rect x="48" y="42" width="544" height="276" rx="28" fill="#fff"/>
      <circle cx="168" cy="168" r="54" fill="${accent}" opacity="0.35"/>
      <rect x="248" y="118" width="280" height="18" rx="9" fill="#E7DDD2"/>
      <rect x="248" y="154" width="220" height="14" rx="7" fill="#EFE6E0"/>
      <rect x="248" y="186" width="180" height="14" rx="7" fill="#EFE6E0"/>
      <text x="72" y="92" font-family="Arial,sans-serif" font-size="22" fill="#3d3a36">${safe}</text>
    </svg>`
  )}`;
}

export function guideVisual(step: GuideStep, category: string): string | null {
  if (!step.image_needed) return null;
  if (/live panel|gas line|climb|roof edge|asbestos|hazard/i.test(`${step.image_prompt} ${step.instruction}`)) {
    return null;
  }
  const key = `${category}:${step.title}:${hashKey(step.image_prompt || step.instruction)}`;
  const cached = visualCache.get(key);
  if (cached) return cached;
  const accent = /plumb|faucet|valve/i.test(`${category} ${step.title}`)
    ? "#7EB6D9"
    : /hvac|filter/i.test(`${category} ${step.title}`)
      ? "#B7C9A4"
      : "#E7C27A";
  const url = svg(step.title || "Instruction", accent);
  visualCache.set(key, url);
  return url;
}

export function asGuideSteps(value: unknown, fallback: string[]): GuideStep[] {
  if (Array.isArray(value) && value.length) {
    return value
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const title = String(row.title || "").trim();
        const instruction = String(row.instruction || "").trim();
        if (!title && !instruction) return null;
        return {
          step_number: Number(row.step_number) || index + 1,
          title: title || `Step ${index + 1}`,
          goal: String(row.goal || ""),
          instruction,
          explanation: String(row.explanation || row.why || ""),
          tools: Array.isArray(row.tools) ? row.tools.map(String) : [],
          materials: Array.isArray(row.materials) ? row.materials.map(String) : [],
          safety_note: String(row.safety_note || row.safety_notes || ""),
          what_to_look_for: String(row.what_to_look_for || ""),
          expected_result: String(row.expected_result || ""),
          failure_signs: String(row.failure_signs || ""),
          if_not: String(row.if_not || row.if_step_fails || ""),
          when_to_stop: String(row.when_to_stop || ""),
          image_needed: row.image_needed === true || row.visual_needed === true,
          image_prompt: String(row.image_prompt || row.visual_prompt || ""),
        };
      })
      .filter((item): item is GuideStep => Boolean(item));
  }
  return fallback.map((instruction, index) => ({
    step_number: index + 1,
    title: instruction.replace(/^\d+[\).\s-]+/, "").split(/[.!?]/)[0].slice(0, 80) || `Step ${index + 1}`,
    goal: "Finish this one action before changing any part.",
    instruction,
    explanation: "This check confirms the cause before any part is replaced.",
    tools: [],
    materials: [],
    safety_note: "Stop if the part is damaged, stuck, or looks different from this step.",
    what_to_look_for: "Look for a clear change from the condition you started with.",
    expected_result: "The step finishes without a new leak, spark, odor, or unusual resistance.",
    failure_signs: "Nothing changes, or a new leak, spark, or resistance appears.",
    if_not: "Do not force it. Use Hire a Professional with this step noted.",
    when_to_stop: "Stop if you cannot complete this action safely.",
    image_needed: /valve|filter|reset|handle|shutoff/i.test(instruction),
    image_prompt: /valve|filter|reset|handle|shutoff/i.test(instruction)
      ? `Close-up instructional view of ${instruction.slice(0, 80)}`
      : "",
  }));
}
