import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { api, tokens } from "./api";
import { CommercialLogo } from "./CommercialLogo";
import { Link, navigate } from "./router";
import { Button, Field, Input } from "./ui";

function AuthFrame({ title, subtitle, children, admin }: { title: string; subtitle: ReactNode; children: ReactNode; admin?: boolean }) {
  useEffect(() => {
    document.title = `${title} · FixBridge Commercial`;
  }, [title]);
  return (
    <div className="flex min-h-svh flex-col bg-white dark:bg-black">
      <header className="border-b border-black/10 bg-[#fbfbfd]/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#161617]/80">
        <div className="mx-auto flex h-12 max-w-[1024px] items-center justify-between px-5">
          <Link to={admin ? "/commercial/admin/login" : "/commercial"} aria-label="FixBridge Commercial"><CommercialLogo small /></Link>
          {admin ? <span className="rounded-full bg-[#1d1d1f] px-3 py-1 text-[12px] font-medium text-white dark:bg-white dark:text-black">Commercial admin</span> : <a href="/commercial" className="text-[12px] text-muted-foreground hover:text-foreground">Back to Commercial</a>}
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 py-16 sm:py-24">
        <div className="w-full max-w-[440px] text-center">
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.025em] text-foreground sm:text-[40px]">{title}</h1>
          <p className="mx-auto mt-3 max-w-sm text-[17px] text-muted-foreground">{subtitle}</p>
          <div className="mt-10 text-left">{children}</div>
        </div>
      </main>
      <footer className="border-t border-black/10 py-5 text-center text-[12px] text-muted-foreground dark:border-white/10">Copyright © {new Date().getFullYear()} FixBridge. All rights reserved.</footer>
    </div>
  );
}

export function CompanyLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.public<{ token: string }>("POST", "/auth/login", { email, password });
      tokens.setUser(res.token);
      navigate("/commercial/app", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame title="Sign in to Commercial" subtitle="Use your FixBridge Commercial company account. Homeowner and contractor logins don’t work here.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
        <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
        {error ? <p className="text-sm font-medium text-red-600" role="alert">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" busy={busy}>Sign in</Button>
      </form>
      <p className="mt-8 text-center text-[14px] text-muted-foreground">
        New to FixBridge Commercial? <Link to="/commercial#apply" className="text-primary hover:underline" onClick={() => setTimeout(() => document.getElementById("apply")?.scrollIntoView(), 50)}>Apply for the pilot</Link>.
        Team members get an invite link from their company owner.
      </p>
    </AuthFrame>
  );
}

export function SetPassword() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [invite, setInvite] = useState<{ email: string; name: string; company_name: string } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!token) {
      setLoadError("This link is missing its code. Open the link from your email again.");
      return;
    }
    api.public("GET", `/auth/invite?token=${encodeURIComponent(token)}`).then(setInvite).catch((e) => setLoadError(e.message));
  }, [token]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("The passwords do not match.");
    setBusy(true);
    setError("");
    try {
      const res = await api.public<{ token: string }>("POST", "/auth/set-password", { token, password });
      tokens.setUser(res.token);
      navigate("/commercial/app", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Could not set your password.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame title="Set your password" subtitle={invite ? `${invite.name || invite.email} · ${invite.company_name}` : "Finish setting up your FixBridge Commercial account."}>
      {loadError ? (
        <p className="text-sm font-medium text-red-600" role="alert">{loadError}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><Input value={invite?.email || ""} readOnly autoComplete="username" /></Field>
          <Field label="New password" hint="At least 10 characters."><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={10} required /></Field>
          <Field label="Confirm password"><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></Field>
          {error ? <p className="text-sm font-medium text-red-600" role="alert">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full" busy={busy} disabled={!invite}>Save and sign in</Button>
        </form>
      )}
    </AuthFrame>
  );
}

export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.public<{ token: string }>("POST", "/admin/auth/login", { email, password });
      tokens.setAdmin(res.token);
      navigate("/commercial/admin", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame admin title="Commercial admin" subtitle={<span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Separate from the FixBridge marketplace admin.</span>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
        <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
        {error ? <p className="text-sm font-medium text-red-600" role="alert">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" busy={busy}>Sign in</Button>
      </form>
    </AuthFrame>
  );
}
