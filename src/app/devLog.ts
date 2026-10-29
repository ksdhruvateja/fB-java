/** console.log that only runs in development builds (keeps user data out of production consoles). */
export function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) console.log(...args);
}
