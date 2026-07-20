import { useState } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, ArrowLeft, ArrowRight, Home, Loader2 } from "lucide-react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { getDemoUser, signInUser, signUpUser, signInWithGoogle, type AuthUser } from "./auth";
import ForgotPasswordModal from "./ForgotPasswordModal";

const GOOGLE_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

export default function HomeownerLogin({
  onLogin,
  onBack,
  onGoContractor,
}: {
  onLogin: (user: AuthUser) => void;
  onBack: () => void;
  onGoContractor: () => void;
}) {
  const demoUser = getDemoUser("homeowner");
  const [showPass, setShowPass] = useState(false);
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(demoUser.email);
  const [password, setPassword] = useState(demoUser.password);
  const [showForgot, setShowForgot] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const result =
        tab === "signup"
          ? await signUpUser({ role: "homeowner", name: fullName, email, password })
          : await signInUser("homeowner", email, password);
      setLoading(false);
      if (!result.ok) { setError(result.message); return; }
      onLogin(result.user);
    } catch {
      setLoading(false);
      setError("Something went wrong. Please try again.");
    }
  };

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) return;
    setError("");
    setLoading(true);
    try {
      const result = await signInWithGoogle(response.credential, "homeowner");
      setLoading(false);
      if (!result.ok) { setError(result.message); return; }
      onLogin(result.user);
    } catch {
      setLoading(false);
      setError("Google sign-in failed. Please try again.");
    }
  };

  return (
    <>
      {showForgot && (
        <ForgotPasswordModal role="homeowner" onClose={() => setShowForgot(false)} />
      )}

      <div className="min-h-screen bg-background flex">
        {/* Left panel — decorative */}
        <div className="hidden lg:flex flex-col justify-between w-[45%] bg-foreground text-background p-12 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(var(--background) 1px, transparent 1px), linear-gradient(90deg, var(--background) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
          <div
            className="absolute bottom-0 left-0 w-80 h-80 rounded-full blur-3xl pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,77,28,0.25) 0%, transparent 70%)" }}
          />
          <div className="relative">
            <button onClick={onBack} className="flex items-center gap-2 text-sm opacity-60 hover:opacity-100 transition-opacity mb-16">
              <ArrowLeft size={14} /> Back to site
            </button>
            <div className="flex items-center gap-1 mb-3">
              <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-2xl tracking-wider">FIX</span>
              <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-2xl tracking-wider text-primary">BRIDGE</span>
              <span className="font-mono text-[9px] bg-primary text-white px-1.5 py-0.5 ml-1">AI</span>
            </div>
            <h2
              className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] mt-8"
              style={{ fontSize: "clamp(3rem,4vw,4.5rem)" }}
            >
              YOUR HOME.
              <br />
              <span style={{ WebkitTextStroke: "2px #FF4D1C", WebkitTextFillColor: "transparent" }}>
                OUR NETWORK.
              </span>
              <br />
              FIXED.
            </h2>
          </div>
          <div className="relative space-y-4">
            {[
              { num: "2,847+", label: "jobs completed in NYC & LI" },
              { num: "Free",   label: "to post — always" },
              { num: "48h",    label: "average first bid received" },
            ].map(({ num, label }) => (
              <div key={label} className="flex items-center gap-4 border-t border-background/10 pt-4">
                <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-3xl text-primary">{num}</span>
                <span className="text-sm opacity-60">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel — form */}
        <div className="flex-1 flex flex-col justify-center px-4 sm:px-8 md:px-12 lg:px-20 py-8 sm:py-12">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 sm:mb-10 lg:hidden">
            <ArrowLeft size={14} /> Back
          </button>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-md w-full mx-auto lg:mx-0"
          >
            <div className="flex items-center gap-2 mb-2">
              <Home size={16} className="text-primary" />
              <span className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase">Homeowner Portal</span>
            </div>
            <h1 className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase text-3xl sm:text-4xl text-foreground mb-1">
              {tab === "login" ? "Welcome Back" : "Create Account"}
            </h1>
            <p className="text-sm text-muted-foreground mb-6 sm:mb-8">
              {tab === "login"
                ? "Sign in to view bids, post jobs, and get AI assessments."
                : "Join free — describe a problem and get real bids from vetted pros."}
            </p>

            {tab === "login" && (
              <div className="mb-6 border border-primary/20 bg-primary/5 px-4 py-3">
                <p className="font-mono text-[10px] tracking-[0.18em] text-primary uppercase mb-1">Demo Login</p>
                <p className="text-sm text-foreground">Email: {demoUser.email}</p>
                <p className="text-sm text-foreground">Password: {demoUser.password}</p>
              </div>
            )}

            {/* Google Sign-In */}
            {GOOGLE_ENABLED && tab === "login" && (
              <div className="mb-6">
                <div className="flex justify-center">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError("Google sign-in failed. Please try again.")}
                    text="continue_with"
                    shape="rectangular"
                    theme="outline"
                    size="large"
                    width="380"
                  />
                </div>
                <div className="flex items-center gap-3 mt-5">
                  <div className="flex-1 h-px bg-border" />
                  <span className="font-mono text-[11px] text-muted-foreground">or sign in with email</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              </div>
            )}

            {/* Tab toggle */}
            <div className="flex border border-border mb-6">
              {(["login", "signup"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTab(t); setError(""); }}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "login" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {tab === "signup" && (
                <div>
                  <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">Full Name</label>
                  <input
                    type="text"
                    placeholder="Maria Santos"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </div>
              )}
              <div>
                <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">Email Address</label>
                <input
                  type="email"
                  placeholder="maria@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
              <div>
                <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
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

              {tab === "login" && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="font-mono text-[11px] text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {error && (
                <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
                    {tab === "login" ? "Sign In to Dashboard" : "Create My Account"}
                    <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-sm text-muted-foreground text-center mb-3">Are you a licensed contractor?</p>
              <button
                onClick={onGoContractor}
                className="w-full border border-border text-foreground py-2.5 text-sm hover:border-foreground/30 transition-colors font-medium"
              >
                Sign In as a Contractor →
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
}
