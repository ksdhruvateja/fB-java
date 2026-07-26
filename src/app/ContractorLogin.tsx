import { useState } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, ArrowLeft, ArrowRight, HardHat, Loader2 } from "lucide-react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { getDemoUser, signInUser, signUpUser, signInWithGoogle, type AuthUser } from "./auth";
import ForgotPasswordModal from "./ForgotPasswordModal";

const GOOGLE_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

const inputClass =
  "w-full rounded-2xl border border-border/70 bg-secondary/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors";

export default function ContractorLogin({
  onLogin,
  onBack,
  onGoHomeowner,
}: {
  onLogin: (user: AuthUser) => void;
  onBack: () => void;
  onGoHomeowner: () => void;
}) {
  const demoUser = getDemoUser("contractor");
  const [showPass, setShowPass] = useState(false);
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [trade, setTrade] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseDocName, setLicenseDocName] = useState("");
  const [insuranceDocName, setInsuranceDocName] = useState("");
  const [idDocName, setIdDocName] = useState("");
  const [email, setEmail] = useState(demoUser.email);
  const [password, setPassword] = useState(demoUser.password);
  const [showForgot, setShowForgot] = useState(false);

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      setError("Google sign-in failed. Please try again.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await signInWithGoogle(response.credential, "contractor");
      setLoading(false);
      if (!result.ok) { setError(result.message); return; }
      onLogin(result.user);
    } catch {
      setLoading(false);
      setError("Google sign-in failed. Please try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const result =
        tab === "signup"
          ? await signUpUser({
              role: "contractor",
              name: fullName,
              email,
              password,
              trade,
              licenseNumber,
              licenseDocumentName: licenseDocName,
              insuranceDocumentName: insuranceDocName,
              idDocumentName: idDocName,
            })
          : await signInUser("contractor", email, password);
      setLoading(false);
      if (!result.ok) { setError(result.message); return; }
      onLogin(result.user);
    } catch {
      setLoading(false);
      setError("Something went wrong. Please try again.");
    }
  };

  return (
    <>
      {showForgot && (
        <ForgotPasswordModal role="contractor" onClose={() => setShowForgot(false)} />
      )}

      <div className="relative min-h-screen overflow-hidden bg-[#F3F0EA] text-foreground">
        <div className="pointer-events-none absolute -right-20 top-8 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-8 h-80 w-80 rounded-full bg-foreground/10 blur-3xl" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/80 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
            >
              <ArrowLeft size={14} /> Back to site
            </button>
            <div className="flex items-center gap-1">
              <span className="[font-family:'Barlow_Condensed',sans-serif] text-xl font-black tracking-wider">FIX</span>
              <span className="[font-family:'Barlow_Condensed',sans-serif] text-xl font-black tracking-wider text-primary">BRIDGE</span>
            </div>
          </div>

          <div className="grid flex-1 items-start gap-6 pb-8 lg:grid-cols-12 lg:items-center">
            <div className="grid gap-4 lg:col-span-5">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[2rem] bg-primary p-7 text-white shadow-[0_24px_60px_rgba(255,77,28,0.28)]"
              >
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider">
                  <HardHat size={12} /> Contractor portal
                </div>
                <h2 className="[font-family:'Barlow_Condensed',sans-serif] text-4xl font-black uppercase leading-[0.92] sm:text-5xl">
                  Real jobs.
                  <br />
                  Your terms.
                  <br />
                  Zero fees.
                </h2>
                <p className="mt-4 max-w-sm text-sm text-white/75">
                  Get matched with homeowners, bid on scoped work, and grow your book — no monthly platform fee.
                </p>
              </motion.div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { num: "60%", label: "Close rate", tone: "bg-[#1F1A17] text-white" },
                  { num: "312+", label: "Pros active", tone: "bg-card text-foreground" },
                  { num: "$0", label: "Monthly fee", tone: "bg-foreground text-background" },
                ].map(({ num, label, tone }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 * (i + 1) }}
                    className={`rounded-[1.5rem] p-4 shadow-[0_14px_30px_rgba(10,10,10,0.08)] ${tone}`}
                  >
                    <p className="[font-family:'Barlow_Condensed',sans-serif] text-2xl font-black leading-none">{num}</p>
                    <p className="mt-2 text-[11px] opacity-70">{label}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="rounded-[2rem] border border-border/60 bg-card/95 p-6 shadow-[0_24px_60px_rgba(10,10,10,0.08)] backdrop-blur sm:p-8 lg:col-span-7"
            >
              <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase text-foreground sm:text-4xl">
                {tab === "login" ? "Welcome Back" : "Join the Network"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === "login"
                  ? "Sign in to view job matches, submit bids, and track your earnings."
                  : "Apply free — get matched with real jobs in your trade and territory."}
              </p>

              <div className="mt-5 flex rounded-full border border-border/70 bg-secondary/60 p-1">
                {(["login", "signup"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setTab(t); setError(""); }}
                    className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition-all ${
                      tab === t ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "login" ? "Sign In" : "Apply"}
                  </button>
                ))}
              </div>

              {tab === "login" && (
                <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Demo Login</p>
                  <p className="text-sm text-foreground">Email: {demoUser.email}</p>
                  <p className="text-sm text-foreground">Password: {demoUser.password}</p>
                </div>
              )}

              {tab === "login" && (
                <div className="mt-5">
                  {GOOGLE_ENABLED ? (
                    <div className="flex justify-center">
                      <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => setError("Google sign-in failed. Please try again.")}
                        text="continue_with"
                        shape="pill"
                        theme="outline"
                        size="large"
                        width="380"
                      />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-center">
                      <p className="text-sm font-medium text-foreground">Continue with Google</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Set VITE_GOOGLE_CLIENT_ID in Netlify build env, then redeploy
                      </p>
                    </div>
                  )}
                  <div className="mt-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] text-muted-foreground">or email</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                {tab === "signup" && (
                  <>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Full Name</label>
                      <input type="text" placeholder="James Park" value={fullName} onChange={(e) => setFullName(e.target.value)} required className={inputClass} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Primary Trade</label>
                      <input type="text" placeholder="Plumbing, HVAC, Electrical…" value={trade} onChange={(e) => setTrade(e.target.value)} required className={inputClass} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">License Number</label>
                      <input type="text" placeholder="NY-12345678" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required className={inputClass} />
                    </div>
                    <div className="space-y-3 rounded-2xl border border-border/70 bg-secondary/40 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Attach Documents</p>
                      {[
                        { label: "License Document", setter: setLicenseDocName },
                        { label: "Insurance Document", setter: setInsuranceDocName },
                        { label: "Government ID", setter: setIdDocName },
                      ].map(({ label, setter }) => (
                        <div key={label}>
                          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
                          <input
                            type="file"
                            required
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => setter(e.target.files?.[0]?.name ?? "")}
                            className="w-full text-xs text-foreground file:mr-3 file:rounded-full file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email Address</label>
                  <input type="email" placeholder="james@yourcompany.com" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className={`${inputClass} pr-10`}
                    />
                    <button type="button" onClick={() => setShowPass((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {tab === "login" && (
                  <div className="text-right">
                    <button type="button" onClick={() => setShowForgot(true)} className="text-[11px] font-semibold text-primary hover:underline">
                      Forgot password?
                    </button>
                  </div>
                )}

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="group mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 font-semibold text-white shadow-[0_14px_30px_rgba(255,77,28,0.28)] transition-all hover:bg-primary/90 disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <>
                      {tab === "login" ? "Access Contractor Dashboard" : "Submit Application"}
                      <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 rounded-2xl border border-border/60 bg-secondary/40 p-4 text-center">
                <p className="mb-3 text-sm text-muted-foreground">Looking to hire a contractor instead?</p>
                <button
                  type="button"
                  onClick={onGoHomeowner}
                  className="w-full rounded-2xl border border-border bg-card py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-foreground/20"
                >
                  Sign In as a Homeowner →
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </>
  );
}
