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
    <div className="flex min-h-svh flex-col bg-slate-100 dark:bg-slate-950">
      <header className={admin ? "bg-slate-900" : "bg-white dark:bg-slate-900"}>
        <div className="mx-auto flex max-w-5xl items-center px-4 py-3">
          <Link to={admin ? "/commercial/admin/login" : "/commercial"}><CommercialLogo inverted={admin} /></Link>
          {admin ? <span className="ml-3 rounded bg-amber-400 px-2 py-0.5 text-xs font-bold uppercase text-slate-900">Commercial admin</span> : null}
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </main>
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
    <AuthFrame title="Sign in" subtitle="FixBridge Commercial company accounts. Homeowner and contractor marketplace logins do not work here.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
        <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
        {error ? <p className="text-sm font-medium text-red-600" role="alert">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" busy={busy}>Sign in</Button>
      </form>
      <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">
        New to FixBridge Commercial? <Link to="/commercial#apply" className="font-semibold text-primary" onClick={() => setTimeout(() => document.getElementById("apply")?.scrollIntoView(), 50)}>Apply for the pilot</Link>.
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
    <AuthFrame admin title="Commercial admin" subtitle={<span className="inline-flex items-center gap-1"><ShieldCheck className="h-4 w-4" /> Separate from the FixBridge marketplace admin panel.</span>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
        <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
        {error ? <p className="text-sm font-medium text-red-600" role="alert">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" busy={busy}>Sign in</Button>
      </form>
    </AuthFrame>
  );
}
