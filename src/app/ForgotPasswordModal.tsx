import { useState } from "react";
import { X, Mail, CheckCircle, ArrowRight, Loader2 } from "lucide-react";
import { forgotPassword, type ResetRole } from "./auth";
import { AuthError, AuthFieldLabel, authInputClass } from "./AuthShell";
import { brand } from "../config/brand";

function roleCopy(role: ResetRole) {
  switch (role) {
    case "homeowner":
      return "homeowner";
    case "contractor":
      return "contractor";
    case "admin":
      return "staff";
    case "partner":
      return "partner";
    default:
      return "account";
  }
}

export default function ForgotPasswordModal({
  role,
  onClose,
  initialEmail = "",
}: {
  role: ResetRole;
  onClose: () => void;
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email.trim(), role);
      setSent(true);
    } catch {
      // Still show success path for enumeration safety when network returns oddly
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-md rounded-[1.75rem] border border-neutral-200/80 bg-white p-8 shadow-[0_24px_60px_rgba(15,15,15,0.12)] dark:border-border dark:bg-card">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-muted"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {sent ? (
          <div className="py-4 text-center">
            <CheckCircle size={44} className="mx-auto mb-4 text-emerald-500" />
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-foreground">
              Check your email
            </h2>
            <p className="mb-6 mt-2 text-sm text-neutral-600 dark:text-muted-foreground">
              If an account exists for this email address, we&apos;ve sent password reset instructions.
              Check your spam folder too.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl bg-neutral-900 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800 dark:bg-primary dark:hover:bg-primary/90"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2">
              <Mail size={15} className="text-primary" />
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">Password reset</span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-foreground">
              Reset your password
            </h2>
            <p className="mb-6 mt-2 text-sm text-neutral-600 dark:text-muted-foreground">
              Enter the email associated with your {brand.productName} {roleCopy(role)} account.
            </p>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <AuthFieldLabel soft>Email</AuthFieldLabel>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  autoComplete="email"
                  className={authInputClass}
                />
              </div>

              <AuthError message={error} />

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-primary dark:hover:bg-primary/90"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <>
                    Send Reset Link
                    <ArrowRight size={14} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full text-center text-sm font-medium text-muted-foreground transition hover:text-foreground"
              >
                Back to Sign In
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
