import { useState } from "react";
import { X, Mail, CheckCircle, ArrowRight, Loader2 } from "lucide-react";
import { forgotPassword, type UserRole } from "./auth";
import { AuthError, AuthFieldLabel, authInputClass } from "./AuthShell";

export default function ForgotPasswordModal({
  role,
  onClose,
}: {
  role: UserRole;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
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
      setError("Something went wrong. Please try again.");
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
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-muted"
        >
          <X size={18} />
        </button>

        {sent ? (
          <div className="py-4 text-center">
            <CheckCircle size={44} className="mx-auto mb-4 text-emerald-500" />
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-foreground">
              Check your inbox
            </h2>
            <p className="mb-6 mt-2 text-sm text-neutral-600 dark:text-muted-foreground">
              If an account exists for <strong>{email}</strong>, you&apos;ll receive a password reset link shortly.
              Check your spam folder too.
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-2xl bg-neutral-900 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800 dark:bg-primary dark:hover:bg-primary/90"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2">
              <Mail size={15} className="text-primary" />
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">Password reset</span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-foreground">
              Forgot your password?
            </h2>
            <p className="mb-6 mt-2 text-sm text-neutral-600 dark:text-muted-foreground">
              Enter your {role === "homeowner" ? "homeowner" : "contractor"} account email and we&apos;ll send a secure
              reset link.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <AuthFieldLabel soft>Email address</AuthFieldLabel>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={role === "homeowner" ? "maria@example.com" : "james@yourcompany.com"}
                  required
                  autoFocus
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
                    Send reset link
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
