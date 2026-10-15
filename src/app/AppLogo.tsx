import { BrandLogo, type BrandLogoVariant } from "./BrandLogo";

type Props = {
  onHome: () => void;
  variant?: BrandLogoVariant;
  className?: string;
  /** @deprecated Color logo ignores tone. */
  tone?: "white" | "black" | "auto";
};

/** Clickable FixBridge logo — navigates to the signed-in role home. */
export default function AppLogo({ onHome, variant = "auth", className = "" }: Props) {
  return (
    <button
      type="button"
      onClick={onHome}
      className={`inline-flex min-w-0 items-center rounded-md text-left outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/40 ${className}`}
      aria-label="Go to dashboard"
    >
      {/* The color lockup has white lettering, so light mode uses the dark-lettered version. */}
      <BrandLogo variant={variant} tone="onLight" className="pointer-events-none dark:hidden" />
      <BrandLogo variant={variant} tone="color" className="pointer-events-none hidden dark:block" />
    </button>
  );
}
