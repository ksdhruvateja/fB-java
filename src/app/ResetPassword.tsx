import { useState } from "react";
import { motion } from "motion/react";
import { CheckCircle, ArrowRight, Loader2 } from "lucide-react";
import { resetPassword, type UserRole } from "./auth";
import { brand } from "../config/brand";
import { AuthShell, AuthPanel, AuthError } from "./AuthShell";
import { AuthPasswordField, AuthPrimaryButton } from "./AuthFormFields";
import type { AuthMascotVariant } from "./AuthMascotContext";

export default function ResetPassword({
  token,
  role,
  onDone,
}: {
  token: string;
  role: UserRole;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const mascotVariant: AuthMascotVariant = role === "homeowner" ? "homeowner" : "contractor";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
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
        setError(result.message || "Reset failed. The link may have expired.");
        return;
      }
      setDone(true);
      setTimeout(onDone, 2500);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      onBack={onDone}
      backLabel="Back to sign in"
      loading={loading}
      error={Boolean(error)}
      mascot={{
        variant: mascotVariant,
        title: done ? "You're all set!" : "Choose a new password",
        subtitle: done
          ? "Redirecting you to sign in…"
          : `Choose a strong password for your ${brand.productName} account.`,
      }}
    >
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full">
        <AuthPanel>
          {done ? (
            <div className="py-6 text-center">
              <CheckCircle size={52} className="mx-auto mb-4 text-emerald-500" />
              <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900 dark:text-foreground">
                Password updated!
              </h1>
              <p className="mt-2 text-sm text-neutral-600 dark:text-muted-foreground">Redirecting you to sign in…</p>
            </div>
          ) : (
            <>
              <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900 dark:text-foreground">
                Set new password
              </h1>
              <p className="mt-2 text-[15px] text-neutral-600 dark:text-muted-foreground">
                Choose a strong password for your {brand.productName} account.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <AuthPasswordField
                  value={password}
                  onChange={setPassword}
                  show={showPass}
                  onToggleShow={() => setShowPass((s) => !s)}
                  label="New password"
                  placeholder="Min. 6 characters"
                  autoComplete="new-password"
                />
                <AuthPasswordField
                  value={confirm}
                  onChange={setConfirm}
                  show={showConfirm}
                  onToggleShow={() => setShowConfirm((s) => !s)}
                  label="Confirm password"
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                />

                {password.length > 0 && (
                  <div className="flex gap-1">
                    {[6, 8, 12].map((threshold, i) => (
                      <div
                        key={threshold}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          password.length >= threshold
                            ? i === 0
                              ? "bg-red-400"
                              : i === 1
                                ? "bg-yellow-400"
                                : "bg-green-500"
                            : "bg-neutral-200 dark:bg-border"
                        }`}
                      />
                    ))}
                  </div>
                )}

                <AuthError message={error} />

                <AuthPrimaryButton loading={loading}>
                  {loading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <>
                      Set new password
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
