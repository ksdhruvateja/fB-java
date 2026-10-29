import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle, ArrowRight, Loader2, AlertTriangle } from "lucide-react";
import { resetPassword, type ResetRole } from "./auth";
import { brand } from "../config/brand";
import { AuthShell, AuthPanel, AuthError } from "./AuthShell";
import { AuthPasswordField, AuthPrimaryButton } from "./AuthFormFields";
import type { AuthMascotVariant } from "./AuthMascotContext";

const MIN_LEN = 8;

function passwordChecks(password: string) {
  return [
    { id: "length", label: `At least ${MIN_LEN} characters`, ok: password.length >= MIN_LEN },
    { id: "letter", label: "Contains a letter", ok: /[A-Za-z]/.test(password) },
    { id: "number", label: "Contains a number", ok: /\d/.test(password) },
  ];
}

function strengthScore(password: string) {
  let score = 0;
  if (password.length >= MIN_LEN) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Za-z]/.test(password) && /\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(3, score);
}

function mascotForRole(role: ResetRole): AuthMascotVariant {
  if (role === "homeowner") return "homeowner";
  if (role === "contractor") return "contractor";
  return "admin";
}

export default function ResetPassword({
  token,
  role,
  onDone,
  onRequestNew,
}: {
  token: string;
  role: ResetRole;
  onDone: () => void;
  onRequestNew?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [error, setError] = useState("");

  const checks = useMemo(() => passwordChecks(password), [password]);
  const strength = strengthScore(password);
  const allChecksOk = checks.every((c) => c.ok);
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const mascotVariant = mascotForRole(role);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!allChecksOk) {
      setError(`Password must be at least ${MIN_LEN} characters and include a letter and a number.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await resetPassword(token, role, password);
      if (!result.ok) {
        const msg = result.message || "This reset link has expired or is no longer valid.";
        if (/expired|no longer valid|invalid/i.test(msg) || result.code === "invalid") {
          setInvalidLink(true);
        } else {
          setError(msg);
        }
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (invalidLink) {
    return (
      <AuthShell
        onBack={onDone}
        backLabel="Back to sign in"
        mascot={{
          variant: mascotVariant,
          title: "Link expired",
          subtitle: "Request a new reset link to continue.",
          hero: {
            line1: "Link expired.",
            line2: "Try again.",
            subtitle: "Reset links expire after 60 minutes for your security.",
            trustTitle: "Your account is safe.",
            trustBody: "No password changes were made with this link.",
          },
        }}
      >
        <AuthPanel>
          <div className="py-4 text-center">
            <AlertTriangle size={44} className="mx-auto mb-4 text-amber-500" />
            <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900 dark:text-foreground">
              This reset link has expired or is no longer valid.
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-muted-foreground">
              For security, reset links can only be used once and expire after 60 minutes.
            </p>
            <div className="mt-6 space-y-3">
              {onRequestNew ? (
                <button
                  type="button"
                  onClick={onRequestNew}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 text-sm font-semibold text-white dark:bg-primary"
                >
                  Request New Reset Link
                </button>
              ) : null}
              <button
                type="button"
                onClick={onDone}
                className="w-full text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        </AuthPanel>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      onBack={onDone}
      backLabel="Back to sign in"
      loading={loading}
      error={Boolean(error)}
      mascot={{
        variant: mascotVariant,
        title: done ? "You're all set!" : "Create a new password",
        subtitle: done
          ? "Your password has been changed successfully."
          : `Choose a strong password for your ${brand.productName} account.`,
        hero: {
          line1: done ? "Password updated." : "Almost there.",
          line2: done ? "Welcome back." : "Secure your account.",
          subtitle: done
            ? "Sign in with your new password."
            : "Pick a strong password — our pro will cover his eyes while you type.",
          trustTitle: "Your info stays protected.",
          trustBody: "Passwords are encrypted. Roles and account data are never changed by a reset.",
        },
      }}
    >
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full">
        <AuthPanel>
          {done ? (
            <div className="py-6 text-center">
              <CheckCircle size={52} className="mx-auto mb-4 text-emerald-500" />
              <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900 dark:text-foreground">
                Password updated
              </h1>
              <p className="mt-2 text-sm text-neutral-600 dark:text-muted-foreground">
                Your password has been changed successfully.
              </p>
              <button
                type="button"
                onClick={onDone}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 text-sm font-semibold text-white dark:bg-primary"
              >
                Sign In
                <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900 dark:text-foreground">
                Create a new password
              </h1>
              <p className="mt-2 text-[15px] text-neutral-600 dark:text-muted-foreground">
                Choose a strong password for your {brand.productName} account.
              </p>

              <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
                <AuthPasswordField
                  value={password}
                  onChange={setPassword}
                  show={showPass}
                  onToggleShow={() => setShowPass((s) => !s)}
                  label="New password"
                  placeholder={`Min. ${MIN_LEN} characters`}
                  autoComplete="new-password"
                />
                <AuthPasswordField
                  value={confirm}
                  onChange={setConfirm}
                  show={showConfirm}
                  onToggleShow={() => setShowConfirm((s) => !s)}
                  label="Confirm new password"
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                />

                {password.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            strength > i
                              ? strength === 1
                                ? "bg-red-400"
                                : strength === 2
                                  ? "bg-yellow-400"
                                  : "bg-green-500"
                              : "bg-neutral-200 dark:bg-border"
                          }`}
                        />
                      ))}
                    </div>
                    <ul className="space-y-1 text-xs">
                      {checks.map((c) => (
                        <li
                          key={c.id}
                          className={c.ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}
                        >
                          {c.ok ? "✓" : "○"} {c.label}
                        </li>
                      ))}
                      <li
                        className={
                          passwordsMatch ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                        }
                      >
                        {passwordsMatch ? "✓" : "○"} Passwords match
                      </li>
                    </ul>
                  </div>
                )}

                <AuthError message={error} />

                <AuthPrimaryButton loading={loading} disabled={!allChecksOk || !passwordsMatch}>
                  {loading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <>
                      Reset Password
                      <ArrowRight size={14} />
                    </>
                  )}
                </AuthPrimaryButton>
              </form>
            </>
          )}
        </AuthPanel>
      </motion.div>
    </AuthShell>
  );
}
