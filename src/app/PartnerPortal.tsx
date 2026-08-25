import { useEffect, useState } from "react";
import { brand } from "../config/brand";

type PartnerSession = {
  token: string;
  partner: { id: number; code: string; name: string; email: string };
};

type Referral = {
  id: number;
  status: string;
  createdAt?: string;
  jobId?: number | null;
};

const STORAGE_KEY = "fixbridge-partner-session";

function loadSession(): PartnerSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PartnerSession;
  } catch {
    return null;
  }
}

export default function PartnerPortal({ onBack }: { onBack: () => void }) {
  const [session, setSession] = useState<PartnerSession | null>(() => loadSession());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [referrals, setReferrals] = useState<Referral[]>([]);

  useEffect(() => {
    if (!session?.token || !session.partner?.code) return;
    void fetch(`/api/partner/${encodeURIComponent(session.partner.code)}/referrals`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setReferrals(data.referrals || []);
      })
      .catch(() => setReferrals([]));
  }, [session]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/partner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.token) {
        setError(data.message || "Could not sign in.");
        return;
      }
      const next = { token: data.token, partner: data.partner };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSession(next);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setReferrals([]);
  }

  const pending = referrals.filter((r) => String(r.status).toLowerCase().includes("pending")).length;
  const converted = referrals.filter((r) => r.jobId != null).length;

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <button type="button" onClick={onBack} className="mb-6 text-sm text-muted-foreground underline">
        ← Back to {brand.name}
      </button>
      <h1 className="text-2xl font-semibold tracking-tight">Partner portal</h1>
      <p className="mt-1 text-sm text-muted-foreground">View your referral code and conversion status.</p>

      {!session ? (
        <form onSubmit={login} className="mt-8 max-w-md space-y-4 rounded-xl border border-border p-6">
          <label className="block text-sm">
            Email
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label className="block text-sm">
            Password
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <div className="mt-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
            <div>
              <p className="font-medium">{session.partner.name}</p>
              <p className="text-sm text-muted-foreground">{session.partner.email}</p>
              <p className="mt-2 text-sm">
                Referral code: <span className="font-mono font-semibold">{session.partner.code}</span>
              </p>
            </div>
            <button type="button" onClick={logout} className="rounded-md border border-border px-3 py-1.5 text-sm">
              Log out
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-semibold">{referrals.length}</p>
              <p className="text-xs text-muted-foreground">Referrals</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-semibold">{pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-semibold">{converted}</p>
              <p className="text-xs text-muted-foreground">With jobs</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Job</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {referrals.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      No referrals yet. Share your code with homeowners.
                    </td>
                  </tr>
                ) : (
                  referrals.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{r.id}</td>
                      <td className="px-3 py-2">{r.status}</td>
                      <td className="px-3 py-2">{r.jobId ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
