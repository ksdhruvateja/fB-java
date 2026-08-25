import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Shield, Loader2, KeyRound } from "lucide-react";
import { signInUser, type AuthUser } from "./auth";
import { brand } from "../config/brand";
import { startAdminMfa, verifyAdminMfa } from "./platformApi";
import {
  AuthShell,
  AuthPanel,
  AuthFieldLabel,
  AuthError,
  authInputClass,
} from "./AuthShell";
import { AuthEmailField, AuthPasswordField, AuthPrimaryButton } from "./AuthFormFields";

export default function AdminLogin({
  onLogin,
  onBack,
}: {
  onLogin: (user: AuthUser) => void;
  onBack: () => void;
}) {
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
      const mfa = await startAdminMfa();
      setLoading(false);
      if (!mfa.ok) {
        setError(
          (mfa as { message?: string; detail?: string }).detail
            ? `Could not start MFA: ${(mfa as { detail?: string }).detail}`
            : (mfa as { message?: string }).message || "Could not start MFA. Please try again."
        );
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

  const mascotTitle = mfaStep ? "Verify it's you" : "Staff sign in";
  const mascotSubtitle = mfaStep
    ? "Enter the 6-digit code sent to your device."
    : `${brand.productName} admin access — MFA required for all staff.`;

  return (
    <AuthShell
      onBack={
        mfaStep
          ? () => {
              setMfaStep(false);
              setError("");
              setMfaCode("");
            }
          : onBack
      }
      backLabel={mfaStep ? "Back to credentials" : "Back to site"}
      loading={loading}
      error={Boolean(error)}
      mascot={{
        variant: "admin",
        title: mascotTitle,
        subtitle: mascotSubtitle,
        hero: {
          line1: mfaStep ? "Verify it's you." : "Staff access.",
          line2: mfaStep ? "One more step." : "Secure sign in.",
          subtitle: mascotSubtitle,
          trustTitle: "MFA protected.",
          trustBody: "All admin sessions require multi-factor verification.",
        },
      }}
    >
      <AnimatePresence mode="wait">
        {!mfaStep ? (
          <motion.div
            key="credentials"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="w-full"
          >
            <AuthPanel>
              <div className="mb-6">
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
                  {brand.productName} staff
                </p>
                <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900 dark:text-foreground">
                  Admin sign in
                </h1>
                <p className="mt-2 text-[15px] text-neutral-600 dark:text-muted-foreground">
                  Staff access only — MFA required
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <AuthEmailField
                  value={email}
                  onChange={setEmail}
                  autoComplete="username"
                  label="Email"
                />
                <AuthPasswordField
                  value={password}
                  onChange={setPassword}
                  show={showPass}
                  onToggleShow={() => setShowPass((v) => !v)}
                  label="Password"
                />

                <AuthError message={error} />

                <AuthPrimaryButton loading={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Continue to MFA
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </AuthPrimaryButton>
              </form>
            </AuthPanel>
          </motion.div>
        ) : (
          <motion.div
            key="mfa"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="w-full"
          >
            <AuthPanel>
              <div className="mb-6 flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
                    Step 2 of 2
                  </p>
                  <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900 dark:text-foreground">
                    Two-factor verification
                  </h1>
                  <p className="mt-1 text-[15px] text-neutral-600 dark:text-muted-foreground">
                    Enter the 6-digit code to continue
                  </p>
                </div>
              </div>

              <form onSubmit={handleMfa} className="space-y-4">
                <div>
                  <AuthFieldLabel soft>Verification code</AuthFieldLabel>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{4,8}"
                    maxLength={8}
                    required
                    autoComplete="one-time-code"
                    placeholder="••••••"
                    className={`${authInputClass} text-center text-2xl font-mono tracking-[0.45em]`}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  />
                </div>

                {mfaDemoCode && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200">
                    <span className="font-medium">Demo mode — code: </span>
                    <span className="font-mono font-bold tracking-wider">{mfaDemoCode}</span>
                  </div>
                )}

                <AuthError message={error} />

                <AuthPrimaryButton loading={loading} disabled={mfaCode.length < 4}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Shield className="h-4 w-4" />
                      Verify & sign in
                    </>
                  )}
                </AuthPrimaryButton>
              </form>

              <p className="mt-4 text-center text-xs text-muted-foreground">
                Didn&apos;t receive a code?{" "}
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={async () => {
                    setError("");
                    const r = await startAdminMfa();
                    if (r.ok) setMfaDemoCode(r.demoCode ?? null);
                  }}
                >
                  Resend
                </button>
              </p>
            </AuthPanel>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthShell>
  );
}
