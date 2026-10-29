import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { api, tokens } from "./api";
import { CommercialLogo } from "./CommercialLogo";
import { Link, navigate } from "./router";
import { Button, Field, Input } from "./ui";
import GoogleSignInButton from "../app/GoogleSignInButton";

/** "or" divider plus the Google button (hidden automatically when Google sign-in isn't configured). */
function GoogleOption({ text, disabled, onCredential, onError, note }: {
  text: "signin_with" | "signup_with" | "continue_with";
  disabled?: boolean;
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
  note?: ReactNode;
}) {
  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex justify-center">
        <GoogleSignInButton text={text} disabled={disabled} onCredential={onCredential} onError={onError} />
      </div>
      {note ? <p className="mt-2 text-center text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

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

type CompanyRole = "owner" | "office" | "technician";
const ROLE_LOGIN: Record<CompanyRole, { title: string; subtitle: string }> = {
  owner: { title: "Company owner sign in", subtitle: "For the account owner: plan, team, billing, customers and every job." },
  office: { title: "Office staff sign in", subtitle: "Review dispatches, assign technicians, record approvals and send invoices." },
  technician: { title: "Technician sign in", subtitle: "Your assigned jobs, site visits, check-ins and photos." },
};

/** /commercial/login: pick which kind of account to sign in with. */
export function LoginChooser() {
  const options: [string, string, string][] = [
    ["Company owner", "/commercial/login/owner", "Plan, team, billing and every job"],
    ["Office staff", "/commercial/login/office", "Dispatches, approvals and invoices"],
    ["Technician", "/commercial/login/technician", "Assigned jobs and site visits"],
    ["Commercial admin", "/commercial/admin/login", "FixBridge staff only"],
  ];
  return (
    <AuthFrame title="Sign in to Commercial" subtitle="Choose how you use FixBridge Commercial.">
      <div className="space-y-3">
        {options.map(([label, to, note]) => (
          <Link key={to} to={to} className="flex items-center justify-between rounded-2xl bg-muted px-5 py-4 transition hover:bg-secondary">
            <span><span className="block text-[16px] font-semibold text-foreground">{label}</span><span className="block text-[13px] text-muted-foreground">{note}</span></span>
            <span aria-hidden className="text-primary">›</span>
          </Link>
        ))}
      </div>
    </AuthFrame>
  );
}

export function CompanyLogin({ role }: { role: CompanyRole }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const copy = ROLE_LOGIN[role];
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.public<{ token: string }>("POST", "/auth/login", { email, password, role });
      tokens.setUser(res.token);
      try { localStorage.setItem("fixbridge-commercial-role", role); } catch { /* ignore */ }
      navigate("/commercial/app", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  const others = (Object.keys(ROLE_LOGIN) as CompanyRole[]).filter((r) => r !== role);
  return (
    <AuthFrame title={copy.title} subtitle={copy.subtitle}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
        <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
        {error ? <p className="text-sm font-medium text-red-600" role="alert">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" busy={busy}>Sign in</Button>
      </form>
      <GoogleOption
        text="signin_with"
        disabled={busy}
        onError={setError}
        onCredential={async (credential) => {
          setBusy(true);
          setError("");
          try {
            const res = await api.public<{ token: string }>("POST", "/auth/google", { credential, role, intent: "signin" });
            tokens.setUser(res.token);
            try { localStorage.setItem("fixbridge-commercial-role", role); } catch { /* ignore */ }
            navigate("/commercial/app", { replace: true });
          } catch (err: any) {
            setError(err?.message || "Could not sign in with Google.");
          } finally {
            setBusy(false);
          }
        }}
      />
      <p className="mt-8 text-center text-[14px] text-muted-foreground">
        Not {role === "office" ? "office staff" : `a ${role === "owner" ? "company owner" : "technician"}`}? Sign in as{" "}
        {others.map((r, i) => (
          <span key={r}>
            <Link to={`/commercial/login/${r}`} className="text-primary hover:underline">{r === "owner" ? "company owner" : r === "office" ? "office staff" : "technician"}</Link>
            {i === 0 ? " or " : ""}
          </span>
        ))}
        .
      </p>
      <p className="mt-3 text-center text-[13px] text-muted-foreground">
        No account yet? <Link to={`/commercial/signup/${role}`} className="text-primary hover:underline">Create a {role === "owner" ? "company owner" : role === "office" ? "office staff" : "technician"} account</Link>. New accounts are approved by FixBridge.
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
  const [done, setDone] = useState("");
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
      const res = await api.public<{ token?: string; pending?: boolean; message?: string }>("POST", "/auth/set-password", { token, password });
      if (res.pending || !res.token) {
        setDone(res.message || "Your password is set. Your account is waiting for FixBridge approval.");
        return;
      }
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
      {done ? (
        <p className="rounded-xl bg-muted p-4 text-sm" role="status">{done}</p>
      ) : loadError ? (
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
      <GoogleOption
        text="signin_with"
        disabled={busy}
        onError={setError}
        note="Google sign-in is only for admin@fixbridge.us."
        onCredential={async (credential) => {
          setBusy(true);
          setError("");
          try {
            const res = await api.public<{ token: string }>("POST", "/admin/auth/google", { credential });
            tokens.setAdmin(res.token);
            navigate("/commercial/admin", { replace: true });
          } catch (err: any) {
            setError(err?.message || "Could not sign in with Google.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </AuthFrame>
  );
}

const SIGNUP_COPY: Record<CompanyRole, { title: string; subtitle: string }> = {
  owner: { title: "Create a company account", subtitle: "Register your company. FixBridge reviews new companies before they go live." },
  office: { title: "Create an office staff account", subtitle: "Join your company with the join code from your company owner." },
  technician: { title: "Create a technician account", subtitle: "Join your company with the join code from your company owner." },
};

/** /commercial/signup/:role — self sign-up; every account waits for commercial-admin approval. */
export function CompanySignup({ role }: { role: CompanyRole }) {
  const copy = SIGNUP_COPY[role];
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "", company_name: "", service_area: "", trades: "", join_code: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setErrors({});
    if (form.password !== form.confirm) {
      setErrors({ confirm: "The passwords do not match." });
      return;
    }
    setBusy(true);
    try {
      const res = await api.public<{ message?: string }>("POST", "/auth/signup", {
        role,
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        ...(role === "owner"
          ? { company_name: form.company_name, service_area: form.service_area, trades: form.trades.split(",").map((t) => t.trim()).filter(Boolean) }
          : { join_code: form.join_code }),
      });
      setDone(res.message || "Thanks! Your account is waiting for FixBridge approval.");
    } catch (err: any) {
      setErrors(err?.body?.errors || {});
      setError(err?.message || "Could not create your account.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthFrame title="Request received" subtitle={copy.title}>
        <p className="rounded-xl bg-muted p-4 text-sm" role="status">{done}</p>
        <p className="mt-6 text-center text-[14px]">
          <Link to={`/commercial/login/${role}`} className="text-primary hover:underline">Back to sign in</Link>
        </p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title={copy.title} subtitle={copy.subtitle}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {role === "owner" ? (
          <>
            <Field label="Company name" error={errors.company_name}><Input value={form.company_name} onChange={set("company_name")} required /></Field>
            <Field label="Trades" hint="Comma separated, e.g. Plumbing, HVAC."><Input value={form.trades} onChange={set("trades")} /></Field>
            <Field label="Service area"><Input value={form.service_area} onChange={set("service_area")} /></Field>
          </>
        ) : (
          <Field label="Company join code" hint="Ask your company owner; it is on their Team page." error={errors.join_code}>
            <Input value={form.join_code} onChange={set("join_code")} autoCapitalize="characters" autoComplete="off" required />
          </Field>
        )}
        <Field label="Your name" error={errors.name}><Input value={form.name} onChange={set("name")} autoComplete="name" required /></Field>
        <Field label="Email" error={errors.email}><Input type="email" value={form.email} onChange={set("email")} autoComplete="email" required /></Field>
        <Field label="Phone" error={errors.phone}><Input type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" /></Field>
        <Field label="Password" hint="At least 10 characters." error={errors.password}><Input type="password" value={form.password} onChange={set("password")} autoComplete="new-password" minLength={10} required /></Field>
        <Field label="Confirm password" error={errors.confirm}><Input type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" required /></Field>
        {error ? <p className="text-sm font-medium text-red-600" role="alert">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" busy={busy}>Create account</Button>
      </form>
      <GoogleOption
        text="signup_with"
        disabled={busy}
        onError={setError}
        note={role === "owner" ? "Fill in your company details above first. Google provides your name and email; no password needed." : "Enter your company join code above first. Google provides your name and email; no password needed."}
        onCredential={async (credential) => {
          setError("");
          setErrors({});
          if (role === "owner" ? form.company_name.trim().length < 2 : !form.join_code.trim()) {
            setErrors(role === "owner" ? { company_name: "Enter your company name." } : { join_code: "Enter the join code from your company owner." });
            setError("Fill in the highlighted field, then continue with Google.");
            return;
          }
          setBusy(true);
          try {
            const res = await api.public<{ message?: string }>("POST", "/auth/google", {
              credential,
              intent: "signup",
              role,
              phone: form.phone,
              ...(role === "owner"
                ? { company_name: form.company_name, service_area: form.service_area, trades: form.trades.split(",").map((t) => t.trim()).filter(Boolean) }
                : { join_code: form.join_code }),
            });
            setDone(res.message || "Thanks! Your account is waiting for FixBridge approval.");
          } catch (err: any) {
            setErrors(err?.body?.errors || {});
            setError(err?.message || "Could not create your account with Google.");
          } finally {
            setBusy(false);
          }
        }}
      />
      <p className="mt-8 text-center text-[14px] text-muted-foreground">
        Already have an account? <Link to={`/commercial/login/${role}`} className="text-primary hover:underline">Sign in</Link>
      </p>
    </AuthFrame>
  );
}
