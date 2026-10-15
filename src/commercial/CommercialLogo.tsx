import { BrandLogo } from "../app/BrandLogo";
import { cx } from "./ui";

/** FixBridge lockup with a quiet "Commercial" label beside it. */
export function CommercialLogo({ small, inverted }: { small?: boolean; inverted?: boolean }) {
  const size = small ? "!w-[7.5rem]" : "!w-[8.75rem]";
  return (
    <span className="inline-flex shrink-0 items-center gap-2.5">
      {inverted ? (
        <BrandLogo variant="nav" tone="color" className={size} />
      ) : (
        <>
          {/* The color lockup has white lettering, so light mode uses the dark-lettered version. */}
          <BrandLogo variant="nav" tone="onLight" className={cx(size, "dark:hidden")} />
          <BrandLogo variant="nav" tone="color" className={cx(size, "hidden dark:block")} />
        </>
      )}
      <span className={cx("whitespace-nowrap border-l pl-2.5 text-[13px] font-medium", small && "hidden sm:inline", inverted ? "border-white/25 text-white/80" : "border-border text-muted-foreground")}>Commercial</span>
    </span>
  );
}
