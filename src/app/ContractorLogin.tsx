import { useState } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, ArrowLeft, ArrowRight, HardHat } from "lucide-react";
import { getDemoUser, signInUser, signUpUser, type AuthUser } from "./auth";

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);

    window.setTimeout(() => {
      try {
        if (tab === "signup") {
          const result = signUpUser({
            role: "contractor",
            name: fullName,
            email,
            password,
            trade,
            licenseNumber,
            licenseDocumentName: licenseDocName,
            insuranceDocumentName: insuranceDocName,
            idDocumentName: idDocName,
          });

          setLoading(false);
          if (!result.ok) {
            setError(result.message);
            return;
          }

          onLogin(result.user);
          return;
        }

        const result = signInUser("contractor", email, password);
        setLoading(false);
        if (!result.ok) {
          setError(result.message);
          return;
        }

        onLogin(result.user);
      } catch {
        setLoading(false);
        setError("Something went wrong while signing in. Please try again.");
      }
    }, 500);
  };

  return (
    <div className="min-h-screen bg-background flex flex-row-reverse">
      {/* Right decorative panel */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-primary text-white p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div
          className="absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)" }}
        />

        <div className="relative">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors mb-16">
            <ArrowLeft size={14} />
            Back to site
          </button>
          <div className="flex items-center gap-1 mb-3">
            <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-2xl tracking-wider text-white">FIX</span>
            <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-2xl tracking-wider text-white/80">BRIDGE</span>
            <span className="font-mono text-[9px] bg-white text-primary px-1.5 py-0.5 ml-1">AI</span>
          </div>
          <h2
            className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase leading-[0.9] text-white mt-8"
            style={{ fontSize: "clamp(3rem,4vw,4.5rem)" }}
          >
            REAL JOBS.
            <br />
            <span style={{ WebkitTextStroke: "2px white", WebkitTextFillColor: "transparent" }}>
              YOUR TERMS.
            </span>
            <br />
            ZERO FEES.
          </h2>
        </div>

        <div className="relative space-y-4">
          {[
            { num: "60%", label: "average bid close rate" },
            { num: "312+", label: "active vetted contractors" },
            { num: "$0", label: "monthly fee — ever" },
          ].map(({ num, label }) => (
            <div key={label} className="flex items-center gap-4 border-t border-white/15 pt-4">
              <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-3xl text-white">{num}</span>
              <span className="text-sm text-white/60">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Left form panel */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-8 md:px-12 lg:px-20 py-8 sm:py-12">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 sm:mb-10 lg:hidden">
          <ArrowLeft size={14} />
          Back
        </button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full mx-auto lg:mx-0"
        >
          <div className="flex items-center gap-2 mb-2">
            <HardHat size={16} className="text-primary" />
            <span className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase">
              Contractor Portal
            </span>
          </div>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase text-3xl sm:text-4xl text-foreground mb-1">
            {tab === "login" ? "Welcome Back" : "Join the Network"}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            {tab === "login"
              ? "Sign in to view job matches, submit bids, and track your earnings."
              : "Apply free — get matched with real jobs in your trade and territory."}
          </p>
          {tab === "login" && (
            <div className="mb-6 border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="font-mono text-[10px] tracking-[0.18em] text-primary uppercase mb-1">
                Demo Login
              </p>
              <p className="text-sm text-foreground">Email: {demoUser.email}</p>
              <p className="text-sm text-foreground">Password: {demoUser.password}</p>
            </div>
          )}

          <div className="flex border border-border mb-6 sm:mb-8">
            {(["login", "signup"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setError("");
                }}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "login" ? "Sign In" : "Apply"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === "signup" && (
              <>
                <div>
                  <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="James Park"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </div>
                <div>
                  <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">
                    Primary Trade
                  </label>
                  <input
                    type="text"
                    placeholder="Plumbing, HVAC, Electrical…"
                    value={trade}
                    onChange={(e) => setTrade(e.target.value)}
                    required
                    className="w-full border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </div>
                <div>
                  <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">
                    License Number
                  </label>
                  <input
                    type="text"
                    placeholder="NY-12345678"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    required
                    className="w-full border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </div>
                <div className="space-y-3 border border-border bg-card/30 p-3 sm:p-4">
                  <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
                    Attach Documents
                  </p>
                  <div>
                    <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">
                      License Document
                    </label>
                    <input
                      type="file"
                      required
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setLicenseDocName(e.target.files?.[0]?.name ?? "")}
                      className="w-full text-xs text-foreground file:mr-3 file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">
                      Insurance Document
                    </label>
                    <input
                      type="file"
                      required
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setInsuranceDocName(e.target.files?.[0]?.name ?? "")}
                      className="w-full text-xs text-foreground file:mr-3 file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">
                      Government ID
                    </label>
                    <input
                      type="file"
                      required
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setIdDocName(e.target.files?.[0]?.name ?? "")}
                      className="w-full text-xs text-foreground file:mr-3 file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs"
                    />
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                placeholder="james@yourcompany.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>
            <div>
              <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">
                Password
              </label>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {tab === "login" && (
              <div className="text-right">
                <button type="button" className="font-mono text-[11px] text-primary hover:underline">
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
                <span className="font-mono text-sm">Signing in…</span>
              ) : (
                <>
                  {tab === "login" ? "Access Contractor Dashboard" : "Submit Application"}
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground text-center mb-3">
              Looking to hire a contractor instead?
            </p>
            <button
              onClick={onGoHomeowner}
              className="w-full border border-border text-foreground py-2.5 text-sm hover:border-foreground/30 transition-colors font-medium"
            >
              Sign In as a Homeowner →
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
