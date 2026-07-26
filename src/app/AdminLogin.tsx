import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Eye, EyeOff, ArrowLeft, ArrowRight, Shield, Loader2, KeyRound } from "lucide-react";
import { getDemoUser, signInUser, type AuthUser } from "./auth";
import { brand } from "../config/brand";
import { startAdminMfa, verifyAdminMfa } from "./platformApi";

const inputClass =
  "w-full rounded-2xl border border-border/70 bg-secondary/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors";

export default function AdminLogin({
  onLogin,
  onBack,
}: {
  onLogin: (user: AuthUser) => void;
  onBack: () => void;
}) {
  const demoUser = getDemoUser("admin");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState(demoUser.email);
  const [password, setPassword] = useState(demoUser.password || "");

  // MFA step
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaDemoCode, setMfaDemoCode] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const result = await signInUser("admin", email, password);
      if (!result.ok) {
        setError(result.message);
        setLoading(false);
        return;
      }
      if (result.user.role !== "admin") {
        setError("This account is not an admin account.");
        setLoading(false);
        return;
      }
      // Credentials OK — trigger MFA
      const mfa = await startAdminMfa();
      setLoading(false);
      if (!mfa.ok) {
        setError("Could not start MFA. Please try again.");
        return;
      }
      setPendingUser(result.user);
      setMfaDemoCode(mfa.demoCode ?? null);
      setMfaStep(true);
    } catch {
      setLoading(false);
      setError("Something went wrong. Please try again.");
    }
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !pendingUser) return;
    setError("");
    setLoading(true);
    try {
      const result = await verifyAdminMfa(mfaCode.trim());
      setLoading(false);
      if (!result.ok || !result.verified) {
        setError("Invalid or expired code. Try again.");
        return;
      }
      onLogin(pendingUser);
    } catch {
      setLoading(false);
      setError("Verification failed. Please try again.");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F3F0EA] text-foreground">
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-foreground/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={mfaStep ? () => { setMfaStep(false); setError(""); setMfaCode(""); } : onBack}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {mfaStep ? "Back" : "Back"}
          </button>
          <p className="font-[family-name:var(--font-display)] text-lg tracking-wide text-[#FF4D1C]">
            {brand.productName}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!mfaStep ? (
            <motion.div
              key="credentials"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-3xl border border-border/60 bg-white/80 p-6 shadow-sm backdrop-blur sm:p-8"
            >
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF4D1C]/10 text-[#FF4D1C]">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Admin sign in</h1>
                  <p className="text-sm text-muted-foreground">Staff access only — MFA required</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Email</span>
                  <input
                    type="email"
                    required
                    autoComplete="username"
                    className={inputClass}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Password</span>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      className={inputClass}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowPass((v) => !v)}
                      aria-label={showPass ? "Hide password" : "Show password"}
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>

                {error && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF4D1C] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {loading ? "Verifying…" : "Continue to MFA"}
                </button>
              </form>

              <p className="mt-5 text-xs text-muted-foreground">
                Demo: <span className="font-mono">{demoUser.email}</span> /{" "}
                <span className="font-mono">{demoUser.password}</span>
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="mfa"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-3xl border border-border/60 bg-white/80 p-6 shadow-sm backdrop-blur sm:p-8"
            >
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF4D1C]/10 text-[#FF4D1C]">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Two-factor verification</h1>
                  <p className="text-sm text-muted-foreground">Enter the 6-digit code to continue</p>
                </div>
              </div>

              <form onSubmit={handleMfa} className="space-y-4">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Verification code</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{4,8}"
                    maxLength={8}
                    required
                    autoComplete="one-time-code"
                    placeholder="______"
                    className={`${inputClass} text-center text-2xl font-mono tracking-[0.5em]`}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  />
                </label>

                {mfaDemoCode && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                    <span className="font-medium">Demo mode — code: </span>
                    <span className="font-mono font-bold">{mfaDemoCode}</span>
                  </div>
                )}

                {error && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || mfaCode.length < 4}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF4D1C] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                  {loading ? "Verifying…" : "Verify & Sign In"}
                </button>
              </form>

              <p className="mt-4 text-center text-xs text-muted-foreground">
                Didn't receive a code?{" "}
                <button
                  type="button"
                  className="font-semibold text-[#FF4D1C] hover:underline"
                  onClick={async () => {
                    setError("");
                    const r = await startAdminMfa();
                    if (r.ok) setMfaDemoCode(r.demoCode ?? null);
                  }}
                >
                  Resend
                </button>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
