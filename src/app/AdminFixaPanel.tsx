import { useEffect, useState } from "react";
import { api } from "./platformApi";

type FixaProvider = {
  id: string;
  name: string;
  status: "connected" | "not_connected" | "invalid";
  defaultModel?: string | null;
  keyHint?: string | null;
};

type FixaAdmin = {
  assistant: string;
  principle?: string;
  routing?: Record<string, { primary?: string; model?: string; fallback?: string | null }>;
  providers: FixaProvider[];
  note?: string;
};

export default function AdminFixaPanel() {
  const [data, setData] = useState<FixaAdmin | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<FixaAdmin & { ok?: boolean; message?: string }>("/api/admin/fixa/providers")
      .then((res) => {
        if (cancelled) return;
        if (!res?.providers) {
          setError(res?.message || "Fixa provider status is unavailable.");
          return;
        }
        setData(res);
      })
      .catch(() => {
        if (!cancelled) setError("Fixa provider status is unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Fixa</h2>
        <p className="text-sm text-muted-foreground">
          Central assistant for FixBridge. Models are replaceable. Secrets stay on the server.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {data?.principle ? <p className="text-sm text-muted-foreground">{data.principle}</p> : null}
      <div className="grid gap-3">
        {(data?.providers || []).map((provider) => (
          <div key={provider.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{provider.name}</p>
                <p className="text-sm text-muted-foreground">
                  {provider.status === "connected"
                    ? `Default model: ${provider.defaultModel || "configured"}`
                    : provider.status === "invalid"
                      ? "Key present but not a valid Experiential Labs key"
                      : "Not connected"}
                </p>
                {provider.keyHint ? (
                  <p className="mt-1 text-xs text-muted-foreground">Identifier: {provider.keyHint}</p>
                ) : null}
              </div>
              <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold">
                {provider.status === "connected" ? "Connected" : "Not connected"}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {data?.note || "Connect providers by setting server secrets. This screen cannot display or save a raw key."}
      </p>
    </section>
  );
}
