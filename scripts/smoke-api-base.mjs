/**
 * Shared smoke API base resolver.
 *
 * Priority:
 * 1. CLI arg (when provided by the script)
 * 2. API_BASE_URL (preferred for isolated RC runs, e.g. http://127.0.0.1:3002)
 * 3. API_BASE (legacy)
 * 4. http://127.0.0.1:3001 (local default — not a production setting)
 *
 * Local smoke isolation tip: start a clean API with API_PORT=3002 and set
 * API_BASE_URL=http://127.0.0.1:3002 so in-memory rate-limit counters start fresh.
 * That is a test harness practice, not a production fix.
 */
export function resolveSmokeApiBase(argvIndex = 2) {
  const fromArg = process.argv[argvIndex] && String(process.argv[argvIndex]).trim();
  const fromEnv = String(process.env.API_BASE_URL || process.env.API_BASE || '').trim();
  const raw = fromArg || fromEnv || 'http://127.0.0.1:3001';
  return raw.replace(/\/$/, '');
}

export default resolveSmokeApiBase;
