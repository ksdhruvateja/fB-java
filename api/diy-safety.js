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

/*
 * Active hazards: conditions that are happening NOW. Only these (plus an emergency urgency or a
 * model-flagged critical factor) stop all DIY. Mentioning a system (HVAC, electrical, roofing)
 * is not a hazard. Each pattern ignores matches that are negated ("no gas smell").
 */
const HAZARD_RULES = [
  { code: REASON.GAS, pattern: /\b(gas\s*(leak|smell|odou?r)|smell(s|ing)?\s+(of\s+)?gas|rotten[- ]egg\s+smell|hissing\s+(from|at|near)\s+(the\s+)?gas)\b/i },
  { code: REASON.FIRE, pattern: /\b(active\s+fire|on\s+fire|caught\s+fire|flames?\s+(coming|shooting|from)|smoke\s+(everywhere|filling|pouring|coming\s+(out|from)))\b/i },
  { code: REASON.CO, pattern: /\b(carbon\s*monoxide|co\s+(alarm|detector)\s+(is\s+)?(going\s+off|sounding|beeping|alarming|triggered)|co\s+keeps\s+alarm)/i },
  {
    code: REASON.LIVE_ELECTRICAL,
    pattern: /\b(sparking|sparks?\s+(from|coming|when|at)|arcing|exposed\s+(live\s+)?(wire|wiring|conductors?)|live\s+wires?|(got|getting|felt)\s+(a\s+)?shock(ed)?|burning\s+(smell|odou?r)\s+(from|at|near)\s+(the\s+)?(outlet|panel|breaker|switch|wiring|fixture)|(outlet|panel|breaker|switch|plug|cord)\s+(is\s+)?(melted|melting|scorched|charred|smoking|hot\s+to\s+the\s+touch))\b/i,
  },
  {
    code: REASON.STRUCTURAL,
    pattern: /\b(ceiling\s+(collaps\w*|is\s+sagging|sagging|bulging)|sagging\s+ceiling|collapse\s+risk|(wall|floor|beam|joist)\s+(is\s+)?(collapsing|giving\s+way|buckling)|structural\s+(failure|movement))\b/i,
  },
  { code: REASON.SEWAGE, pattern: /\b(raw\s+sewage|sewer\s+backup|sewage\s+(backing\s+up|backup|overflow\w*)|backing\s+up\s+into\s+the\s+(tub|bathtub|shower|toilet|floor drain))\b/i },
  { code: REASON.BIOHAZARD, pattern: /\b(biohazard|black\s+water|contaminated\s+(flood\s+)?water)\b/i },
  {
    code: REASON.FLOOD_ELECTRICAL,
    pattern: /\b(flood(ed|ing)?|standing\s+water|water\s+pouring)\b[^.]{0,60}\b(electric\w*|panel|outlets?|breaker|wiring)\b|\b(panel|outlets?|breaker|wiring)\b[^.]{0,40}\b(under\s+water|submerged|flooded)\b/i,
  },
  { code: REASON.EMERGENCY, pattern: /\b(immediate\s+danger|evacuat\w+|call(ed)?\s+911|emergency\s+services)\b/i },
];

/*
 * Risk factors: what makes a repair riskier. They set severity, the confirmation requirement and
 * the guardrails shown to the homeowner. `detect` lists [pattern, severity] pairs; the highest
 * matching severity wins. A factor at `professionalOnlyAt` severity leaves only safe actions.
 */
const SEVERITY_RANK = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

export const RISK_FACTORS = {
  mains_electrical: {
    label: 'Household (mains) electrical',
    detect: [
      [/\b(outlets?|receptacles?|light\s+switch(es)?|wall\s+switch|dimmer|light\s+fixtures?|ceiling\s+fan|gfci|afci|breakers?|wiring|junction\s+box|hardwired|240\s*v|120\s*v)\b/i, 'medium'],
      [/\b(electrical|breaker|main|service)\s+panel\b|\bload\s*center\b|\baluminum\s+wiring\b|\bknob[- ]and[- ]tube\b|\bfuse\s+box\b|\bbreaker\s+(keeps|won'?t)\b/i, 'high'],
    ],
    professionalOnlyAt: 'high',
    allowed: [
      'Turn power off at the breaker or switch you normally use, from a dry spot.',
      'Confirm the power is off with a non-contact voltage tester before touching anything.',
      'Reset a tripped breaker or GFCI once. If it trips again, stop.',
      'Like-for-like replacement of a switch, outlet or light fixture on a circuit confirmed off, only if this is within your experience. Local rules may require a permit.',
    ],
    prohibited: [
      'Opening or working inside the electrical panel, or replacing breakers',
      'Working on any circuit that is still energized',
      'Adding or extending circuits or wiring',
      'Bypassing GFCI/AFCI protection, breakers or fuses',
    ],
  },
  gas: {
    label: 'Gas appliance or gas supply',
    detect: [
      [/\b(gas\s+(water\s+heater|furnace|range|stove|oven|dryer|fireplace|boiler|appliance)|pilot(\s+light)?|burner|propane|natural\s+gas|thermocouple)\b/i, 'medium'],
      [/\bgas\s+(line|pipe|piping|meter|regulator|connector|fitting)s?\b/i, 'high'],
    ],
    professionalOnlyAt: 'high',
    allowed: [
      'Turn the appliance off at its own control, or close the appliance shut-off valve.',
      'Relight a pilot only by following the instructions printed on the appliance, and only if there is no gas smell.',
      'Check the thermostat setting, filter and power switch.',
    ],
    prohibited: [
      'Loosening, tightening, disconnecting or sealing any gas pipe, connector or fitting',
      'Taking apart or adjusting the gas valve or burners',
      'Testing for leaks with a flame',
    ],
  },
  refrigerant_sealed_system: {
    label: 'Sealed cooling system (refrigerant)',
    detect: [
      [/\b(air\s+condition\w*|a\/?c\s+unit|ac\s+(unit|not|isn'?t|won'?t)|heat\s+pump|condenser|evaporator|mini[- ]split)\b/i, 'low'],
      [/\b(refrigerant|freon|r-?22|r-?410a?|compressor|capacitor|contactor|line\s+set|frozen\s+(coil|line)|ice\s+on\s+the\s+(coil|line))\b/i, 'medium'],
    ],
    professionalOnlyAt: 'high',
    allowed: [
      'Check thermostat mode, setpoint and batteries.',
      'Replace the air filter.',
      'Clear the condensate drain line and reset the float switch.',
      'Turn the outdoor unit off at its disconnect before rinsing the coil with a garden hose or clearing debris.',
    ],
    prohibited: [
      'Adding, recovering or venting refrigerant, or opening the sealed system',
      'Touching, discharging or replacing capacitors or contactors',
      'Removing access panels on equipment that is still powered',
    ],
  },
  working_at_height: {
    label: 'Working at height (roof or ladder)',
    detect: [
      [/\b(gutters?|downspouts?|skylight|soffit|fascia|ladder|attic)\b/i, 'low'],
      [/\b(roof\w*|shingles?|flashing|chimney)\b/i, 'medium'],
      [/\b(two[- ]stor(y|ey)|2[- ]stor(y|ey)|second[- ]stor(y|ey)|steep\s+roof|wet\s+roof|icy\s+roof|tile\s+roof|slate\s+roof)\b/i, 'high'],
    ],
    professionalOnlyAt: 'high',
    allowed: [
      'Inspect from the ground (binoculars help) and from the attic or inside the home.',
      'Contain water inside: buckets, towels, plastic sheeting, and move belongings.',
      'Take photos of stains and drips for the professional.',
      'Ladder work at gutter height on a single-story home only, with a helper holding the ladder.',
    ],
    prohibited: [
      'Walking or working on the roof surface',
      'Ladder work above single-story height, or on wet, icy or windy days',
    ],
  },
  structural: {
    label: 'Structure (framing, foundation)',
    detect: [
      [/\b(drywall\s+crack|hairline\s+crack|nail\s+pops?)\b/i, 'low'],
      [/\b(load[- ]bearing|joists?|beams?|rafters?|trusse?s?|foundation|footing|structural)\b/i, 'medium'],
      [/\b(crack\w*\s+(wider|growing|spreading)|doors?\s+(suddenly\s+)?(sticking|won'?t\s+close)\s+and\s+crack|stair-?step\s+crack)\b/i, 'high'],
    ],
    professionalOnlyAt: 'high',
    allowed: [
      'Mark the ends of cracks and date them to see whether they grow.',
      'Take photos for the professional.',
      'Cosmetic patching of hairline drywall cracks.',
    ],
    prohibited: [
      'Cutting, notching, drilling or removing framing members',
      'Jacking, shoring or removing walls',
    ],
  },
  water_near_electrical: {
    label: 'Water near electrical',
    detect: [
      [/\b(water|leak\w*|drip\w*|wet|damp)\b[^.]{0,50}\b(outlets?|light\s+fixtures?|wiring|electrical|switch|panel)\b|\b(outlets?|light\s+fixtures?|wiring|switch|panel)\b[^.]{0,50}\b(water|leak\w*|drip\w*|wet|damp)\b/i, 'high'],
    ],
    professionalOnlyAt: 'high',
    allowed: [
      'Turn that circuit off at the breaker only if you can reach the panel without standing in or touching water.',
      'Contain the water with buckets and towels away from the fixture.',
    ],
    prohibited: ['Touching wet electrical devices or fixtures', 'Using electrical tools while standing in water'],
  },
  open_flame: {
    label: 'Open flame (torch work)',
    detect: [[/\b(torch|solder\w*|braz\w*|sweat(ing)?\s+(a\s+)?(joint|fitting|pipe))\b/i, 'medium']],
    professionalOnlyAt: 'critical',
    allowed: ['Use push-to-connect or compression fittings instead of soldering.'],
    prohibited: ['Using a torch or open flame'],
  },
  pressurized_hot_water: {
    label: 'Pressurized hot water (water heater, boiler)',
    detect: [
      [/\b(water\s+heater|hot\s+water\s+tank|expansion\s+tank)\b/i, 'low'],
      [/\b(t\s*&\s*p|temperature\s+(and|&)\s+pressure|relief\s+valve|tpr\s+valve|boiler)\b/i, 'medium'],
      // Scalding alone also describes a faucet's hot line; it is a heater hazard only next to one.
      [/\b(water\s+heater|hot\s+water\s+tank)\b[^.]{0,80}\bscald\w*|\bscald\w*[^.]{0,80}\b(water\s+heater|hot\s+water\s+tank)\b/i, 'medium'],
    ],
    professionalOnlyAt: 'high',
    allowed: [
      'Turn the heater off or to vacation mode and close the cold-water supply valve.',
      'Let the water cool before draining or flushing, and follow the manual.',
    ],
    prohibited: ['Capping, plugging or removing the temperature-and-pressure relief valve', 'Setting the water temperature above 120°F (49°C)'],
  },
  hazardous_material: {
    label: 'Possible asbestos, lead or heavy mold',
    detect: [
      [/\b(mold|mildew)\b/i, 'low'],
      [/\b(asbestos|vermiculite|lead\s+paint|popcorn\s+ceiling|pre-?19[5-7]\d|built\s+(in|before)\s+19[0-7]\d|black\s+mold)\b/i, 'medium'],
      [/\b(mold\s+(covering|over|everywhere)|large\s+area\s+of\s+mold)\b/i, 'high'],
    ],
    professionalOnlyAt: 'high',
    allowed: ['Leave suspected material undisturbed.', 'Use a test kit or professional testing first.'],
    prohibited: ['Sanding, scraping, cutting, drilling or demolishing suspected asbestos or lead paint'],
  },
  chemical: {
    label: 'Household chemicals',
    detect: [[/\b(drain\s+cleaner|bleach|ammonia|muriatic|acid|lye|caustic)\b/i, 'low']],
    professionalOnlyAt: 'critical',
    allowed: ['Wear gloves and eye protection and ventilate the area.', 'Try a plunger or drain snake before chemicals.'],
    prohibited: ['Mixing cleaners or chemicals (for example bleach with ammonia or acids)', 'Plunging after a chemical drain cleaner was used'],
  },
  sanitation: {
    label: 'Sewage or wastewater contact',
    detect: [[/\b(sewer\s+(smell|gas|line)|toilet\s+overflow\w*|septic|wastewater|main\s+drain\s+clog)\b/i, 'medium']],
    professionalOnlyAt: 'high',
    allowed: ['Wear gloves and eye protection, ventilate, and disinfect surfaces afterwards.'],
    prohibited: ['Opening the main sewer cleanout while drains are backed up'],
  },
};

/*
 * Instructions Fixera never gives a homeowner, whatever the category or the homeowner's
 * confirmation. They are matched against every DIY step and every chat reply; a negated mention
 * ("do not open the panel") is a warning, not an instruction, and is kept.
 */
const PROHIBITED_INSTRUCTION_RULES = [
  { factor: 'mains_electrical', pattern: /\b(remove|open|take\s+off|unscrew|pull)\b[^.;]{0,30}\b(electrical\s+|breaker\s+|main\s+|service\s+)?(panel(\s+cover)?|dead\s*front|load\s*center|fuse\s+box)\b/i },
  { factor: 'mains_electrical', pattern: /\b(replace|swap|install|add|remove)\b[^.;]{0,20}\b(the\s+|a\s+|new\s+)?(circuit\s+)?breakers?\b/i },
  { factor: 'mains_electrical', pattern: /\b(while|with)\s+(the\s+)?(power|circuit|breaker)\s+(is\s+|still\s+)?(on|live|energi[sz]ed)\b|\bwork(ing)?\s+(on\s+it\s+)?live\b/i },
  { factor: 'mains_electrical', pattern: /\b(run|add|extend|install)\b[^.;]{0,20}\b(new\s+)?(circuit|branch\s+circuit|wiring\s+run|cable\s+run)\b/i },
  { factor: 'mains_electrical', pattern: /\b(bypass|jumper|disable|tape\s+down|defeat)\b[^.;]{0,25}\b(gfci|afci|breaker|fuse|limit\s+switch|float\s+switch|safety\s+(switch|device)|pressure\s+switch|rollout)\b/i },
  { factor: 'gas', pattern: /\b(loosen|tighten|disconnect|reconnect|remove|replace|install|cut|seal|tape|dope|re-?pipe)\b[^.;]{0,40}\bgas\s*(line|pipe|piping|fitting|connector|flex|union|regulator|valve\s+body)\b/i },
  { factor: 'gas', pattern: /\b(disassemble|take\s+apart|adjust|remove)\b[^.;]{0,25}\b(gas\s+valve|burners?|orifice|manifold\s+pressure)\b/i },
  { factor: 'gas', pattern: /\b(lighter|match|flame)\b[^.;]{0,30}\b(find|check|test)\b[^.;]{0,20}\bleak|\b(find|check|test)\b[^.;]{0,20}\bleak[^.;]{0,30}\b(lighter|match|flame)\b/i },
  { factor: 'refrigerant_sealed_system', pattern: /\b(add|charge|recharge|top\s+(off|up)|recover|vent|release|refill)\b[^.;]{0,25}\b(refrigerant|freon|r-?22|r-?410a?)\b|\b(refrigerant|freon)\s+(recharge|charge|top[- ]off)\b/i },
  { factor: 'refrigerant_sealed_system', pattern: /\b(cut|braze|open|unscrew|depress)\b[^.;]{0,25}\b(line\s+set|refrigerant\s+line|suction\s+line|liquid\s+line|service\s+port|schrader)\b/i },
  { factor: 'refrigerant_sealed_system', pattern: /\b(discharge|short|touch|replace|swap|test|remove)\b[^.;]{0,25}\b(the\s+|a\s+)?(run\s+|start\s+|dual\s+)?(capacitor|contactor)\b/i },
  { factor: 'working_at_height', pattern: /\b(climb|get|go|walk|step|stand|kneel|crawl)\b[^.;]{0,20}\b(on|onto|up\s+on|up\s+to|across)\s+(the\s+|your\s+)?roof\b/i },
  { factor: 'working_at_height', pattern: /\b(replace|remove|nail|lift|pry|re-?seal|install)\b[^.;]{0,30}\b(shingles?|roof\s+flashing|ridge\s+cap|roof\s+tiles?|chimney\s+flashing)\b/i },
  { factor: 'structural', pattern: /\b(cut|notch|drill|remove|sister|jack|shore)\b[^.;]{0,30}\b(joists?|beams?|rafters?|trusse?s?|load[- ]bearing|studs?\s+in\s+a\s+load)\b/i },
  { factor: 'pressurized_hot_water', pattern: /\b(cap|plug|remove|block|disable)\b[^.;]{0,25}\b(t\s*&\s*p|temperature\s+(and|&)\s+pressure|relief)\s*valve\b/i },
  { factor: 'open_flame', pattern: /\b(use|light|heat|apply)\b[^.;]{0,25}\b(a\s+|the\s+)?(propane\s+|mapp\s+)?torch\b|\b(solder|braze|sweat)\b[^.;]{0,25}\b(joint|fitting|pipe)\b/i },
  { factor: 'hazardous_material', pattern: /\b(sand|scrape|cut|drill|demolish|remove)\b[^.;]{0,30}\b(asbestos|vermiculite|lead\s+paint|popcorn\s+ceiling)\b/i },
  { factor: 'chemical', pattern: /\bmix\w*\b[^.;]{0,30}\b(bleach|ammonia|acid|vinegar|cleaners?|chemicals?)\b[^.;]{0,30}\b(with|and)\b/i },
];

const NEGATION_BEFORE = /\b(do\s+not|don'?t|never|avoid|without|no\s+need\s+to|not|no|isn'?t|aren'?t|wasn'?t|stop\s+(and|if)|instead\s+of|rather\s+than|unless\s+a\s+professional|a\s+(licensed\s+)?professional\s+(should|must|will)|leave\s+(it\s+)?to)\b[^.;]*$/i;

function isNegatedAt(sentence, index) {
  const before = sentence.slice(Math.max(0, index - 60), index);
  return NEGATION_BEFORE.test(before);
}

function findUnnegated(pattern, text) {
  const t = String(text || '');
  const sentences = t.split(/(?<=[.!?;\n])\s+/);
  for (const sentence of sentences) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    let m;
    while ((m = re.exec(sentence))) {
      if (!isNegatedAt(sentence, m.index)) return m[0];
      if (m[0].length === 0) re.lastIndex += 1;
    }
  }
  return null;
}

/** Returns the guardrails (factor codes) an instruction would break, ignoring negated mentions. */
export function findGuardrailViolations(text = '') {
  const violated = [];
  for (const rule of PROHIBITED_INSTRUCTION_RULES) {
    if (findUnnegated(rule.pattern, text)) violated.push(rule.factor);
  }
  return [...new Set(violated)];
}

export function detectActiveHazards(text = '') {
  const codes = [];
  for (const rule of HAZARD_RULES) {
    if (findUnnegated(rule.pattern, text)) codes.push(rule.code);
  }
  return [...new Set(codes)];
}

function maxSeverity(a, b) {
  return (SEVERITY_RANK[a] || 0) >= (SEVERITY_RANK[b] || 0) ? a : b;
}

export function detectRiskFactors(text = '') {
  const found = {};
  for (const [code, def] of Object.entries(RISK_FACTORS)) {
    for (const [pattern, severity] of def.detect) {
      const hit = findUnnegated(pattern, text);
      if (hit) {
        const prev = found[code];
        if (!prev || SEVERITY_RANK[severity] > SEVERITY_RANK[prev.severity]) {
          found[code] = { code, severity, evidence: hit, source: 'rules' };
        }
      }
    }
  }
  return found;
}

const AI_FACTOR_ALIASES = {
  electrical: 'mains_electrical',
  electric: 'mains_electrical',
  gas_appliance: 'gas',
  refrigerant: 'refrigerant_sealed_system',
  hvac_sealed_system: 'refrigerant_sealed_system',
  height: 'working_at_height',
  roof: 'working_at_height',
  fall: 'working_at_height',
  water_electrical: 'water_near_electrical',
  combustion: 'open_flame',
  torch: 'open_flame',
  // A hot supply line or line pressure is not a water heater; those stay generic factors so the
  // heater-specific guardrails are not shown for faucet or pipe work.
  water_heater: 'pressurized_hot_water',
  boiler: 'pressurized_hot_water',
  asbestos: 'hazardous_material',
  lead: 'hazardous_material',
  mold: 'hazardous_material',
  chemicals: 'chemical',
  sewage: 'sanitation',
};

/** Normalizes the model's risk_factors list. Unknown codes are kept as their own factor. */
export function normalizeAiRiskFactors(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = String(item.code || item.factor || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (!raw) return null;
      const code = AI_FACTOR_ALIASES[raw] || raw;
      const severityRaw = String(item.severity || 'low').toLowerCase();
      const severity = SEVERITY_RANK[severityRaw] != null && severityRaw !== 'none' ? severityRaw : 'low';
      if (item.present === false) return null;
      return {
        code: code.slice(0, 40),
        severity,
        evidence: String(item.evidence || item.reason || '').trim().slice(0, 240),
        source: 'ai',
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

function stepText(step) {
  if (typeof step === 'string') return step;
  if (!step || typeof step !== 'object') return '';
  return [step.title, step.instruction, step.goal, step.explanation].filter(Boolean).join('. ');
}

function factorLabel(code) {
  return RISK_FACTORS[code]?.label || code.replace(/_/g, ' ');
}

const SEVERITY_WORD = { low: 'low', medium: 'moderate', high: 'high', critical: 'critical' };

/**
 * Evaluates a structured assessment on its actual risk factors, complexity and guardrails.
 * Returns the assessment with only guardrail-permitted DIY guidance, plus a `diy_safety`
 * rationale. Homeowner confirmation is recorded elsewhere and never changes this output.
 */
export function evaluateDiySafety(assessment, { description = '' } = {}) {
  if (!assessment || typeof assessment !== 'object') return assessment;
  const asArr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

  // Evidence about the situation itself. Stop conditions and safety notes are warnings the model
  // wrote, not observations, so they are not scanned for hazards.
  const situationText = [
    description,
    assessment.summary,
    ...asArr(assessment.visual_findings),
    ...asArr(assessment.observed_evidence),
  ].filter(Boolean).join('. ');
  const repairText = [
    situationText,
    assessment.problem_classification,
    assessment.service_subcategory,
    ...asArr(assessment.likely_causes),
    ...(Array.isArray(assessment.diy_steps) ? assessment.diy_steps.map(stepText) : []),
    ...(Array.isArray(assessment.diy_guide_steps) ? assessment.diy_guide_steps.map(stepText) : []),
    ...(Array.isArray(assessment.tools_required) ? assessment.tools_required.map((t) => t?.name || t) : []),
    ...(Array.isArray(assessment.materials_needed) ? assessment.materials_needed.map((t) => t?.name || t) : []),
  ].filter(Boolean).join('. ');

  // 1. Factors: deterministic floor, raised (never lowered) by the model's own judgement.
  const factors = detectRiskFactors(repairText);
  for (const f of normalizeAiRiskFactors(assessment.risk_factors)) {
    const prev = factors[f.code];
    if (!prev) factors[f.code] = f;
    else factors[f.code] = { ...prev, severity: maxSeverity(prev.severity, f.severity), evidence: f.evidence || prev.evidence, source: 'ai+rules' };
  }
  const factorList = Object.values(factors).sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  // 2. Active hazards.
  const hazards = detectActiveHazards(situationText);
  const urgency = String(assessment.urgency || '').toLowerCase();
  if (urgency.includes('emerg') && !hazards.includes(REASON.EMERGENCY)) hazards.push(REASON.EMERGENCY);
  for (const f of factorList) if (f.severity === 'critical' && !hazards.includes(f.code)) hazards.push(f.code);

  // 3. Guardrails apply to every step, whatever the category.
  const removed = [];
  const keepStep = (step) => {
    const violations = findGuardrailViolations(stepText(step));
    if (violations.length) {
      removed.push({ step: stepText(step).slice(0, 160), guardrails: violations });
      for (const v of violations) if (!factors[v]) factors[v] = { code: v, severity: 'medium', evidence: 'A suggested step needed this', source: 'guardrail' };
      return false;
    }
    return true;
  };
  let diySteps = Array.isArray(assessment.diy_steps) ? assessment.diy_steps.filter(keepStep) : [];
  let guideSteps = Array.isArray(assessment.diy_guide_steps) ? assessment.diy_guide_steps.filter(keepStep) : [];
  const toolPattern = /\b(refrigerant\s+gauges?|manifold\s+gauges?|recovery\s+machine|vacuum\s+pump|(propane|mapp)\s+torch|brazing|solder\b|roof\s+harness)\b/i;
  const tools = Array.isArray(assessment.tools_required) ? assessment.tools_required.filter((t) => !toolPattern.test(t?.name || String(t || ''))) : [];
  const finalFactors = Object.values(factors).sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  const reasons = [];
  const reasonCodes = [];
  const proOnlyFactors = finalFactors.filter((f) => {
    const at = RISK_FACTORS[f.code]?.professionalOnlyAt || 'high';
    return SEVERITY_RANK[f.severity] >= SEVERITY_RANK[at] && f.severity !== 'critical';
  });
  const modelSaysNoDiy = assessment.safe_diy_allowed === false || assessment.diy_difficulty === 'blocked';
  const hadSteps = (assessment.diy_steps?.length || 0) + (assessment.diy_guide_steps?.length || 0) > 0;
  const leftSteps = diySteps.length + guideSteps.length > 0;

  let decision;
  if (hazards.length) {
    decision = hazards.some((c) => EMERGENCY_REASON_CODES.has(c) || factors[c]?.severity === 'critical') ? 'emergency' : 'professional_only';
    reasonCodes.push(...hazards.map((c) => c.toUpperCase()));
    reasons.push(...hazards.map((c) => `${REASON[c] ? humanReasons([c])[0] : factorLabel(c)}: an active hazard was described or seen, so DIY stops here.`));
  } else if (proOnlyFactors.length) {
    decision = 'professional_only';
    for (const f of proOnlyFactors) {
      reasonCodes.push(f.code.toUpperCase());
      reasons.push(`${factorLabel(f.code)} at ${SEVERITY_WORD[f.severity]} risk${f.evidence ? ` (${f.evidence})` : ''}: only the safe actions below are appropriate.`);
    }
  } else if (modelSaysNoDiy) {
    decision = 'professional_only';
    reasonCodes.push('PROFESSIONAL_JUDGEMENT');
    reasons.push(assessment.diy_safety_rationale
      ? String(assessment.diy_safety_rationale).slice(0, 300)
      : 'The repair itself needs professional skills or equipment.');
  } else if (hadSteps && !leftSteps) {
    decision = 'professional_only';
    reasonCodes.push('NO_STEPS_WITHIN_GUARDRAILS');
    reasons.push('Every suggested repair step was outside the homeowner safety guardrails.');
  } else {
    const concerning = finalFactors.filter((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.medium);
    const complexityRisk = assessment.complexity === 'high' || assessment.diy_difficulty === 'hard';
    if (concerning.length || removed.length || complexityRisk) {
      decision = 'diy_with_guardrails';
      for (const f of concerning) {
        reasonCodes.push(f.code.toUpperCase());
        reasons.push(`${factorLabel(f.code)} (${SEVERITY_WORD[f.severity]} risk)${f.evidence ? `: ${f.evidence}` : ''}.`);
      }
      if (complexityRisk) {
        reasonCodes.push('HIGH_COMPLEXITY');
        reasons.push('The repair is complex for a homeowner; mistakes can cause damage or injury.');
      }
      if (removed.length) {
        reasonCodes.push('STEPS_REMOVED_BY_GUARDRAILS');
        reasons.push(`${removed.length} suggested step${removed.length === 1 ? ' was' : 's were'} removed because ${removed.length === 1 ? 'it is' : 'they are'} outside the homeowner guardrails.`);
      }
    } else if (assessment.complexity === 'medium' || assessment.diy_difficulty === 'moderate') {
      decision = 'diy_with_care';
      reasonCodes.push('MODERATE_COMPLEXITY');
      reasons.push('Moderate difficulty: take your time and stop if anything differs from the guide.');
    } else {
      decision = 'diy_ok';
    }
  }

  const level = decision === 'emergency' || decision === 'professional_only'
    ? 'red'
    : decision === 'diy_ok' ? 'green' : 'yellow';
  const relevant = finalFactors.filter((f) => RISK_FACTORS[f.code]);
  const allowedActions = [...new Set(relevant.flatMap((f) => RISK_FACTORS[f.code].allowed))].slice(0, 10);
  const prohibitedActions = [...new Set(relevant.flatMap((f) => RISK_FACTORS[f.code].prohibited))].slice(0, 10);

  const diySafety = {
    version: 2,
    decision,
    level,
    requires_confirmation: decision === 'diy_with_guardrails',
    reasons,
    reason_codes: [...new Set(reasonCodes)],
    hazards,
    factors: finalFactors.map((f) => ({ ...f, label: factorLabel(f.code) })),
    allowed_actions: allowedActions,
    prohibited_actions: prohibitedActions,
    removed_steps: removed.slice(0, 10),
    removed_steps_count: removed.length,
    summary: {
      emergency: 'An active hazard was identified. Get to safety and use a professional.',
      professional_only: 'This repair needs a professional. Only the safe actions listed are appropriate for you.',
      diy_with_guardrails: 'A safety concern was found. DIY is possible only within the guardrails below, after you confirm.',
      diy_with_care: 'DIY is reasonable with care. Stop if anything differs from the guide.',
      diy_ok: 'Low-risk repair that is suitable for DIY.',
    }[decision],
  };

  const base = {
    ...assessment,
    diy_safety: diySafety,
    diy_risk_level: level,
    diy_risk_reasons: reasons,
    diy_risk_reason_codes: diySafety.reason_codes,
  };
  if (level === 'red') {
    return {
      ...base,
      safe_diy_allowed: false,
      professional_required: true,
      diy_difficulty: 'blocked',
      diy_steps: [],
      diy_guide_steps: [],
      tools_required: [],
      materials_needed: [],
    };
  }
  return {
    ...base,
    diy_steps: diySteps,
    diy_guide_steps: guideSteps,
    tools_required: tools,
    safe_diy_allowed: true,
    professional_required: level === 'yellow' ? assessment.professional_required !== false : assessment.professional_required === true,
    diy_difficulty: assessment.diy_difficulty && assessment.diy_difficulty !== 'blocked'
      ? assessment.diy_difficulty
      : level === 'green' ? 'easy' : 'moderate',
  };
}

/**
 * Removes sentences that give instructions outside the guardrails from free text (chat replies).
 * Returns { text, removed }.
 */
export function enforceGuardrailsOnText(text = '') {
  const lines = String(text || '').split('\n');
  let removed = 0;
  const kept = lines.map((line) => {
    const parts = line.split(/(?<=[.!?])\s+/);
    const ok = parts.filter((part) => {
      if (findGuardrailViolations(part).length) {
        removed += 1;
        return false;
      }
      return true;
    });
    return ok.join(' ');
  });
  let out = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (removed) {
    out += '\n\n_Fixera left out instructions that are outside the homeowner safety guardrails for this repair. A FixBridge professional can handle that part._';
  }
  return { text: out, removed };
}

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

/**
 * Risk level for free text (chat messages, consent context) and, optionally, a stored assessment.
 * Text can only escalate: an active hazard makes it red, a new medium+ risk factor makes green
 * yellow. The stored assessment's own level comes from evaluateDiySafety.
 */
export function classifyDiyRiskLevel(text = '', assessment = null) {
  const t = String(text || '');
  const confidence = typeof assessment?.confidence === 'number' ? assessment.confidence : 0.5;

  if (detectUserDiyStopRequest(t)) {
    return {
      level: 'yellow',
      reasonCodes: [REASON.USER_STOP],
      reasons: ['Homeowner indicated uncertainty or discomfort — recommend professional help.'],
      userStopRequested: true,
    };
  }

  const hazards = detectActiveHazards(t);
  if (hazards.length) {
    return {
      level: 'red',
      reasonCodes: hazards,
      reasons: humanReasons(hazards),
      confidenceBand: confidenceBand(confidence),
      emergencyRecommended: hazards.some((c) => EMERGENCY_REASON_CODES.has(c)),
    };
  }

  let stored = null;
  if (assessment && typeof assessment === 'object') {
    stored = assessment.diy_safety?.version >= 2 ? assessment : evaluateDiySafety(assessment, { description: t });
  }
  const storedLevel = stored?.diy_risk_level || stored?.diy_safety?.level || 'green';
  const reasonCodes = [...(stored?.diy_safety?.reason_codes || [])];
  const reasons = [...(stored?.diy_safety?.reasons || [])];

  if (storedLevel === 'red') {
    return {
      level: 'red',
      reasonCodes,
      reasons,
      confidenceBand: confidenceBand(confidence),
      emergencyRecommended: stored?.diy_safety?.decision === 'emergency',
    };
  }

  const textFactors = Object.values(detectRiskFactors(t)).filter((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.medium);
  if (storedLevel === 'yellow' || textFactors.length) {
    for (const f of textFactors) {
      reasonCodes.push(f.code.toUpperCase());
      reasons.push(`${factorLabel(f.code)} (${SEVERITY_WORD[f.severity]} risk)`);
    }
    return {
      level: 'yellow',
      reasonCodes: [...new Set(reasonCodes.length ? reasonCodes : ['LIMITED_GUIDANCE'])],
      reasons: reasons.length ? reasons : ['DIY guidance stays within the safety guardrails.'],
      confidenceBand: confidenceBand(confidence),
    };
  }

  return { level: 'green', reasonCodes: [], reasons: [], confidenceBand: confidenceBand(confidence) };
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
      systemPrompt: `DIY SAFETY: YELLOW — GUIDANCE ONLY WITHIN THE SAFETY GUARDRAILS.
${CORE_SAFETY_RULES}
A safety concern applies to this repair. Help only with the permitted actions listed in the guardrails (and with visual inspection, user-accessible controls, shutting off equipment using normal homeowner controls, and gathering information for a contractor).
Never give instructions for a prohibited action, even if the homeowner insists, says they are experienced, or says they accept the risk. Explain that a professional handles that part. Always keep professional help available.`,
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

**Avoid:** invasive repair steps, opening electrical panels, gas line work, walking on the roof, or continuing previous repair steps.

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
