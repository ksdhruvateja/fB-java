/**
 * Central DIY safety policy — not admin-editable.
 */

const EMERGENCY_PATTERNS = [
  /\bgas\s*(leak|smell|odor)\b/i,
  /\bsmell(s|ing)?\s+gas\b/i,
  /\bcarbon\s*monoxide\b/i,
  /\bco\s+alarm\b/i,
  /\b(sparking|spark)\b.*\b(panel|outlet|wire)\b/i,
  /\belectrical\s+panel\b.*\b(spark|fire)\b/i,
  /\b(active\s+)?fire\b/i,
  /\bsmoke\s+everywhere\b/i,
  /\bflood(ing)?\b.*\b(electric|panel|outlet)\b/i,
  /\bstructural\s+(collapse|damage)\b/i,
];

const HIGH_RISK_PATTERNS = [
  /\belectrical\s+panel\b/i,
  /\bbreaker\s+panel\b/i,
  /\bmain\s+panel\b/i,
  /\bexposed\s+(wire|wiring)\b/i,
  /\brefrigerant\b/i,
  /\bfreon\b/i,
  /\bgas\s+line\b/i,
  /\bgas\s+appliance\b/i,
  /\bfurnace\s+gas\b/i,
  /\broof\s+(repair|work)\b/i,
  /\bsewage\s+backup\b/i,
  /\blive\s+wire\b/i,
];

export function classifyDiyRisk(text) {
  const t = String(text || '');
  for (const p of EMERGENCY_PATTERNS) {
    if (p.test(t)) return { level: 'EMERGENCY', reason: 'Possible emergency — do not provide repair steps.' };
  }
  for (const p of HIGH_RISK_PATTERNS) {
    if (p.test(t)) return { level: 'HIGH', reason: 'High-risk work requires a licensed professional.' };
  }
  if (/\b(filter|air\s*filter|hvac\s*filter)\b/i.test(t) && !/\b(refrigerant|gas|panel)\b/i.test(t)) {
    return { level: 'LOW', reason: null };
  }
  if (/\b(clog|drain|slow\s+drain)\b/i.test(t) && !/\belectrical|gas|sewage\b/i.test(t)) {
    return { level: 'MODERATE', reason: null };
  }
  return { level: 'MODERATE', reason: null };
}

export function safetySystemPrompt(riskLevel) {
  if (riskLevel === 'EMERGENCY') {
    return `SAFETY: EMERGENCY. Do NOT provide repair instructions. Give brief safety guidance (evacuate if needed, shut off utilities only if safe, call emergency services or licensed pro). Offer [Schedule Site Visit] only.`;
  }
  if (riskLevel === 'HIGH') {
    return `SAFETY: HIGH RISK. Do NOT provide step-by-step repair instructions for electrical, gas, refrigerant, roof, or structural work. Recommend licensed professional. Offer [Schedule Site Visit].`;
  }
  if (riskLevel === 'LOW') {
    return `SAFETY: LOW RISK. You may provide brief safe DIY steps for simple tasks (e.g. filter replacement) if appropriate. Still offer professional help if unsure.`;
  }
  return `SAFETY: MODERATE. Ask ONE clarifying question at a time. Avoid dangerous instructions. Prefer professional help when uncertain.`;
}
