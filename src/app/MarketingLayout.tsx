import { pagePath } from "../../shared/public-seo.js";
import { useState } from "react";
import { motion } from "motion/react";
import { Sun, Moon, Menu, X, ArrowRight, MapPin } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { brand } from "../config/brand";
import { PUBLIC_FOOTER_LEGAL_LINKS, PUBLIC_CONTRACTOR_LEGAL_LINKS } from "./legalDocuments";
import type { AppPage as Page } from "./navigation";
export function Nav({
  page,
  onNavigate,
  marketingContext,
  isDark,
  onToggleDark,
  scrolled
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  marketingContext: "home" | "contractors";
  isDark: boolean;
  onToggleDark: () => void;
  scrolled: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const overHero = (page === "home" || page === "contractors" || page === "about") && !scrolled && !menuOpen;
  const ink = overHero ? "text-white" : "text-foreground";
  const muted = overHero ? "text-white/65 hover:text-white" : "text-muted-foreground hover:text-foreground";
  const active = overHero ? "text-white" : "text-foreground";
  const border = overHero ? "border-white/30" : "border-border";
  const navLogoTone = !overHero && !isDark ? "black" : "color";
  const goToHome = () => {
    onNavigate("home");
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-scroll-root]")?.scrollTo({
        top: 0,
        behavior: "smooth"
      });
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });
  };
  return <nav onClickCapture={event => {
    if ((event.target as HTMLElement).closest("a")) event.preventDefault();
  }} className="fixed top-0 left-0 right-0 z-50 bg-transparent pt-[env(safe-area-inset-top)] transition-colors duration-300">
      <div className="relative w-full px-5 sm:px-6 lg:px-10 xl:px-12 2xl:px-16 py-2.5 sm:py-3.5 min-h-[3.25rem] flex items-center">
        <a href={"/"} onClick={goToHome} className="relative z-10 flex shrink-0 items-center min-w-0" aria-label={`${brand.productName} home`}>
          <BrandLogo variant="nav" tone={navLogoTone} className="transition-opacity duration-300 shrink-0" />
        </a>

        {/* Desktop center links — truly centered in the viewport */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden -translate-y-1/2 justify-center lg:flex">
          <div className="pointer-events-auto flex items-center gap-1">
            <a href={pagePath("home")} onClick={() => onNavigate("home")} className={`relative px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${page === "home" ? active : muted}`}>
              For Homeowners
              {page === "home" && <span className={`absolute bottom-0 left-4 right-4 h-0.5 ${overHero ? "bg-white" : "bg-primary"}`} />}
            </a>
            <a href={pagePath("contractors")} onClick={() => onNavigate("contractors")} className={`relative px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${page === "contractors" ? active : muted}`}>
              For Contractors
              {page === "contractors" && <span className={`absolute bottom-0 left-4 right-4 h-0.5 ${overHero ? "bg-white" : "bg-primary"}`} />}
            </a>
            <a href={pagePath("about")} onClick={() => onNavigate("about")} className={`relative px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${page === "about" ? active : muted}`}>
              About
              {page === "about" && <span className={`absolute bottom-0 left-4 right-4 h-0.5 ${overHero ? "bg-white" : "bg-primary"}`} />}
            </a>
          </div>
        </div>

        {/* Right actions — flush right within page gutters */}
        <div className="relative z-10 ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden md:flex items-center gap-3">
            <button onClick={onToggleDark} className={`w-9 h-9 flex items-center justify-center border transition-colors ${border} ${muted}`} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}>
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <a href={pagePath(marketingContext === "contractors" ? "contractor-login" : "homeowner-login")} onClick={() => marketingContext === "contractors" ? onNavigate("contractor-login") : onNavigate("homeowner-login")} className={`text-sm font-medium transition-colors whitespace-nowrap ${muted}`}>
              Sign In
            </a>

            <a href={pagePath(marketingContext === "contractors" ? "contractor-login" : "homeowner-login")} onClick={() => marketingContext === "contractors" ? onNavigate("contractor-login") : onNavigate("homeowner-login")} className={`text-sm px-4 py-2 transition-colors font-medium whitespace-nowrap ${overHero ? "bg-white text-black hover:bg-white/90" : "bg-primary text-white hover:bg-primary/90"}`}>
              {marketingContext === "contractors" ? "Apply Now" : "Post a Repair"}
            </a>
          </div>

          {/* Mobile menu (below md) */}
          <div className="flex md:hidden items-center gap-2">
            <button onClick={onToggleDark} className={`w-9 h-9 flex items-center justify-center border ${border} ${muted}`} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}>
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button className={`w-9 h-9 flex items-center justify-center ${ink}`} onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Close menu" : "Open menu"}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

          {/* Tablet: page links menu while center nav is hidden (md–lg) */}
          <button type="button" className={`hidden md:flex lg:hidden w-9 h-9 items-center justify-center ${ink}`} onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Close menu" : "Open menu"}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && <motion.div initial={{
      opacity: 0,
      y: -8
    }} animate={{
      opacity: 1,
      y: 0
    }} className="lg:hidden bg-background border-t border-border px-5 sm:px-6 lg:px-10 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-1 max-h-[min(80svh,520px)] overflow-y-auto">
          <a href={pagePath("home")} onClick={() => {
        onNavigate("home");
        setMenuOpen(false);
      }} className={`text-sm text-left font-medium py-3 ${page === "home" ? "text-primary" : "text-muted-foreground"}`}>
            For Homeowners
          </a>
          <a href={pagePath("contractors")} onClick={() => {
        onNavigate("contractors");
        setMenuOpen(false);
      }} className={`text-sm text-left font-medium py-3 ${page === "contractors" ? "text-primary" : "text-muted-foreground"}`}>
            For Contractors
          </a>
          <a href={pagePath("about")} onClick={() => {
        onNavigate("about");
        setMenuOpen(false);
      }} className={`text-sm text-left font-medium py-3 ${page === "about" ? "text-primary" : "text-muted-foreground"}`}>
            About
          </a>
          <div className="pt-3 mt-1 border-t border-border flex flex-col gap-2">
            <a href={pagePath("homeowner-login")} onClick={() => {
          onNavigate("homeowner-login");
          setMenuOpen(false);
        }} className="text-sm border border-border text-foreground px-4 py-3 text-left rounded-sm">
              Sign In as Homeowner
            </a>
            <a href={pagePath("contractor-login")} onClick={() => {
          onNavigate("contractor-login");
          setMenuOpen(false);
        }} className="text-sm bg-primary text-white px-4 py-3 text-left font-medium rounded-sm">
              Sign In as Contractor
            </a>
          </div>
        </motion.div>}
    </nav>;
}

// ─── Shared Footer ────────────────────────────────────────────────────────────

export function Footer({
  onNavigate
}: {
  onNavigate: (p: Page) => void;
}) {
  const linkGroups = [{
    title: "Homeowners",
    links: [{
      label: "Post a Job",
      page: "homeowner-login" as Page
    }, {
      label: "How It Works",
      page: "home" as Page
    }, {
      label: "Fixera Assessment",
      page: "home" as Page
    }, {
      label: "Find a Contractor",
      page: "home" as Page
    }, {
      label: "Pricing",
      page: "go-pro" as Page
    }, {
      label: "HomeCare Plans",
      page: "go-pro" as Page
    }]
  }, {
    title: "Contractors",
    links: [{
      label: "Join the Network",
      page: "contractor-login" as Page
    }, {
      label: "How Bidding Works",
      page: "contractors" as Page
    }, {
      label: "Compliance Docs",
      page: "contractors" as Page
    }, {
      label: "Contractor Portal",
      page: "contractor-login" as Page
    }, {
      label: "FAQ",
      page: "contractors" as Page
    }]
  }, {
    title: "Company",
    links: [{
      label: `About ${brand.productName}`,
      page: "about" as Page
    }, {
      label: "Blog",
      page: "home" as Page
    }, {
      label: "Press",
      page: "home" as Page
    }, {
      label: "Careers",
      page: "home" as Page
    }, {
      label: "Contact",
      page: "home" as Page
    }, {
      label: "Staff login",
      page: "admin-login" as Page
    }
    // { label: "Partner portal", page: "partner" as Page },
    ]
  }];
  return <footer onClickCapture={event => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (anchor && anchor.getAttribute("href")?.startsWith("/") && !anchor.getAttribute("href")?.startsWith("/legal")) event.preventDefault();
  }} className="border-t border-border bg-background px-4 py-10 sm:px-6 sm:py-12 md:py-16 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="max-w-7xl mx-auto">
        {/* Brand */}
        <div className="pb-8 mb-8 border-b border-border/70 lg:border-0 lg:pb-0 lg:mb-0">
          <div className="lg:hidden">
            <a href={pagePath("home")} onClick={() => onNavigate("home")} className="mb-4 inline-flex rounded-md outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/40" aria-label={`${brand.productName} home`}>
              <BrandLogo variant="nav" />
            </a>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-3">
              Home repair requests, property records and professional coordination — keeping the next step connected to the right home.
            </p>
            <div className="flex items-center gap-2">
              <MapPin size={11} className="text-primary shrink-0" />
              <span className="font-mono text-[11px] text-muted-foreground">Availability varies by request</span>
            </div>
          </div>
        </div>

        {/* Desktop / tablet: brand + 3 columns · Mobile: 2-column link split */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-4 gap-y-8 sm:gap-x-8 sm:gap-y-10 mb-8 sm:mb-10 md:mb-12">
          <div className="hidden lg:block lg:col-span-2 pr-6">
            <a href={pagePath("home")} onClick={() => onNavigate("home")} className="mb-4 inline-flex rounded-md outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/40" aria-label={`${brand.productName} home`}>
              <BrandLogo variant="nav" />
            </a>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-4">
              Home repair requests, property records and professional coordination — keeping the next step connected to the right home.
            </p>
            <div className="flex items-center gap-2">
              <MapPin size={11} className="text-primary shrink-0" />
              <span className="font-mono text-[11px] text-muted-foreground">Availability varies by request</span>
            </div>
          </div>

          {linkGroups.map(({
          title,
          links
        }) => <div key={title} className="min-w-0">
              <p className="font-mono text-[11px] tracking-widest text-foreground uppercase mb-3 sm:mb-4">
                {title}
              </p>
              <ul className="space-y-2 sm:space-y-2.5">
                {links.map(({
              label,
              page
            }) => <li key={label}>
                    <a href={pagePath(page)} onClick={() => {
                onNavigate(page);
                if (label === "Contact") {
                  requestAnimationFrame(() => {
                    document.querySelector<HTMLElement>("[data-scroll-root]")?.scrollTo({
                      top: 0,
                      behavior: "smooth"
                    });
                    window.scrollTo({
                      top: 0,
                      behavior: "smooth"
                    });
                  });
                }
              }} className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left leading-snug">
                      {label}
                    </a>
                  </li>)}
              </ul>
            </div>)}
        </div>

        {/* Cross-promo strip */}
        <div className="border border-border p-4 sm:p-5 mb-8 sm:mb-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 bg-background">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground mb-0.5">
              Are you a licensed contractor?
            </p>
            <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
              Explore service requests and contractor coordination with FixBridge.
            </p>
          </div>
          <a href={pagePath("contractor-login")} onClick={() => onNavigate("contractor-login")} className="font-medium text-sm text-primary border border-primary/40 px-4 py-2.5 hover:bg-primary hover:text-white transition-all flex items-center justify-center gap-2 group shrink-0 w-full sm:w-auto">
            See Contractor Platform
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </a>
        </div>

        <div className="border-t border-border pt-6 sm:pt-8 flex flex-col gap-4">
          <p className="font-mono text-[11px] text-muted-foreground text-center sm:text-left">
            © 2026 {brand.productName} All rights reserved.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Legal</p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4">
                {PUBLIC_FOOTER_LEGAL_LINKS.map(item => <a key={item.href} href={item.href} className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    {item.label}
                  </a>)}
              </div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-4 mb-2">
                Contractors
              </p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4">
                {PUBLIC_CONTRACTOR_LEGAL_LINKS.map(item => <a key={item.href} href={item.href} className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    {item.label}
                  </a>)}
              </div>
            </div>
            <span className="font-mono text-[10px] text-primary/80 tracking-wider self-center sm:self-auto" title="Deploy build stamp — hard-refresh if this does not match the latest release">
              Build {typeof __FIXBRIDGE_BUILD__ !== "undefined" ? __FIXBRIDGE_BUILD__ : "dev"} · v0.0.2
            </span>
          </div>
        </div>
      </div>
    </footer>;
}

// ─── App ─────────────────────────────────────────────────────────────────────
