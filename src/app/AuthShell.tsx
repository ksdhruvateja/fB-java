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

export function AuthFieldLabel({ children, soft }: { children: ReactNode; soft?: boolean }) {
  return (
    <span
      className={`mb-1.5 block font-medium ${
        soft ? "text-[13px] text-neutral-600 dark:text-muted-foreground" : "text-[11px] font-semibold tracking-wide text-muted-foreground"
      }`}
    >
      {children}
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
  const { setCopy, setMood } = useAuthMascot();

  useEffect(() => {
    setCopy({ title, subtitle });
  }, [title, subtitle, setCopy]);

  useEffect(() => {
    if (loading) setMood("loading");
    else if (error) setMood("error");
    else setMood("idle");
  }, [loading, error, setMood]);

  return null;
}

function MascotAside({ badges, features }: { badges?: ReactNode; features?: ReactNode }) {
  const { variant, mood, title, subtitle } = useAuthMascot();

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-8 py-12 xl:px-14">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,77,28,0.22),transparent_55%),radial-gradient(ellipse_at_80%_80%,rgba(255,180,140,0.35),transparent_50%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute -left-16 top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-10 bottom-16 h-56 w-56 rounded-full bg-orange-200/40 blur-3xl" aria-hidden />

      <div className="relative z-10 flex max-w-md flex-col items-center text-center">
        <AuthMascot variant={variant} mood={mood} />
        <motion.h2
          key={title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 text-3xl font-semibold tracking-tight text-neutral-900 dark:text-foreground"
        >
          {title}
        </motion.h2>
        <motion.p
          key={subtitle}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="mt-3 text-[15px] leading-relaxed text-neutral-600 dark:text-muted-foreground"
        >
          {subtitle}
        </motion.p>
        {badges ? <div className="mt-6 flex flex-wrap justify-center gap-2">{badges}</div> : null}
        {features ? <div className="mt-8 w-full text-left">{features}</div> : null}
      </div>
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
          <div className="relative hidden bg-gradient-to-br from-[#FFF0EA] via-[#FFE8DE] to-[#FFF8F4] lg:block dark:from-background dark:via-muted/30 dark:to-background">
            <MascotAside badges={mascot.badges} features={mascot.features ?? aside} />
          </div>

          <div className="relative flex min-h-screen flex-col bg-white dark:bg-background">
            <div className="border-b border-neutral-100 px-5 py-4 dark:border-border sm:px-8">
              <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-muted-foreground dark:hover:bg-muted"
                >
                  <ArrowLeft size={15} />
                  {backLabel}
                </button>
                <BrandLogo variant="auth" tone="auto" />
              </div>
            </div>

            <div className="lg:hidden border-b border-neutral-100 bg-gradient-to-br from-[#FFF0EA] to-[#FFF8F4] px-5 py-6 dark:border-border dark:from-muted/40 dark:to-background">
              <div className="mx-auto flex max-w-xl items-center gap-4">
                <AuthMascot variant={mascot.variant} mood={error ? "error" : loading ? "loading" : "idle"} compact />
                <div className="min-w-0 text-left">
                  <p className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-foreground">{mascot.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-neutral-600 dark:text-muted-foreground">{mascot.subtitle}</p>
                </div>
              </div>
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
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/80 px-3.5 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur transition hover:border-primary/30 hover:text-foreground"
          >
            <ArrowLeft size={14} />
            {backLabel}
          </button>
          <BrandLogo variant="auth" tone="auto" />
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
