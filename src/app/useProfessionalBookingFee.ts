import { useCallback, useEffect, useState } from "react";
import { fetchProfessionalBookingFee } from "./managedJobs";
import { getStoredToken } from "./auth";

// Coalesce simultaneous previews for one session; never cache an old setting.
const pending = new Map<string, ReturnType<typeof fetchProfessionalBookingFee>>();
function load() {
  const token = getStoredToken() || "";
  let request = pending.get(token);
  if (!request) {
    request = fetchProfessionalBookingFee();
    pending.set(token, request);
    const clear = () => { if (pending.get(token) === request) pending.delete(token); };
    void request.then(clear, clear);
  }
  return request;
}

export function useProfessionalBookingFee(enabled: boolean, key?: number | null) {
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    window.addEventListener("fixbridge-booking-fee-refresh", refresh);
    return () => window.removeEventListener("fixbridge-booking-fee-refresh", refresh);
  }, [refresh]);
  useEffect(() => {
    let alive = true;
    setAmount(null); setError(null);
    if (enabled) void load().then(result => {
      if (!alive) return;
      if (!result.ok || !Number.isSafeInteger(result.amountCents) || Number(result.amountCents) <= 0) {
        setError(result.message || "Booking fee is unavailable. Try again."); return;
      }
      setAmount(Number(result.amountCents) / 100);
    }).catch(() => { if (alive) setError("Booking fee is unavailable. Try again."); });
    return () => { alive = false; };
  }, [enabled, key, revision]);
  return { amount, error, refresh };
}
