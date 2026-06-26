import { useState, useRef } from "react";
import { motion } from "motion/react";
import { Sun, Moon, Menu, X, MapPin, ArrowRight } from "lucide-react";
import CustomerPage from "./CustomerPage";
import ContractorPage from "./ContractorPage";
import HomeownerLogin from "./HomeownerLogin";
import ContractorLogin from "./ContractorLogin";
import HomeownerDashboard from "./HomeownerDashboard";
import ContractorDashboard from "./ContractorDashboard";

type Page =
  | "home"
  | "contractors"
  | "homeowner-login"
  | "contractor-login"
  | "homeowner-dashboard"
  | "contractor-dashboard";

// ─── Shared Nav (marketing pages only) ───────────────────────────────────────

function Nav({
  page,
  onNavigate,
  isDark,
  onToggleDark,
  scrolled,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  isDark: boolean;
  onToggleDark: () => void;
  scrolled: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-background/95 backdrop-blur-md border-b border-border shadow-sm" : ""
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <button onClick={() => onNavigate("home")} className="flex items-center gap-0.5">
          <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-2xl tracking-wider text-foreground">
            FIX
          </span>
          <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-2xl tracking-wider text-primary">
            BRIDGE
          </span>
          <span className="ml-1.5 font-mono text-[9px] tracking-widest bg-primary text-white px-1.5 py-0.5">
            AI
          </span>
        </button>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          <button
            onClick={() => onNavigate("home")}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              page === "home" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            For Homeowners
            {page === "home" && (
              <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary" />
            )}
          </button>
          <button
            onClick={() => onNavigate("contractors")}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              page === "contractors" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            For Contractors
            {page === "contractors" && (
              <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary" />
            )}
          </button>
          <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            About
          </button>
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={onToggleDark}
            className="w-9 h-9 flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Sign in — context-aware */}
          <button
            onClick={() =>
              page === "contractors"
                ? onNavigate("contractor-login")
                : onNavigate("homeowner-login")
            }
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign In
          </button>

          <button
            onClick={() =>
              page === "contractors"
                ? onNavigate("contractor-login")
                : onNavigate("homeowner-login")
            }
            className="text-sm bg-primary text-white px-4 py-2 hover:bg-primary/90 transition-colors font-medium"
          >
            {page === "contractors" ? "Apply Now" : "Post a Repair"}
          </button>
        </div>

        {/* Mobile */}
        <div className="md:hidden flex items-center gap-2">
          <button
            onClick={onToggleDark}
            className="w-9 h-9 flex items-center justify-center border border-border text-muted-foreground"
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            className="w-9 h-9 flex items-center justify-center text-foreground"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden bg-background border-t border-border px-6 py-5 flex flex-col gap-4"
        >
          <button
            onClick={() => { onNavigate("home"); setMenuOpen(false); }}
            className={`text-sm text-left font-medium ${page === "home" ? "text-primary" : "text-muted-foreground"}`}
          >
            For Homeowners
          </button>
          <button
            onClick={() => { onNavigate("contractors"); setMenuOpen(false); }}
            className={`text-sm text-left font-medium ${page === "contractors" ? "text-primary" : "text-muted-foreground"}`}
          >
            For Contractors
          </button>
          <button className="text-sm text-left text-muted-foreground">About</button>
          <div className="pt-2 border-t border-border flex flex-col gap-2">
            <button
              onClick={() => { onNavigate("homeowner-login"); setMenuOpen(false); }}
              className="text-sm border border-border text-foreground px-4 py-2.5 text-left"
            >
              Sign In as Homeowner
            </button>
            <button
              onClick={() => { onNavigate("contractor-login"); setMenuOpen(false); }}
              className="text-sm bg-primary text-white px-4 py-2.5 text-left font-medium"
            >
              Sign In as Contractor
            </button>
          </div>
        </motion.div>
      )}
    </nav>
  );
}

// ─── Shared Footer ────────────────────────────────────────────────────────────

function Footer({ onNavigate }: { onNavigate: (p: Page) => void }) {
  return (
    <footer className="bg-card border-t border-border py-16 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          <div className="col-span-2">
            <div className="flex items-center gap-0.5 mb-4">
              <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-xl tracking-wider text-foreground">FIX</span>
              <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-xl tracking-wider text-primary">BRIDGE</span>
              <span className="font-mono text-[9px] bg-primary text-white px-1 py-0.5 ml-1.5">AI</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-4">
              The middle layer between homeowners and licensed local contractors — handling
              matching, trust, and paperwork so neither side has to.
            </p>
            <div className="flex items-center gap-2">
              <MapPin size={11} className="text-primary shrink-0" />
              <span className="font-mono text-[11px] text-muted-foreground">NYC & Long Island</span>
            </div>
          </div>

          {[
            {
              title: "Homeowners",
              links: ["Post a Job", "How It Works", "AI Assessment", "Find a Contractor", "Pricing"],
              page: "home" as Page,
            },
            {
              title: "Contractors",
              links: ["Join the Network", "How Bidding Works", "Compliance Docs", "Contractor Portal", "FAQ"],
              page: "contractors" as Page,
            },
            {
              title: "Company",
              links: ["About FixBridge", "Blog", "Press", "Careers", "Contact"],
              page: "home" as Page,
            },
          ].map(({ title, links, page }) => (
            <div key={title}>
              <p className="font-mono text-[11px] tracking-widest text-foreground uppercase mb-4">{title}</p>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link}>
                    <button
                      onClick={() => onNavigate(page)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Cross-promo strip */}
        <div className="border border-border p-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-background">
          <div>
            <p className="text-sm font-medium text-foreground mb-0.5">
              Are you a licensed contractor in NYC or Long Island?
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              Join 312+ pros getting matched with real jobs — zero monthly fees.
            </p>
          </div>
          <button
            onClick={() => onNavigate("contractors")}
            className="font-medium text-sm text-primary border border-primary/40 px-4 py-2 hover:bg-primary hover:text-white transition-all flex items-center gap-2 group shrink-0"
          >
            See Contractor Platform
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        <div className="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-mono text-[11px] text-muted-foreground">
            © 2024 FixBridge AI, Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            {["Privacy Policy", "Terms of Service", "Contractor Agreement"].map((item) => (
              <a key={item} href="#" className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                {item}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [isDark, setIsDark] = useState(false); // light mode by default
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrolled(e.currentTarget.scrollTop > 48);
  };

  const navigate = (p: Page) => {
    setPage(p);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const isMarketing = page === "home" || page === "contractors";
  const isDashboard = page === "homeowner-dashboard" || page === "contractor-dashboard";
  const isLogin = page === "homeowner-login" || page === "contractor-login";

  return (
    <div
      className={`${isDark ? "dark" : ""} size-full`}
      style={{ colorScheme: isDark ? "dark" : "light" }}
    >
      <div
        ref={scrollRef}
        data-scroll-root
        className="size-full overflow-y-auto overflow-x-hidden bg-background text-foreground [font-family:'DM_Sans',sans-serif] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={handleScroll}
      >
        {/* Marketing Nav */}
        {isMarketing && (
          <Nav
            page={page}
            onNavigate={navigate}
            isDark={isDark}
            onToggleDark={() => setIsDark((d) => !d)}
            scrolled={scrolled}
          />
        )}

        {/* Page content */}
        <motion.div
          key={page}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          {page === "home" && <CustomerPage scrollContainer={scrollRef} />}
          {page === "contractors" && <ContractorPage scrollContainer={scrollRef} />}

          {page === "homeowner-login" && (
            <HomeownerLogin
              onLogin={() => navigate("homeowner-dashboard")}
              onBack={() => navigate("home")}
              onGoContractor={() => navigate("contractor-login")}
            />
          )}

          {page === "contractor-login" && (
            <ContractorLogin
              onLogin={() => navigate("contractor-dashboard")}
              onBack={() => navigate("contractors")}
              onGoHomeowner={() => navigate("homeowner-login")}
            />
          )}

          {page === "homeowner-dashboard" && (
            <HomeownerDashboard
              onLogout={() => navigate("home")}
              isDark={isDark}
              onToggleDark={() => setIsDark((d) => !d)}
            />
          )}

          {page === "contractor-dashboard" && (
            <ContractorDashboard
              onLogout={() => navigate("contractors")}
              isDark={isDark}
              onToggleDark={() => setIsDark((d) => !d)}
            />
          )}
        </motion.div>

        {/* Footer only on marketing pages */}
        {isMarketing && <Footer onNavigate={navigate} />}
      </div>
    </div>
  );
}
