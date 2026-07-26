import { useState } from "react";
import { motion } from "motion/react";
import {
  Eye, EyeOff, CheckCircle, AlertCircle, ArrowRight, Shield, Loader2,
} from "lucide-react";
import { resetPassword, type UserRole } from "./auth";
import { brand } from "../config/brand";

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
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

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
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="w-full max-w-md"
      >
        {done ? (
          <div className="text-center py-8">
            <CheckCircle size={52} className="text-green-500 mx-auto mb-4" />
            <h1 className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase text-3xl text-foreground mb-2">
              Password updated!
            </h1>
            <p className="text-sm text-muted-foreground">
              Redirecting you to sign in…
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Shield size={15} className="text-primary" />
              <span className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase">
                {role === "homeowner" ? "Homeowner Portal" : "Contractor Portal"}
              </span>
            </div>
            <h1 className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase text-3xl sm:text-4xl text-foreground mb-1">
              Set New Password
            </h1>
            <p className="text-sm text-muted-foreground mb-8">
              Choose a strong password for your {brand.productName} account.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    required
                    autoFocus
                    className="w-full border border-border bg-card px-4 py-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">
                  Confirm Password
                </label>
                <input
                  type={showPass ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  className="w-full border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>

              {/* Password strength hint */}
              {password.length > 0 && (
                <div className="flex gap-1">
                  {[6, 8, 12].map((threshold, i) => (
                    <div
                      key={threshold}
                      className={`flex-1 h-1 rounded-full transition-colors ${
                        password.length >= threshold
                          ? i === 0 ? "bg-red-400" : i === 1 ? "bg-yellow-400" : "bg-green-500"
                          : "bg-border"
                      }`}
                    />
                  ))}
                </div>
              )}

              {error && (
                <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white py-3 font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60 group mt-2"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <>
                    Set New Password
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
