/**
 * Reads a work-order dispatch email (pasted text or an uploaded .eml/.txt) into job fields.
 * Deterministic on purpose: every value can be traced to a line of the original email, and
 * anything missing, unclear or contradictory becomes a review flag instead of a guess.
 */
import crypto from 'node:crypto';

// ── Labels ────────────────────────────────────────────────────────────────────
// Label text (lowercase, '#'/'no.'/'number' removed) → field. "numbered" labels (Store #) map separately.
const LABELS = {
  'work order': 'wo', 'wo': 'wo', 'w/o': 'wo', 'workorder': 'wo', 'work order id': 'wo', 'wo id': 'wo',
  'tracking': 'wo_alt', 'ticket': 'wo_alt', 'service request': 'wo_alt', 'sr': 'wo_alt', 'call': 'wo_alt',
  'dispatch': 'wo_alt', 'request': 'wo_alt', 'reference': 'wo_alt', 'ref': 'wo_alt', 'incident': 'wo_alt',
  'po': 'po', 'purchase order': 'po', 'p.o.': 'po',
  'nte': 'nte', 'not to exceed': 'nte', 'nte amount': 'nte', 'not-to-exceed': 'nte', 'not to exceed amount': 'nte',
  'authorized amount': 'nte', 'nte limit': 'nte',
  'priority': 'priority', 'urgency': 'priority', 'response priority': 'priority', 'priority level': 'priority',
  'due': 'due', 'due date': 'due', 'due by': 'due', 'respond by': 'due', 'complete by': 'due', 'required by': 'due',
  'needed by': 'due', 'response due': 'due', 'target date': 'due', 'expected completion': 'due', 'arrive by': 'due',
  'arrival by': 'due', 'scheduled date': 'due', 'schedule date': 'due', 'eta required': 'due', 'due date/time': 'due',
  'site': 'site_name', 'site name': 'site_name', 'location': 'site_name', 'location name': 'site_name', 'store': 'site_name',
  'store name': 'site_name', 'property': 'site_name', 'facility': 'site_name', 'building': 'site_name',
  'address': 'address', 'site address': 'address', 'location address': 'address', 'service address': 'address',
  'store address': 'address', 'property address': 'address', 'street': 'address', 'street address': 'address',
  'city': 'city', 'state': 'state', 'zip': 'zip', 'zip code': 'zip', 'postal code': 'zip', 'city/state/zip': 'city_line',
  'client': 'dispatcher', 'customer': 'dispatcher', 'dispatched by': 'dispatcher', 'dispatching company': 'dispatcher',
  'issued by': 'dispatcher', 'company': 'dispatcher',
  'bill to': 'billing', 'billing customer': 'billing', 'invoice to': 'billing', 'billing company': 'billing', 'bill-to': 'billing',
  'contact': 'contact', 'site contact': 'contact', 'store contact': 'contact', 'contact name': 'contact', 'requester': 'contact',
  'requested by': 'contact', 'manager': 'contact', 'store manager': 'contact', 'on-site contact': 'contact', 'poc': 'contact',
  'phone': 'phone', 'contact phone': 'phone', 'store phone': 'phone', 'site phone': 'phone', 'tel': 'phone', 'telephone': 'phone',
  'email': 'email', 'contact email': 'email', 'e-mail': 'email',
  'scope': 'scope', 'scope of work': 'scope', 'description': 'scope', 'problem': 'scope', 'problem description': 'scope',
  'issue': 'scope', 'work requested': 'scope', 'details': 'scope', 'work description': 'scope', 'service requested': 'scope',
  'problem code': 'scope_extra', 'notes': 'scope_extra', 'special instructions': 'scope_extra', 'comments': 'scope_extra',
  'trade': 'trade', 'category': 'trade', 'service type': 'trade', 'craft': 'trade', 'discipline': 'trade',
  'approval': 'approval', 'approval conditions': 'approval', 'approval required': 'approval', 'authorization': 'approval',
  'approval instructions': 'approval', 'authorization required': 'approval',
  'billing instructions': 'billing_instr', 'invoice instructions': 'billing_instr', 'invoicing': 'billing_instr',
  'invoicing instructions': 'billing_instr', 'invoice submission': 'billing_instr', 'billing notes': 'billing_instr',
  'access': 'access', 'access instructions': 'access', 'gate code': 'access', 'access notes': 'access', 'store hours': 'access',
  'site hours': 'access', 'hours': 'access', 'lockbox': 'access', 'access hours': 'access',
  'check in': 'checkin', 'check-in': 'checkin', 'checkin': 'checkin', 'check in instructions': 'checkin',
  'check-in instructions': 'checkin', 'ivr': 'checkin', 'check in/out': 'checkin', 'check-in/out': 'checkin',
  'check in method': 'checkin', 'check-in method': 'checkin', 'check in/check out': 'checkin',
  'timezone': 'timezone', 'time zone': 'timezone',
  'subject': 'subject', 'from': 'from', 'sent': 'ignore', 'date': 'ignore', 'to': 'ignore', 'cc': 'ignore',
};
const NUMBERED_LABELS = {
  store: 'store_number', site: 'store_number', location: 'store_number', facility: 'store_number', 'store id': 'store_number',
  'site id': 'store_number', 'location id': 'store_number', building: 'store_number',
};
const MULTILINE = new Set(['scope', 'scope_extra', 'address', 'approval', 'billing_instr', 'access', 'checkin']);

const TZ_ABBREV = {
  ET: 'America/New_York', EST: 'America/New_York', EDT: 'America/New_York',
  CT: 'America/Chicago', CST: 'America/Chicago', CDT: 'America/Chicago',
  MT: 'America/Denver', MST: 'America/Denver', MDT: 'America/Denver',
  PT: 'America/Los_Angeles', PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
  AKST: 'America/Anchorage', AKDT: 'America/Anchorage', HST: 'Pacific/Honolulu',
};

const TRADES = [
  ['Plumbing', /\b(plumb\w*|leak\w*|toilet|urinal|drain|clog\w*|water heater|faucet|sewer|backflow|sink|pipe|flush\w*)\b/gi],
  ['HVAC', /\b(hvac|rtu|rooftop unit|air condition\w*|a\/c|furnace|heat pump|thermostat|no heat|no cool\w*|ductwork|boiler)\b/gi],
  ['Refrigeration', /\b(refrigerat\w*|walk-in|walk in cooler|freezer|cooler|ice machine)\b/gi],
  ['Electrical', /\b(electric\w*|outlet|breaker|lighting|light fixture|lights out|panel|wiring|ballast|receptacle)\b/gi],
  ['Roofing', /\b(roof\w*|gutter|skylight)\b/gi],
  ['Doors & Locks', /\b(door|lock\w*|rekey|closer|storefront glass|panic bar|overhead door)\b/gi],
  ['Painting', /\b(paint\w*|drywall)\b/gi],
  ['Flooring', /\b(floor\w*|tile|carpet|vct)\b/gi],
  ['Landscaping', /\b(landscap\w*|snow|irrigation|mow\w*)\b/gi],
  ['General Maintenance', /\b(handyman|general maintenance|repair ceiling|ceiling tile)\b/gi],
];

// ── Raw email (.eml) ─────────────────────────────────────────────────────────
function decodeQuotedPrintable(s) {
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n');
}

function parseHeaders(block) {
  const headers = {};
  const unfolded = block.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2];
  }
  return headers;
}

function decodePart(headers, body) {
  const enc = String(headers['content-transfer-encoding'] || '').toLowerCase();
  if (enc.includes('quoted-printable')) return decodeQuotedPrintable(body);
  if (enc.includes('base64')) {
    try {
      return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
    } catch {
      return body;
    }
  }
  return body;
}

function bodyFromMime(headers, body) {
  const type = String(headers['content-type'] || 'text/plain');
  const boundary = type.match(/boundary="?([^";]+)"?/i)?.[1];
  if (/multipart\//i.test(type) && boundary) {
    const parts = body.split(`--${boundary}`).slice(1).filter((p) => !p.startsWith('--'));
    let html = '';
    for (const part of parts) {
      const split = part.replace(/^\r?\n/, '').split(/\r?\n\r?\n/);
      const partHeaders = parseHeaders(split[0] || '');
      const partBody = split.slice(1).join('\n\n');
      const partType = String(partHeaders['content-type'] || 'text/plain').toLowerCase();
      if (partType.startsWith('multipart/')) {
        const nested = bodyFromMime(partHeaders, partBody);
        if (nested) return nested;
      } else if (partType.startsWith('text/plain') && !/attachment/i.test(partHeaders['content-disposition'] || '')) {
        return decodePart(partHeaders, partBody);
      } else if (partType.startsWith('text/html') && !html) {
        html = htmlToText(decodePart(partHeaders, partBody));
      }
    }
    return html;
  }
  const decoded = decodePart(headers, body);
  return /text\/html/i.test(type) ? htmlToText(decoded) : decoded;
}

/** Splits a raw RFC 822 email into subject/from/date/body. Plain pasted text passes through. */
export function parseRawEmail(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n');
  const split = text.indexOf('\n\n');
  const head = split > 0 ? text.slice(0, split) : '';
  const looksLikeEml =
    head && /^(?:[\w-]+:.*(?:\n[ \t].*)*\n?)+$/.test(head) && /^(subject|from|message-id|mime-version|received):/im.test(head);
  if (!looksLikeEml) return { subject: '', from: '', date: '', body: text };
  const headers = parseHeaders(head);
  return {
    subject: decodeMimeWords(headers.subject || ''),
    from: decodeMimeWords(headers.from || ''),
    date: headers.date || '',
    body: bodyFromMime(headers, text.slice(split + 2)).trim(),
  };
}

function decodeMimeWords(value) {
  return String(value).replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_, _cs, enc, data) => {
    try {
      return enc.toLowerCase() === 'b'
        ? Buffer.from(data, 'base64').toString('utf8')
        : decodeQuotedPrintable(data.replace(/_/g, ' '));
    } catch {
      return data;
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function normalizeLabel(raw) {
  const lower = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const numbered = /#|\bno\.?$|\bnumber\b|\bnum\b|\bid\b/.test(lower);
  const base = lower
    .replace(/#/g, '')
    .replace(/\bno\.?$/, '')
    .replace(/\bnumber\b|\bnum\b/g, '')
    .replace(/[.:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { base, numbered };
}

function fieldForLabel(raw) {
  const { base, numbered } = normalizeLabel(raw);
  if (numbered && NUMBERED_LABELS[base]) return NUMBERED_LABELS[base];
  if (numbered && NUMBERED_LABELS[`${base} id`]) return NUMBERED_LABELS[`${base} id`];
  return LABELS[base] || LABELS[raw.toLowerCase().trim()] || null;
}

/** Labeled values ("Label: value"), with continuation lines for multi-line fields. */
function labeledValues(body) {
  const out = {};
  let current = null;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\t/g, '  ');
    const m = line.match(/^\s*[*>-]?\s*([A-Za-z][A-Za-z0-9 /#&.()'-]{0,38}?)\s*:\s*(.*)$/);
    const field = m ? fieldForLabel(m[1]) : null;
    if (field) {
      (out[field] ||= []).push(m[2].trim());
      current = MULTILINE.has(field) ? field : null;
      continue;
    }
    if (!line.trim()) {
      current = null;
      continue;
    }
    if (m && !field && /^\S/.test(line)) {
      // An unrecognised "Label:" line ends the previous field.
      current = null;
      continue;
    }
    if (current) {
      const list = out[current];
      list[list.length - 1] = `${list[list.length - 1]}\n${line.trim()}`.trim();
    }
  }
  return out;
}

const first = (values) => (values || []).map((v) => v.trim()).find(Boolean) || '';
const distinct = (list) => [...new Set(list.filter(Boolean))];

function normalizeWo(value) {
  const m = String(value || '').match(/[A-Z0-9][A-Z0-9-]{2,}/i);
  return m ? m[0].toUpperCase().replace(/-+$/, '') : '';
}

const WO_RE = /\b(?:work\s*order|w\/o|wo)\s*(?:#|no\.?|number)?\s*[:#]?\s*([A-Z]{0,4}-?\d[\w-]{2,})/gi;
const WO_ALT_RE = /\b(?:tracking|ticket|service\s*request|sr)\s*(?:#|no\.?|number)\s*[:#]?\s*([A-Z]{0,4}-?\d[\w-]{2,})/gi;
const NTE_RE = /\b(?:nte|not[\s-]+to[\s-]+exceed)\b[^$\d\n]{0,25}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/gi;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b(?:\s*(?:x|ext\.?)\s*\d+)?/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const STREET_RE =
  /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9.' -]{2,40}?\s(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pkwy|Parkway|Hwy|Highway|Pl|Place|Cir|Circle|Ter|Terrace|Trl|Trail|Plaza|Pike|Route|Rte|Sq|Square|Loop|Run)\b\.?[^\n]{0,80}/i;

function money(value) {
  const m = String(value || '').replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function addressLooksComplete(address) {
  const a = clean(address);
  if (!a) return false;
  if (/\b(tbd|tba|see (?:below|attached|store list)|unknown|n\/a|various|multiple locations)\b/i.test(a)) return false;
  const hasNumber = /^\D{0,30}?\d{1,6}\s+\S+/.test(a);
  const hasZipOrState = /\b\d{5}(?:-\d{4})?\b/.test(a) || /,\s*[A-Z]{2}\b/.test(a);
  return hasNumber && hasZipOrState;
}

export function normalizePriority(value, context = '') {
  const v = `${value} ${context}`.toLowerCase();
  if (!clean(value) && !clean(context)) return { priority: 'routine', matched: false };
  if (/\b(emergency|emergent|p1|priority 1|immediate|critical|2 ?(?:hr|hour)|4 ?(?:hr|hour))\b/.test(v)) return { priority: 'emergency', matched: true };
  if (/\b(urgent|asap|p2|priority 2|high|24 ?(?:hr|hour)|same day|next day)\b/.test(v)) return { priority: 'urgent', matched: true };
  if (/\b(scheduled|preventive|preventative|pm|planned|project)\b/.test(v)) return { priority: 'scheduled', matched: true };
  if (/\b(routine|p3|p4|priority 3|priority 4|normal|standard|low|medium|48 ?(?:hr|hour)|72 ?(?:hr|hour)|\d+ ?day)\b/.test(v)) return { priority: 'routine', matched: true };
  return { priority: 'routine', matched: false };
}

function tzOffsetMs(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - utcMs;
}

/** Wall-clock time in an IANA zone → Date. */
export function zonedTime(y, mo, d, h, mi, timeZone) {
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i += 1) guess = Date.UTC(y, mo - 1, d, h, mi) - tzOffsetMs(guess, timeZone);
  return new Date(guess);
}

export function validTimeZone(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** Parses a due date/time. Returns { at: Date|null, timezone, assumedZone }. */
export function parseDue(text, fallbackZone = 'America/New_York') {
  const raw = clean(text);
  if (!raw) return { at: null, timezone: '', assumedZone: false };
  const tzMatch = raw.match(/\b(AKST|AKDT|EST|EDT|CST|CDT|MST|MDT|PST|PDT|HST|ET|CT|MT|PT)\b/);
  const ianaMatch = raw.match(/\b(America|Pacific|US)\/[A-Za-z_]+\b/);
  let zone = tzMatch ? TZ_ABBREV[tzMatch[1]] : ianaMatch && validTimeZone(ianaMatch[0]) ? ianaMatch[0] : '';
  const assumedZone = !zone;
  if (!zone) zone = validTimeZone(fallbackZone) ? fallbackZone : 'America/New_York';

  let y; let mo; let d;
  let m = raw.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!m) {
    m = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
    if (m) [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3].length === 2 ? `20${m[3]}` : m[3])];
  }
  if (!m) {
    m = raw.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
    if (m) [mo, d, y] = [MONTHS[m[1].toLowerCase()], Number(m[2]), Number(m[3])];
  }
  if (!m || !(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return { at: null, timezone: zone, assumedZone };

  let h = 17; let mi = 0;
  const rest = raw.slice(raw.indexOf(m[0]) + m[0].length);
  const t = rest.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/i) || rest.match(/\b(\d{1,2}):(\d{2})\b/);
  if (t) {
    h = Number(t[1]);
    mi = Number(t[2] || 0);
    if (t[3]) {
      const pm = t[3].toLowerCase() === 'p';
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
  } else if (/\b(eod|end of day|close of business|cob)\b/i.test(raw)) {
    h = 17;
  } else {
    h = 23; mi = 59;
  }
  return { at: zonedTime(y, mo, d, h, mi, zone), timezone: zone, assumedZone, timeGiven: Boolean(t) };
}

function detectTrade(...texts) {
  const text = texts.join('\n');
  let best = ''; let bestCount = 0;
  for (const [name, re] of TRADES) {
    const count = (text.match(re) || []).length;
    if (count > bestCount) { best = name; bestCount = count; }
  }
  return best;
}

export function detectCheckinMethod(text) {
  const t = String(text || '');
  if (!clean(t)) return 'none';
  if (/\b(ivr|telephony|call (?:in|the)\b|dial\b|phone in|call\s*\(?\d{3})/i.test(t)) return 'phone_ivr';
  if (/\b(portal|servicechannel|service channel|corrigo|fmpilot|fm pilot|servicenow|verisae|mobile app|app\b|workorder app)\b/i.test(t)) return 'portal';
  if (/\bcode\b/i.test(t)) return 'code';
  if (/\bemail\b/i.test(t)) return 'email';
  return 'other';
}

function linesMatching(body, re, exclude) {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && re.test(l) && !(exclude && exclude.test(l)));
}

function displayName(from) {
  const m = String(from || '').match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>/);
  if (m) return { name: clean(m[1]), email: m[2].trim().toLowerCase() };
  const email = String(from || '').match(EMAIL_RE)?.[0] || '';
  return { name: '', email: email.toLowerCase() };
}

function companyFromDomain(email) {
  const domain = String(email || '').split('@')[1] || '';
  if (!domain || /^(gmail|yahoo|outlook|hotmail|aol|icloud|live|msn)\./i.test(domain)) return '';
  const label = domain.split('.').slice(-2, -1)[0] || '';
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
}

// ── Flags ────────────────────────────────────────────────────────────────────
const FLAG_TEXT = {
  wo_missing: ['external_wo_number', 'blocking', 'No work order number found. Enter the dispatcher’s WO#.'],
  wo_conflict: ['external_wo_number', 'blocking', 'The email shows more than one work order number.'],
  address_missing: ['site_address', 'blocking', 'No site address found.'],
  address_unclear: ['site_address', 'blocking', 'The site address is incomplete or unclear (needs street number and city/state or ZIP).'],
  nte_missing: ['nte_amount', 'blocking', 'No NTE found. Enter the NTE, or confirm the dispatch has none.'],
  nte_unclear: ['nte_amount', 'blocking', 'An NTE is mentioned but the amount is unclear.'],
  nte_conflict: ['nte_amount', 'blocking', 'The email shows more than one NTE amount.'],
  scope_missing: ['scope', 'blocking', 'No scope or problem description found.'],
  scope_inferred: ['scope', 'warning', 'The scope was taken from the email’s free text; check it reads correctly.'],
  due_missing: ['due_at', 'warning', 'No due date or response time found.'],
  due_unclear: ['due_at', 'warning', 'A due time is mentioned but could not be read as a date.'],
  due_timezone_assumed: ['due_at', 'warning', 'No time zone was given for the due time; the site/company time zone was used.'],
  priority_unclear: ['priority', 'warning', 'Priority wording was not recognised; set it during review.'],
  trade_missing: ['trade', 'warning', 'Trade could not be determined.'],
  customer_unmatched: ['customer_id', 'warning', 'Dispatching company is not in your customer list yet.'],
  site_unmatched: ['site_id', 'warning', 'Site is not in your site list yet.'],
  checkin_unclear: ['checkin_method', 'warning', 'Check-in is mentioned but the method is unclear.'],
};

export function makeFlag(code, detail = '') {
  const [field, severity, message] = FLAG_TEXT[code] || ['', 'warning', code];
  return { code, field, severity, message: detail ? `${message} ${detail}` : message, resolved: false };
}

/** Flags that follow from the job's current values (re-run after every review edit). */
export function validateJobFields(job) {
  const flags = [];
  if (!clean(job.external_wo_number)) flags.push(makeFlag('wo_missing'));
  if (!clean(job.site_address)) flags.push(makeFlag('address_missing'));
  else if (!addressLooksComplete(job.site_address)) flags.push(makeFlag('address_unclear'));
  if (job.nte_amount == null || job.nte_amount === '') flags.push(makeFlag('nte_missing'));
  if (!clean(job.scope)) flags.push(makeFlag('scope_missing'));
  if (!job.due_at) flags.push(makeFlag('due_missing'));
  if (!clean(job.trade)) flags.push(makeFlag('trade_missing'));
  return flags;
}

export function contentHash(text) {
  return crypto.createHash('sha256').update(clean(text).toLowerCase()).digest('hex');
}

// ── Main ─────────────────────────────────────────────────────────────────────
/**
 * @param {{ text: string, subject?: string, from?: string, timezone?: string }} input
 */
export function extractDispatch({ text, subject = '', from = '', timezone = 'America/New_York' }) {
  const email = parseRawEmail(text);
  const body = email.body.replace(/ /g, ' ');
  const labels = labeledValues(body);
  const subj = clean(subject || email.subject || first(labels.subject));
  const sender = displayName(from || email.from || first(labels.from));
  const flags = [];
  const textForScan = `${subj}\n${body}`;

  // Work order number
  const woLabeled = distinct((labels.wo || []).map(normalizeWo));
  const woRegex = distinct([...textForScan.matchAll(WO_RE)].map((m) => normalizeWo(m[1])));
  const woCandidates = distinct([...woLabeled, ...woRegex]);
  const woAlt = distinct([
    ...(labels.wo_alt || []).map(normalizeWo),
    ...[...textForScan.matchAll(WO_ALT_RE)].map((m) => normalizeWo(m[1])),
  ]);
  let wo = woCandidates[0] || '';
  if (woCandidates.length > 1) flags.push(makeFlag('wo_conflict', `Found: ${woCandidates.join(', ')}.`));
  if (!wo && woAlt.length) {
    wo = woAlt[0];
    if (woAlt.length > 1) flags.push(makeFlag('wo_conflict', `Found: ${woAlt.join(', ')}.`));
  }

  // NTE
  const nteLabelValues = (labels.nte || []).filter(Boolean);
  const nteValues = distinct([
    ...nteLabelValues.map((v) => money(v)).filter((v) => v != null).map(String),
    ...[...textForScan.matchAll(NTE_RE)].map((m) => money(m[1])).filter((v) => v != null).map(String),
  ]).map(Number);
  let nte = nteValues[0] ?? null;
  if (nteValues.length > 1) {
    flags.push(makeFlag('nte_conflict', `Found: ${nteValues.map((n) => `$${n.toFixed(2)}`).join(', ')}.`));
  } else if (nte == null && (nteLabelValues.length || /\b(nte|not[\s-]+to[\s-]+exceed)\b/i.test(textForScan))) {
    flags.push(makeFlag('nte_unclear', nteLabelValues[0] ? `It says “${clean(nteLabelValues[0]).slice(0, 60)}”.` : ''));
  }

  // Site and address
  let address = clean(first(labels.address).replace(/\s*\n\s*/g, ', '));
  const cityLine = clean(first(labels.city_line)) || [first(labels.city), first(labels.state), first(labels.zip)].map(clean).filter(Boolean).join(', ');
  if (address && cityLine && !address.includes(cityLine.split(',')[0])) address = `${address}, ${cityLine}`;
  if (!address) {
    const street = body.match(STREET_RE)?.[0];
    if (street) {
      const after = body.slice(body.indexOf(street) + street.length).split('\n').map((l) => l.trim()).find(Boolean) || '';
      address = clean(/\b\d{5}\b|,\s*[A-Z]{2}\b/.test(street) ? street : /^[A-Za-z .'-]+,?\s+[A-Z]{2}\s+\d{5}/.test(after) ? `${street}, ${after}` : street);
    }
  }
  address = address.replace(/\s*\n\s*/g, ', ');
  const storeNumber = clean(first(labels.store_number)) || (textForScan.match(/\bstore\s*(?:#|no\.?|number)\s*:?\s*(\w[\w-]*)/i)?.[1] || '');
  const siteName = clean(first(labels.site_name));

  // Parties
  const dispatcherLabel = clean(first(labels.dispatcher));
  const dispatcherName = dispatcherLabel || sender.name || companyFromDomain(sender.email);
  const billingCustomer = clean(first(labels.billing)) || dispatcherName;

  // Contacts
  const contacts = [];
  const contactName = clean(first(labels.contact));
  const labeledPhone = clean(first(labels.phone));
  const labeledEmail = clean(first(labels.email));
  if (contactName || labeledPhone || labeledEmail) {
    contacts.push({ name: contactName.replace(PHONE_RE, '').replace(EMAIL_RE, '').replace(/[-–,|]+\s*$/, '').trim(), phone: labeledPhone || (contactName.match(PHONE_RE)?.[0] || ''), email: labeledEmail || (contactName.match(EMAIL_RE)?.[0] || ''), role: 'site contact' });
  }
  const knownPhones = new Set(contacts.map((c) => c.phone.replace(/\D/g, '')));
  for (const phone of distinct(body.match(PHONE_RE) || [])) {
    if (!knownPhones.has(phone.replace(/\D/g, '')) && contacts.length < 6) {
      knownPhones.add(phone.replace(/\D/g, ''));
      const line = body.split('\n').find((l) => l.includes(phone)) || '';
      contacts.push({ name: '', phone: phone.trim(), email: '', role: clean(line.replace(phone, '').replace(/[:\-–]+\s*$/, '')).slice(0, 60) });
    }
  }
  const knownEmails = new Set([sender.email, ...contacts.map((c) => c.email.toLowerCase())]);
  for (const addr of distinct((body.match(EMAIL_RE) || []).map((e) => e.toLowerCase()))) {
    if (!knownEmails.has(addr) && contacts.length < 8) {
      knownEmails.add(addr);
      contacts.push({ name: '', phone: '', email: addr, role: '' });
    }
  }

  // Scope
  let scope = (labels.scope || []).filter(Boolean).join('\n\n').trim();
  const scopeExtra = (labels.scope_extra || []).filter(Boolean).join('\n').trim();
  if (!scope && scopeExtra) scope = scopeExtra;
  else if (scope && scopeExtra) scope = `${scope}\n\nNotes: ${scopeExtra}`;
  let scopeInferred = false;
  if (!scope) {
    // Free-form email: use its unlabeled sentences as the scope, for the reviewer to confirm.
    const free = body
      .split('\n')
      .filter((l) => l.trim() && !/^\s*[A-Za-z][A-Za-z0-9 /#&.()'-]{0,38}?\s*:/.test(l))
      .filter((l) => !(l.trim().length < 40 && /^(hi|hello|thanks|thank you|regards|best|sent from)\b/i.test(l.trim())))
      .join('\n')
      .trim();
    if (free) {
      scope = free.slice(0, 2000);
      scopeInferred = true;
    }
  }

  // Trade and priority
  const trade = clean(first(labels.trade)) ? canonicalTrade(first(labels.trade)) : detectTrade(subj, scope);
  const priorityText = clean(first(labels.priority));
  let pr = normalizePriority(priorityText, priorityText ? '' : subj);
  if (!priorityText && !pr.matched) {
    const word = body.match(/\b(emergency|asap|urgent)\b/i)?.[1];
    if (word) pr = normalizePriority(word);
  }
  if (priorityText && !pr.matched) flags.push(makeFlag('priority_unclear', `It says “${priorityText.slice(0, 40)}”.`));

  // Due
  const labeledZone = clean(first(labels.timezone));
  const zoneHint = validTimeZone(labeledZone) ? labeledZone : TZ_ABBREV[labeledZone.toUpperCase()] || timezone;
  const dueText = clean(first(labels.due));
  const due = parseDue(dueText ? `${dueText} ${labeledZone}` : '', zoneHint);
  if (dueText && !due.at) flags.push(makeFlag('due_unclear', `It says “${dueText.slice(0, 60)}”.`));
  if (due.at && due.assumedZone && !labeledZone) flags.push(makeFlag('due_timezone_assumed', `(${due.timezone})`));

  // Instructions
  const approval = (labels.approval || []).join('\n').trim() ||
    linesMatching(body, /\b(approval|authori[sz]ation|authori[sz]ed|prior to (?:proceeding|starting)|quote required|proposal required|must (?:call|obtain|get) (?:approval|authori))/i, /^\s*(?:nte|not to exceed)\s*:/i).join('\n');
  const billingInstr = (labels.billing_instr || []).join('\n').trim() ||
    linesMatching(body, /\b(invoice|invoicing|billing)\b/i, /^\s*(bill to|billing customer|invoice to)\s*:/i).join('\n');
  const access = (labels.access || []).join('\n').trim() ||
    linesMatching(body, /\b(gate code|lockbox|key (?:at|is|with)|loading dock|back door|after hours|store hours|access)\b/i).join('\n');
  const checkinText = (labels.checkin || []).join('\n').trim() ||
    linesMatching(body, /\b(check[\s-]?in|check[\s-]?out|ivr)\b/i).join('\n');
  const checkinMethod = detectCheckinMethod(checkinText);
  if (checkinText && checkinMethod === 'other') flags.push(makeFlag('checkin_unclear'));
  if (scopeInferred) flags.push(makeFlag('scope_inferred'));

  const fields = {
    external_wo_number: wo,
    po_number: normalizeWo(first(labels.po)),
    dispatcher_name: dispatcherName,
    dispatcher_email: sender.email,
    billing_customer: billingCustomer,
    site_name: siteName || (storeNumber ? `Store ${storeNumber}` : ''),
    store_number: storeNumber,
    site_address: address,
    contacts,
    scope,
    trade,
    priority: pr.priority,
    priority_explicit: pr.matched,
    due_at: due.at ? due.at.toISOString() : null,
    due_text: dueText,
    timezone: due.timezone || zoneHint || '',
    nte_amount: nte,
    approval_conditions: approval,
    billing_instructions: billingInstr,
    access_instructions: access,
    checkin_method: checkinMethod,
    checkin_instructions: checkinText,
  };

  // Field-derived flags (missing values) that the conflict checks above did not already cover.
  const covered = new Set(flags.map((f) => f.field));
  for (const flag of validateJobFields(fields)) {
    if (!covered.has(flag.field)) flags.push(flag);
  }

  return { fields, flags, subject: subj, from: sender.email || clean(from || email.from), date: email.date, body, contentHash: contentHash(`${subj}\n${body}`) };
}

function canonicalTrade(value) {
  const v = clean(value);
  const detected = detectTrade(v);
  return detected || v;
}

/** Merges new flags with prior ones, keeping earlier resolutions for codes that still apply. */
export function mergeFlags(previous, next) {
  const prior = new Map((previous || []).map((f) => [f.code, f]));
  return next.map((f) => {
    const old = prior.get(f.code);
    return old?.resolved ? { ...f, resolved: true, resolution: old.resolution, resolved_by: old.resolved_by, resolved_at: old.resolved_at } : f;
  });
}

export const unresolvedBlocking = (flags) => (flags || []).filter((f) => f.severity === 'blocking' && !f.resolved);
