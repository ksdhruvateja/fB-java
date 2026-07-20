import { useState } from "react";
import { X, Mail, CheckCircle, ArrowRight, Loader2 } from "lucide-react";
import { forgotPassword, type UserRole } from "./auth";

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
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border border-border w-full max-w-md p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={18} />
        </button>

        {sent ? (
          <div className="text-center py-4">
            <CheckCircle size={44} className="text-green-500 mx-auto mb-4" />
            <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase text-2xl text-foreground mb-2">
              Check your inbox
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              If an account exists for <strong>{email}</strong>, you'll receive a
              password reset link shortly. Check your spam folder too.
            </p>
            <button
              onClick={onClose}
              className="w-full bg-primary text-white py-3 font-medium hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Mail size={15} className="text-primary" />
              <span className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase">
                Password Reset
              </span>
            </div>
            <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase text-2xl text-foreground mb-1">
              Forgot your password?
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Enter your{" "}
              {role === "homeowner" ? "homeowner" : "contractor"} account email
              and we'll send a secure reset link.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={
                    role === "homeowner"
                      ? "maria@example.com"
                      : "james@yourcompany.com"
                  }
                  required
                  autoFocus
                  className="w-full border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>

              {error && (
                <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white py-3 font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60"
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
            </form>
          </>
        )}
      </div>
    </div>
  );
}
