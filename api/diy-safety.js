/**
 * Central DIY safety policy — GREEN / YELLOW / RED classification and guidance rules.
 * Not admin-editable.
 */

const REASON = {
  GAS: 'GAS',
  LIVE_ELECTRICAL: 'LIVE_ELECTRICAL',
  HEIGHT: 'HEIGHT',
  STRUCTURAL: 'STRUCTURAL',
  REFRIGERANT: 'REFRIGERANT',
  SEWAGE: 'SEWAGE',
  BIOHAZARD: 'BIOHAZARD',
  OPEN_FLAME: 'OPEN_FLAME',
  FIRE: 'FIRE',
  CO: 'CO',
  FLOOD_ELECTRICAL: 'FLOOD_ELECTRICAL',
  EMERGENCY: 'EMERGENCY',
};

const RED_RULES = [
  { code: REASON.GAS, pattern: /\b(gas\s*(leak|smell|odor)|smell(s|ing)?\s+gas|natural\s*gas|gas\s*(line|piping|regulator|valve)|gas\s+appliance)\b/i },
  { code: REASON.FIRE, pattern: /\b(active\s+)?fire\b|\bsmoke\s+everywhere\b|\bflames?\b/i },
  { code: REASON.CO, pattern: /\bcarbon\s*monoxide\b|\bco\s+alarm\b/i },
  { code: REASON.LIVE_ELECTRICAL, pattern: /\b(electrical\s+panel|breaker\s+panel|main\s+panel|bus\s*bar|exposed\s+(wire|wiring)|live\s+wire|sparking.*panel|panel.*spark)\b/i },
  { code: REASON.REFRIGERANT, pattern: /\b(refrigerant|freon|recover\s+refrigerant|charge\s+refrigerant|sealed\s+hvac)\b/i },
  { code: REASON.HEIGHT, pattern: /\b(roof\s+(repair|access|work|leak)|from\s+the\s+roof|on\s+the\s+roof|climb\s+(on\s+)?the\s+roof|ladder\s+to\s+roof|significant\s+height)\b/i },
  { code: REASON.STRUCTURAL, pattern: /\b(structural|load[- ]bearing|foundation\s+issue|ceiling\s+collapse|support\s+framing)\b/i },
  { code: REASON.SEWAGE, pattern: /\b(sewage|sewer\s+backup|raw\s+sewage)\b/i },
  { code: REASON.BIOHAZARD, pattern: /\b(biohazard|contaminated\s+water|black\s+water)\b/i },
  { code: REASON.OPEN_FLAME, pattern: /\b(torch|braz(e|ing)|solder(ing)?\s+with\s+flame|open\s+flame)\b/i },
  { code: REASON.FLOOD_ELECTRICAL, pattern: /\bflood(ing)?\b.*\b(electric|panel|outlet)\b/i },
  { code: REASON.EMERGENCY, pattern: /\b(immediate\s+danger|evacuate|call\s+911|emergency\s+services)\b/i },
];

const YELLOW_RULES = [
  { code: 'UNCERTAIN', pattern: /\b(not\s+sure|uncertain|might\s+be|could\s+be)\b/i },
  { code: 'MODERATE_COMPLEXITY', pattern: /\b(moderate|somewhat\s+complex|beyond\s+basic)\b/i },
];

export function classifyDiyRiskLevel(text = '', assessment = null) {
  const parts = [
    text,
    assessment?.summary,
    assessment?.category,
    assessment?.recommended_trade,
    assessment?.urgency,
    assessment?.complexity,
    assessment?.diy_difficulty,
    ...(Array.isArray(assessment?.visual_findings) ? assessment.visual_findings : []),
    ...(Array.isArray(assessment?.stop_conditions) ? assessment.stop_conditions : []),
  ];
  const t = parts.filter(Boolean).join(' ');

  const reasonCodes = [];
  for (const rule of RED_RULES) {
    if (rule.pattern.test(t)) reasonCodes.push(rule.code);
  }

  const category = String(assessment?.category || '').toLowerCase();
  const urgency = String(assessment?.urgency || '').toLowerCase();
  const confidence = typeof assessment?.confidence === 'number' ? assessment.confidence : 0.5;

  if (
    assessment?.safe_diy_allowed === false ||
    assessment?.diy_difficulty === 'blocked' ||
    urgency.includes('emerg') ||
    confidence < 0.4 ||
    category === 'electrical' ||
    category === 'hvac' ||
    category === 'roofing'
  ) {
    if (!reasonCodes.includes(REASON.EMERGENCY) && urgency.includes('emerg')) {
      reasonCodes.push(REASON.EMERGENCY);
    }
    if (category === 'electrical' && !reasonCodes.includes(REASON.LIVE_ELECTRICAL)) {
      reasonCodes.push(REASON.LIVE_ELECTRICAL);
    }
    if (category === 'roofing' && !reasonCodes.includes(REASON.HEIGHT)) {
      reasonCodes.push(REASON.HEIGHT);
    }
    if (category === 'hvac' && !reasonCodes.includes(REASON.REFRIGERANT)) {
      reasonCodes.push(REASON.REFRIGERANT);
    }
  }

  if (reasonCodes.length > 0) {
    return {
      level: 'red',
      reasonCodes: [...new Set(reasonCodes)],
      reasons: humanReasons(reasonCodes),
    };
  }

  const isYellow =
    assessment?.complexity === 'high' ||
    assessment?.complexity === 'medium' ||
    assessment?.diy_difficulty === 'hard' ||
    assessment?.diy_difficulty === 'moderate' ||
    YELLOW_RULES.some((r) => r.pattern.test(t));

  if (isYellow) {
    return {
      level: 'yellow',
      reasonCodes: ['LIMITED_GUIDANCE'],
      reasons: ['Limited DIY guidance — professional help may be required.'],
    };
  }

  return { level: 'green', reasonCodes: [], reasons: [] };
}

function humanReasons(codes) {
  const map = {
    [REASON.GAS]: 'Gas leak or gas-line risk',
    [REASON.LIVE_ELECTRICAL]: 'Electrical panel / energized equipment risk',
    [REASON.HEIGHT]: 'Roof or height / fall risk',
    [REASON.STRUCTURAL]: 'Potential structural risk',
    [REASON.REFRIGERANT]: 'Refrigerant / sealed HVAC system risk',
    [REASON.SEWAGE]: 'Sewage / contamination risk',
    [REASON.BIOHAZARD]: 'Biohazard risk',
    [REASON.OPEN_FLAME]: 'Open flame / torch work risk',
    [REASON.FIRE]: 'Fire or smoke hazard',
    [REASON.CO]: 'Carbon monoxide risk',
    [REASON.FLOOD_ELECTRICAL]: 'Flooding near electrical systems',
    [REASON.EMERGENCY]: 'Possible emergency condition',
  };
  return codes.map((c) => map[c] || c);
}

/** @deprecated use classifyDiyRiskLevel — maps to legacy chat levels */
export function classifyDiyRisk(text) {
  const { level, reasons } = classifyDiyRiskLevel(text);
  if (level === 'red') return { level: 'EMERGENCY', reason: reasons[0] || 'High safety risk.' };
  if (level === 'yellow') return { level: 'MODERATE', reason: reasons[0] || null };
  if (/\b(filter|air\s*filter|hvac\s*filter)\b/i.test(text)) {
    return { level: 'LOW', reason: null };
  }
  return { level: 'MODERATE', reason: null };
}

export function guidancePolicyForRisk(level) {
  if (level === 'red') {
    return {
      mode: 'red',
      allowRepairSteps: false,
      systemPrompt: `DIY SAFETY: RED — NO DANGEROUS REPAIR INSTRUCTIONS.
Do NOT provide step-by-step repair procedures, invasive troubleshooting, or tool-based repair guidance.
Only provide: immediate safety guidance, shut-off guidance where safe, damage-control guidance, evacuation/emergency guidance when appropriate, and recommend Request a Professional.
Structure: Safety risk detected → Safe actions now → Avoid → Get professional help.`,
    };
  }
  if (level === 'yellow') {
    return {
      mode: 'yellow',
      allowRepairSteps: false,
      systemPrompt: `DIY SAFETY: YELLOW — LOW-RISK GUIDANCE ONLY.
You may help with visual inspection, checking user-accessible controls, identifying symptoms, shutting off equipment using normal homeowner controls, and gathering information for a contractor.
Do NOT provide invasive repair instructions. Always keep professional help available.`,
    };
  }
  return {
    mode: 'green',
    allowRepairSteps: true,
    systemPrompt: `DIY SAFETY: GREEN — guided DIY allowed with safety reminders.
Provide step-by-step guidance for low-risk homeowner-safe tasks. Remind user to stop if unsafe or beyond ability.`,
  };
}

export function safetySystemPrompt(riskLevel) {
  const mapped =
    riskLevel === 'EMERGENCY' || riskLevel === 'HIGH'
      ? 'red'
      : riskLevel === 'LOW'
        ? 'green'
        : riskLevel === 'MODERATE'
          ? 'yellow'
          : riskLevel;
  return guidancePolicyForRisk(mapped).systemPrompt;
}

export function stripDangerousGuidanceFromAssessment(assessment, level) {
  if (level !== 'red') return assessment;
  return {
    ...assessment,
    diy_steps: [],
    tools_required: [],
    materials_needed: [],
    safe_diy_allowed: false,
    professional_required: true,
    diy_difficulty: 'blocked',
  };
}

export { REASON as DIY_RISK_REASON_CODES };
