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
  USER_STOP: 'USER_STOP',
};

const PROMPT_INJECTION_PATTERNS = [
  /\bignore\s+(all\s+)?(previous|prior|above)\s+(safety\s+)?(rules|instructions|policy)\b/i,
  /\bignore\s+safety\s+rules\b/i,
  /\bdisable\s+red\s+mode\b/i,
  /\bpretend\s+(this\s+)?isn'?t\s+dangerous\b/i,
  /\boverride\s+(safety|system)\b/i,
  /\bact\s+as\s+(if\s+)?(you\s+are\s+)?(dan|unrestricted|without\s+rules)\b/i,
  /\bshow\s+me\s+(how\s+to\s+)?open\s+the\s+live\s+(electrical\s+)?panel\b/i,
  /\bjailbreak\b/i,
  /\bsystem\s+prompt\b/i,
];

const RED_RULES = [
  { code: REASON.GAS, pattern: /\b(gas\s*(leak|smell|odor)|smell(s|ing)?\s+gas|natural\s*gas|gas\s*(line|piping|regulator|valve|connection)|gas\s+appliance|loosen\s+gas\s+fittings?)\b/i },
  { code: REASON.FIRE, pattern: /\b(active\s+)?fire\b|\bsmoke\s+(everywhere|hazard|filling)\b|\bflames?\b/i },
  {
    code: REASON.CO,
    pattern: /\bcarbon\s*monoxide\b|\bco\s+(alarm|detector)\b|\bco\s+keeps\s+alarm/i,
  },
  {
    code: REASON.LIVE_ELECTRICAL,
    pattern:
      /\b(electrical\s+panel|breaker\s+panel|main\s+panel|bus\s*bar|exposed\s+(wire|wiring)|live\s+wire|sparking|spark(s|ing)?\s+.*(panel|outlet|equipment|breaker)|panel.*spark|energized\s+wiring)\b/i,
  },
  { code: REASON.REFRIGERANT, pattern: /\b(refrigerant|freon|recover\s+refrigerant|charge\s+refrigerant|sealed\s+hvac)\b/i },
  {
    code: REASON.HEIGHT,
    pattern:
      /\b(roof\s+(repair|access|work|leak)|roof\s+leak|leak\s+on\s+(my\s+)?roof|from\s+the\s+roof|on\s+the\s+roof|climb\s+(on\s+)?the\s+roof|ladder\s+to\s+roof|significant\s+height|dangerous\s+ladder)\b/i,
  },
  {
    code: REASON.STRUCTURAL,
    pattern:
      /\b(structural|load[- ]bearing|foundation\s+(failure|issue)|ceiling\s+(collapse|sagging|cracking|is\s+sagging)|sagging\s+ceiling|support\s+framing|collapse\s+risk|structural\s+movement)\b/i,
  },
  {
    code: REASON.SEWAGE,
    pattern: /\b(sewage|sewer\s+backup|raw\s+sewage|sewage\s+backing\s+up|backing\s+up\s+into\s+the\s+(tub|bathtub|shower|toilet))\b/i,
  },
  { code: REASON.BIOHAZARD, pattern: /\b(biohazard|contaminated\s+water|black\s+water)\b/i },
  { code: REASON.OPEN_FLAME, pattern: /\b(torch|braz(e|ing)|solder(ing)?\s+with\s+flame|open\s+flame)\b/i },
  { code: REASON.FLOOD_ELECTRICAL, pattern: /\bflood(ing)?\b.*\b(electric|panel|outlet)\b/i },
  { code: REASON.EMERGENCY, pattern: /\b(immediate\s+danger|evacuate|call\s+911|emergency\s+services)\b/i },
];

const YELLOW_RULES = [
  { code: 'UNCERTAIN', pattern: /\b(not\s+sure|uncertain|might\s+be|could\s+be)\b/i },
  { code: 'MODERATE_COMPLEXITY', pattern: /\b(moderate|somewhat\s+complex|beyond\s+basic)\b/i },
];

const USER_STOP_PATTERNS = [
  /\b(i\s+don'?t\s+feel\s+safe|i'?m\s+scared|this\s+looks\s+dangerous|i\s+don'?t\s+think\s+i\s+can)\b/i,
  /\b(i\s+don'?t\s+understand|i\s+don'?t\s+have\s+(the\s+)?(right\s+)?tools|beyond\s+my\s+experience|never\s+done\s+(this|electrical|plumbing))\b/i,
  /\b(i'?m\s+not\s+comfortable|i\s+can'?t\s+safely|too\s+dangerous\s+for\s+me|i\s+can'?t\s+reach\s+it\s+safely)\b/i,
];

const EMERGENCY_REASON_CODES = new Set([
  REASON.GAS,
  REASON.FIRE,
  REASON.CO,
  REASON.LIVE_ELECTRICAL,
  REASON.FLOOD_ELECTRICAL,
  REASON.STRUCTURAL,
  REASON.EMERGENCY,
]);

export function detectPromptInjection(text = '') {
  const t = String(text || '');
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(t));
}

export function confidenceBand(confidence) {
  const c = typeof confidence === 'number' ? confidence : 0.5;
  if (c >= 0.75) return 'HIGH_CONFIDENCE';
  if (c >= 0.45) return 'MEDIUM_CONFIDENCE';
  return 'LOW_CONFIDENCE';
}

export function isEmergencyHazard(classified) {
  if (!classified || classified.level !== 'red') return false;
  return (classified.reasonCodes || []).some((code) => EMERGENCY_REASON_CODES.has(code));
}

export function emergencyBannerCopy() {
  return {
    title: 'Potential Emergency',
    body: 'Stop DIY. If there is immediate danger, leave the area and contact the appropriate emergency service, utility, fire department, or other emergency authority. FixBridge is not a 911 service, fire department, gas utility, medical emergency service, or emergency-response provider.',
  };
}

export function detectUserDiyStopRequest(text = '') {
  const t = String(text || '');
  return USER_STOP_PATTERNS.some((pattern) => pattern.test(t));
}

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

  if (detectUserDiyStopRequest(t)) {
    return {
      level: 'yellow',
      reasonCodes: [REASON.USER_STOP],
      reasons: ['Homeowner indicated uncertainty or discomfort — recommend professional help.'],
      userStopRequested: true,
    };
  }

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
      confidenceBand: confidenceBand(confidence),
      emergencyRecommended: [...new Set(reasonCodes)].some((c) => EMERGENCY_REASON_CODES.has(c)),
    };
  }

  // Conservative uncertainty: low confidence biases toward limited guidance, not aggressive DIY.
  if (confidence < 0.4) {
    return {
      level: 'yellow',
      reasonCodes: ['LOW_CONFIDENCE'],
      reasons: ['Assessment confidence is limited — use caution and consider professional help.'],
      confidenceBand: confidenceBand(confidence),
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
      confidenceBand: confidenceBand(confidence),
    };
  }

  return {
    level: 'green',
    reasonCodes: [],
    reasons: [],
    confidenceBand: confidenceBand(confidence),
  };
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
    [REASON.USER_STOP]: 'Homeowner uncertainty or discomfort',
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

const CORE_SAFETY_RULES = `Never assume the physical environment matches the user's description.
Never represent an AI diagnosis as guaranteed.
Prefer conservative escalation when uncertainty could create injury or property risk.
Never encourage a homeowner to continue if they say they feel unsafe, uncertain, unable, or uncomfortable.
If the homeowner states they do not feel safe, are scared, do not understand, lack tools, or think the situation is dangerous, STOP procedural repair guidance and recommend professional assistance.
Do not use language such as "this is definitely safe", "you can safely do this", or "there is no risk".
Prefer phrasing such as "if you can safely access the area", "if this is within your experience and comfort level", and "stop if conditions differ from what is described".
Do not rely solely on AI guidance for safety-critical decisions.`;

export function guidancePolicyForRisk(level) {
  if (level === 'red') {
    return {
      mode: 'red',
      allowRepairSteps: false,
      systemPrompt: `DIY SAFETY: RED — NO DANGEROUS REPAIR INSTRUCTIONS.
${CORE_SAFETY_RULES}
Do NOT provide step-by-step repair procedures, invasive troubleshooting, or tool-based repair guidance.
Only provide: immediate safety guidance, shut-off guidance where safe, damage-control guidance, evacuation/emergency guidance when appropriate, and recommend Request a Professional.
For immediate emergencies, tell the homeowner to contact the appropriate emergency service or utility.
Structure: Potential safety risk detected → Safe actions now → Avoid → Get professional help.`,
    };
  }
  if (level === 'yellow') {
    return {
      mode: 'yellow',
      allowRepairSteps: false,
      systemPrompt: `DIY SAFETY: YELLOW — LOW-RISK GUIDANCE ONLY.
${CORE_SAFETY_RULES}
You may help with visual inspection, checking user-accessible controls, identifying symptoms, shutting off equipment using normal homeowner controls, and gathering information for a contractor.
Do NOT provide invasive repair instructions. Always keep professional help available.`,
    };
  }
  return {
    mode: 'green',
    allowRepairSteps: true,
    systemPrompt: `DIY SAFETY: GREEN — guided DIY allowed with safety reminders.
${CORE_SAFETY_RULES}
Provide step-by-step guidance for low-risk homeowner-safe tasks only when appropriate. Remind user to stop if unsafe or beyond ability.`,
  };
}

export function redSafetyReply() {
  return `**Potential Safety Risk Detected**

Based on the information provided, this situation may involve a safety risk. Do not attempt the repair yourself.

**Safe actions you can take now:**
1. Stop using the affected equipment.
2. Shut off utilities only if you can do so safely.
3. Leave the area and contact emergency services or your utility provider if there is immediate danger.

**Avoid:** invasive repair steps, opening panels, gas line work, roof/height work, or continuing previous repair steps.

Request a licensed professional through FixBridge for on-site help.`;
}

export function yellowStopReply() {
  return `Thank you for letting us know. Please stop the DIY process for now.

If you are unsure, uncomfortable, lack the proper tools or experience, or do not feel safe, FixBridge can help you request a qualified service professional instead of continuing on your own.`;
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
