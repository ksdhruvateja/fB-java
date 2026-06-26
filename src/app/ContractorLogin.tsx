import { useState } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, ArrowLeft, ArrowRight, HardHat } from "lucide-react";

export default function ContractorLogin({
  onLogin,
  onBack,
  onGoHomeowner,
}: {
  onLogin: () => void;
  onBack: () => void;
  onGoHomeowner: () => void;
}) {
  const [showPass, setShowPass] = useState(false);
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin(); }, 1000);
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
      <div className="flex-1 flex flex-col justify-center px-8 md:px-16 lg:px-20 py-12">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10 lg:hidden">
          <ArrowLeft size={14} />
          Back
        </button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-sm w-full mx-auto lg:mx-0"
        >
          <div className="flex items-center gap-2 mb-2">
            <HardHat size={16} className="text-primary" />
            <span className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase">
              Contractor Portal
            </span>
          </div>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase text-4xl text-foreground mb-1">
            {tab === "login" ? "Welcome Back" : "Join the Network"}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            {tab === "login"
              ? "Sign in to view job matches, submit bids, and track your earnings."
              : "Apply free — get matched with real jobs in your trade and territory."}
          </p>

          <div className="flex border border-border mb-8">
            {(["login", "signup"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
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
                    required
                    className="w-full border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors"
                  />
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

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-3.5 font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60 group mt-2"
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
