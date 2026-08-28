import type { ReactNode } from "react";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { BrandLogo } from "./BrandLogo";
import AuthMascot from "./AuthMascot";
import { AuthMascotProvider, useAuthMascot, type AuthMascotVariant } from "./AuthMascotContext";

export const authInputClass =
  "w-full rounded-2xl border border-neutral-200/90 bg-neutral-50/80 px-4 py-3.5 text-[15px] text-foreground placeholder:text-neutral-400 outline-none transition focus:border-primary/50 focus:bg-white focus:ring-4 focus:ring-primary/10 dark:border-border dark:bg-muted/30 dark:focus:bg-background";

/** @deprecated Use authInputClass — kept for gradual migration */
export const authInputClassHomeowner = authInputClass;

export function AuthFieldLabel({
  children,
  soft,
  required,
}: {
  children: ReactNode;
  soft?: boolean;
  required?: boolean;
}) {
  return (
    <span
      className={`mb-1.5 block font-medium ${
        soft ? "text-[13px] text-neutral-600 dark:text-muted-foreground" : "text-[11px] font-semibold tracking-wide text-muted-foreground"
      }`}
    >
      {children}
      {required ? <span className="ml-0.5 text-primary">*</span> : null}
    </span>
  );
}

export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-300"
    >
      {message}
    </motion.div>
  );
}

export function AuthMascotSync({
  title,
  subtitle,
  loading,
  error,
}: {
  title: string;
  subtitle: string;
  loading?: boolean;
  error?: boolean;
}) {
  const { setCopy, setMood, focusField } = useAuthMascot();

  useEffect(() => {
    setCopy({ title, subtitle });
  }, [title, subtitle, setCopy]);

  useEffect(() => {
    if (loading) {
      setMood("loading");
      return;
    }
    if (error) {
      setMood("error");
      return;
    }
    if (focusField === "email") setMood("focus-email");
    else if (focusField === "password") setMood("focus-password");
    else if (focusField === "text") setMood("focus-text");
    else setMood("idle");
  }, [loading, error, focusField, setMood]);

  return null;
}

export type AuthMascotHero = {
  line1: string;
  line2: string;
  subtitle: string;
  trustTitle?: string;
  trustBody?: string;
};

function MobileMascotHeader({ hero, title, subtitle }: { hero?: AuthMascotHero; title: string; subtitle: string }) {
  const { variant, mood } = useAuthMascot();
  const headline = hero?.line1 ?? title;
  const subline = hero?.subtitle ?? subtitle;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
      <div className="shrink-0 rounded-2xl bg-white/10 p-2 backdrop-blur-sm">
        <AuthMascot variant={variant} mood={mood} compact />
      </div>
      <div className="min-w-0 text-center sm:text-left">
        <p className="text-lg font-semibold tracking-tight text-white">{headline}</p>
        {hero?.line2 ? <p className="text-lg font-semibold tracking-tight text-primary">{hero.line2}</p> : null}
        <p className="mt-0.5 line-clamp-2 text-sm text-white/70">{subline}</p>
      </div>
    </div>
  );
}

function MascotAside({
  hero,
  badges,
  features,
}: {
  hero?: AuthMascotHero;
  badges?: ReactNode;
  features?: ReactNode;
}) {
  const { variant, mood, title, subtitle } = useAuthMascot();
  const headline1 = hero?.line1 ?? title;
  const headline2 = hero?.line2;
  const bodyCopy = hero?.subtitle ?? subtitle;

  return (
    <div className="relative flex h-full min-h-screen flex-col overflow-hidden bg-gradient-to-br from-[#0B1B3A] via-[#0f2447] to-[#0B1B3A] px-8 py-10 text-white xl:px-12 xl:py-12">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,77,28,0.22),transparent_55%),radial-gradient(ellipse_at_80%_70%,rgba(59,130,246,0.14),transparent_50%)]"
        aria-hidden
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute right-[8%] top-[12%] h-24 w-24 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm"
        animate={{ rotate: [0, 8, 0], y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-[6%] bottom-[28%] h-16 w-16 rounded-full border border-primary/30 bg-primary/10"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-20 top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
        animate={{ x: [0, 20, 0], y: [0, 14, 0], scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 9, ease: "easeInOut" }}
      />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center py-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 20, delay: 0.05 }}
          className="w-full max-w-[380px]"
        >
          <AuthMascot variant={variant} mood={mood} />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 160, damping: 22, delay: 0.1 }}
        className="relative z-10 max-w-lg"
      >
        <h1 className="text-[1.85rem] font-bold leading-[1.15] tracking-tight xl:text-[2.4rem]">{headline1}</h1>
        {headline2 ? (
          <h2 className="mt-1 text-[1.85rem] font-bold leading-[1.15] tracking-tight text-primary xl:text-[2.4rem]">
            {headline2}
          </h2>
        ) : null}
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/70">{bodyCopy}</p>
      </motion.div>

      {features ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="relative z-10 w-full max-w-md"
        >
          {features}
        </motion.div>
      ) : null}

      {badges ? (
        <motion.div
          animate={{ y: [0, -3, 0] }}
          transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
          className="relative z-10 mt-6 flex flex-wrap gap-2"
        >
          {badges}
        </motion.div>
      ) : null}

      {(hero?.trustTitle || hero?.trustBody) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative z-10 mt-auto pt-8"
        >
          <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-5 py-4 backdrop-blur-sm">
            {hero.trustTitle ? <p className="text-sm font-bold tracking-wide text-white">{hero.trustTitle}</p> : null}
            {hero.trustBody ? <p className="mt-1 text-xs leading-relaxed text-white/65">{hero.trustBody}</p> : null}
          </div>
        </motion.div>
      )}
    </div>
  );
}

/** Same plain logo as marketing nav — no chip/background wrapper. */
function AuthHeaderLogo() {
  return (
    <div className="shrink-0">
      <BrandLogo variant="nav" />
    </div>
  );
}

export function AuthShell({
  onBack,
  backLabel = "Back to site",
  children,
  aside,
  contentWide = false,
  variant = "default",
  mascot,
  loading,
  error,
}: {
  onBack: () => void;
  backLabel?: string;
  children: ReactNode;
  aside?: ReactNode;
  contentWide?: boolean;
  variant?: "default" | "homeowner";
  mascot?: {
    variant: AuthMascotVariant;
    title: string;
    subtitle: string;
    hero?: AuthMascotHero;
    badges?: ReactNode;
    features?: ReactNode;
  };
  loading?: boolean;
  error?: boolean;
}) {
  const useMascotLayout = Boolean(mascot);

  if (useMascotLayout && mascot) {
    return (
      <AuthMascotProvider variant={mascot.variant} initialTitle={mascot.title} initialSubtitle={mascot.subtitle}>
        <AuthMascotSync title={mascot.title} subtitle={mascot.subtitle} loading={loading} error={error} />
        <div className="grid min-h-screen lg:grid-cols-2">
          <div className="relative hidden lg:block">
            <MascotAside hero={mascot.hero} badges={mascot.badges} features={mascot.features ?? aside} />
          </div>

          <div className="relative flex min-h-screen flex-col bg-white dark:bg-background">
            <div className="border-b border-neutral-100 px-5 py-4 dark:border-border sm:px-8">
              <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
                <AuthHeaderLogo />
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-muted-foreground dark:hover:bg-muted"
                >
                  <ArrowLeft size={15} />
                  {backLabel}
                </button>
              </div>
            </div>

            <div className="border-b border-neutral-100 bg-gradient-to-br from-[#0B1B3A] via-[#0f2447] to-[#0B1B3A] px-5 py-8 lg:hidden dark:border-border">
              <MobileMascotHeader hero={mascot.hero} title={mascot.title} subtitle={mascot.subtitle} />
            </div>

            <main className="flex flex-1 flex-col justify-center px-5 py-8 sm:px-8 sm:py-10">
              <div className={`mx-auto w-full ${contentWide ? "max-w-3xl" : "max-w-[440px]"}`}>{children}</div>
            </main>
          </div>
        </div>
      </AuthMascotProvider>
    );
  }

  const isHome = variant === "homeowner";

  return (
    <div
      className={`relative min-h-screen overflow-hidden text-foreground ${
        isHome ? "bg-[#f7f7f7] dark:bg-background" : "bg-background"
      }`}
    >
      {!isHome && (
        <>
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,77,28,0.14),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(31,26,23,0.08),transparent_45%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(255,77,28,0.18),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(255,255,255,0.04),transparent_45%)]"
            aria-hidden
          />
        </>
      )}

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex items-center justify-between gap-3 sm:mb-7">
          <AuthHeaderLogo />
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/80 px-3.5 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur transition hover:border-primary/30 hover:text-foreground"
          >
            <ArrowLeft size={14} />
            {backLabel}
          </button>
        </header>

        <div
          className={`grid flex-1 items-start gap-5 pb-8 ${
            aside ? "lg:grid-cols-12 lg:gap-10 lg:items-center" : "justify-items-center"
          }`}
        >
          {aside ? <div className="order-2 w-full lg:order-1 lg:col-span-5">{aside}</div> : null}
          <div
            className={`order-1 w-full ${
              aside ? "lg:order-2 lg:col-span-7" : contentWide ? "max-w-4xl" : "max-w-lg"
            }`}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthPanel({
  children,
  className = "",
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "homeowner";
}) {
  const isMascot = variant === "homeowner" || variant === "default";
  return (
    <div
      className={`${
        isMascot
          ? "rounded-[1.75rem] border border-neutral-200/70 bg-white p-6 shadow-[0_20px_50px_rgba(15,15,15,0.06)] sm:p-8 dark:border-border dark:bg-card dark:shadow-none"
          : "rounded-[1.75rem] border border-border/60 bg-card/90 p-5 shadow-[0_24px_60px_rgba(10,10,10,0.1)] backdrop-blur-xl sm:p-7"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function AuthTabs<T extends string>({
  tabs,
  value,
  onChange,
  variant = "default",
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  variant?: "default" | "homeowner";
}) {
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === value),
  );

  if (variant === "homeowner") {
    return (
      <div role="tablist" className="mt-6 flex gap-6 border-b border-neutral-200 dark:border-border">
        {tabs.map((t) => {
          const active = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.id)}
              className={`relative pb-3 text-[15px] font-semibold transition ${
                active
                  ? "text-neutral-900 dark:text-foreground"
                  : "text-neutral-500 hover:text-neutral-800 dark:text-muted-foreground"
              }`}
            >
              {t.label}
              {active && (
                <motion.span
                  layoutId="homeowner-auth-tab"
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-neutral-900 dark:bg-primary"
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      className="relative mt-5 grid rounded-2xl border border-neutral-200/80 bg-neutral-50/80 p-1 dark:border-border dark:bg-muted/40"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      <motion.div
        className="absolute inset-y-1 rounded-xl bg-neutral-900 shadow-sm dark:bg-primary"
        initial={false}
        animate={{
          left: `calc(${(100 / tabs.length) * activeIndex}% + 4px)`,
          width: `calc(${100 / tabs.length}% - 8px)`,
        }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        aria-hidden
      />
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`relative z-10 rounded-xl px-2 py-2.5 text-xs font-bold transition sm:text-sm ${
              active ? "text-white" : "text-neutral-500 hover:text-neutral-800 dark:text-muted-foreground dark:hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function AuthSwitchCard({
  prompt,
  actionLabel,
  onAction,
  secondary,
  variant = "default",
}: {
  prompt: string;
  actionLabel: string;
  onAction: () => void;
  secondary?: ReactNode;
  variant?: "default" | "homeowner";
}) {
  const isHome = variant === "homeowner";
  return (
    <div
      className={`mt-8 text-center ${
        isHome
          ? "border-t border-neutral-200 pt-6 dark:border-border"
          : "rounded-2xl border border-dashed border-neutral-200/80 bg-neutral-50/60 p-4 dark:border-border dark:bg-muted/20"
      }`}
    >
      <p className={`mb-2.5 text-sm ${isHome ? "text-neutral-600 dark:text-muted-foreground" : "text-muted-foreground"}`}>
        {prompt}
      </p>
      <button
        type="button"
        onClick={onAction}
        className={
          isHome
            ? "text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline dark:text-foreground"
            : "w-full rounded-xl border border-neutral-200 bg-white py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:bg-primary/5 dark:border-border dark:bg-card"
        }
      >
        {actionLabel}
      </button>
      {secondary ? <div className={`mt-3 ${isHome ? "" : "border-t border-neutral-200/70 pt-3 dark:border-border"}`}>{secondary}</div> : null}
    </div>
  );
}
