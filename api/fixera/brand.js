/**
 * Fixera is the permanent assistant name.
 * Historical records may still say "fixa". Display and new writes use Fixera.
 */

export const FIXERA_NAME = 'Fixera';
export const FIXERA_ASSISTANT_ID = 'fixera';

export function displayAssistantName(value) {
  const raw = String(value || '').trim();
  const key = raw.toLowerCase();
  if (!raw || key === 'fixa' || key === 'fixera') return FIXERA_NAME;
  return raw;
}

export function isHistoricalFixa(value) {
  return String(value || '').trim().toLowerCase() === 'fixa';
}
