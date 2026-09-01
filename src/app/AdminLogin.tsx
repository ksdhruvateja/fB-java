import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Shield, Loader2, KeyRound } from "lucide-react";
import { signInUser, saveSession, type AuthUser } from "./auth";
import { brand } from "../config/brand";
import { startAdminMfa, verifyAdminMfa } from "./platformApi";
import GoogleSignInButton from "./GoogleSignInButton";
import { signInWithGoogle } from "./marketingApi";
import {
  AuthShell,
  AuthPanel,
  AuthFieldLabel,
  AuthError,
  authInputClass,
} from "./AuthShell";
import { AuthEmailField, AuthPasswordField, AuthPrimaryButton } from "./AuthFormFields";
import { AuthMobileActions } from "./AuthMobileActions";
import ForgotPasswordModal from "./ForgotPasswordModal";

export default function AdminLogin({
  onLogin,
  onBack,
}: {
  onLogin: (user: AuthUser) => void;
  onBack: () => void;
}) {
  const [showPass, setShowPass] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [mfaStep, setMfaStep] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaDemoCode, setMfaDemoCode] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);

  const beginAdminMfa = async (user: AuthUser) => {
    const mfa = await startAdminMfa();
    setLoading(false);
    if (!mfa.ok) {
      setError(
        (mfa as { message?: string; detail?: string }).detail
          ? `Could not start MFA: ${(mfa as { detail?: string }).detail}`
          : (mfa as { message?: string }).message || "Could not start MFA. Please try again."
      );
      return false;
    }
    setPendingUser(user);
    setMfaDemoCode(mfa.demoCode ?? null);
    setMfaStep(true);
    return true;
  };

  const handleGoogleCredential = async (credential: string) => {
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const data = await signInWithGoogle(credential, { role: "admin" }, "admin");
      if (!data.ok) {
        setError(data.message || "We couldn't sign you in with Google. Please try again.");
        setLoading(false);
        return;
      }
      if (data.user?.role !== "admin") {
        setError("This account is not an admin account.");
        setLoading(false);
        return;
      }
      saveSession(data.token, data.user);
      await beginAdminMfa(data.user);
    } catch {
      setLoading(false);
      setError("We couldn't sign you in with Google. Please try again.");
    }
  };

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
      await beginAdminMfa(result.user);
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
      if (result.token && result.user) {
        saveSession(result.token, result.user);
        onLogin(result.user);
      } else {
        // Fallback: keep pending user only if server omitted token (should not happen)
        onLogin(pendingUser);
      }
    } catch {
      setLoading(false);
      setError("Verification failed. Please try again.");
    }
  };

  const splitTitle = mfaStep ? "Verify your identity" : "Secure staff access";
  const splitBody = mfaStep
    ? "Enter the verification code sent to your device to complete sign-in."
    : `${brand.productName} admin portal — multi-factor authentication is required for all staff sessions.`;

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
      split={{
        role: "admin",
        title: splitTitle,
        subtitle: "Staff portal",
        body: splitBody,
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
            <AuthPanel variant="split">
              <div className="mb-6 hidden lg:block">
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-neutral-500 mb-1">
                  {brand.productName} staff
                </p>
                <h1 className="text-[26px] font-bold tracking-tight text-primary">
                  Log in
                </h1>
                <p className="mt-2 text-[15px] text-neutral-500">
                  Please fill in your credentials to log in.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <GoogleSignInButton
                  disabled={loading}
                  text="signin_with"
                  onCredential={(cred) => void handleGoogleCredential(cred)}
                />
                <div className="flex items-center gap-3 text-xs text-neutral-400">
                  <span className="h-px flex-1 bg-neutral-200" />
                  or
                  <span className="h-px flex-1 bg-neutral-200" />
                </div>

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

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <AuthError message={error} />
                {loading && (
                  <p className="text-center text-xs text-neutral-500">Signing you in…</p>
                )}

                <AuthMobileActions>
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
                </AuthMobileActions>
              </form>
            </AuthPanel>
            {showForgot ? (
              <ForgotPasswordModal
                role="admin"
                initialEmail={email}
                onClose={() => setShowForgot(false)}
              />
            ) : null}
          </motion.div>
        ) : (
          <motion.div
            key="mfa"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="w-full"
          >
            <AuthPanel variant="split">
              <div className="mb-4 flex items-center gap-3 lg:hidden">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Step 2 of 2</p>
                  <p className="text-base font-bold text-primary">Two-factor verification</p>
                </div>
              </div>

              <div className="mb-6 hidden items-start gap-3 lg:flex">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-neutral-500 mb-1">
                    Step 2 of 2
                  </p>
                  <h1 className="text-[26px] font-bold tracking-tight text-primary">
                    Two-factor verification
                  </h1>
                  <p className="mt-1 text-[15px] text-neutral-500">
                    Enter the 6-digit code to continue
                  </p>
                </div>
              </div>

              <form onSubmit={handleMfa} className="space-y-4">
                <div>
                  <AuthFieldLabel soft>
                    Verification code
                  </AuthFieldLabel>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{4,8}"
                    maxLength={8}
                    required
                    autoComplete="one-time-code"
                    placeholder="••••••"
                    className={`${authInputClass} border-b text-center text-2xl font-mono tracking-[0.45em] rounded-none bg-transparent`}
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

                <AuthMobileActions>
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
                </AuthMobileActions>
              </form>

              <p className="mt-4 text-center text-xs text-neutral-500">
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
