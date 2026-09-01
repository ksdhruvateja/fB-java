import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getLinkedSignInMethods } from "./marketingApi";

export default function HomeownerSignInMethods() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [passwordEnabled, setPasswordEnabled] = useState(false);

  useEffect(() => {
    void getLinkedSignInMethods().then((r) => {
      if (r.ok) {
        setGoogleConnected(Boolean(r.google?.connected));
        setGoogleEmail(r.google?.email || null);
        setPasswordEnabled(Boolean(r.password?.enabled));
      } else {
        setError(r.message || "Could not load sign-in methods.");
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading sign-in methods…
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Sign-in methods</h2>
        <p className="mt-1 text-xs text-muted-foreground">How you sign in to your FixBridge account.</p>
      </div>

      <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-3">
        <div>
          <p className="font-semibold">Google</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {googleConnected
              ? `Connected as ${googleEmail || "your Google account"}`
              : "Not connected — use Google on the login page to link."}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            googleConnected ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"
          }`}
        >
          {googleConnected ? "Connected" : "Not linked"}
        </span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">Password</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {passwordEnabled
              ? "Email and password sign-in is enabled."
              : "You sign in with Google. Use Forgot password to add a password if needed."}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            passwordEnabled ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"
          }`}
        >
          {passwordEnabled ? "Enabled" : "Google only"}
        </span>
      </div>
    </div>
  );
}
