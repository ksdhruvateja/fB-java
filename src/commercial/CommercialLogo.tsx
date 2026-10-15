import { brand } from "../config/brand";
import { cx } from "./ui";

/** FixBridge mark with a "Commercial" wordmark, so the commercial product reads as its own space. */
export function CommercialLogo({ small, inverted }: { small?: boolean; inverted?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
      <img src={brand.logoMarkUrl} alt="" className={small ? "h-6 w-6" : "h-8 w-8"} />
      <span className={cx("leading-none", inverted ? "text-white" : "text-slate-900 dark:text-white")}>
        <span className={cx("block font-bold tracking-tight", small ? "text-sm" : "text-base")}>{brand.productName}</span>
        <span className={cx("block font-semibold uppercase tracking-[0.18em] text-primary", small ? "text-[9px]" : "text-[10px]")}>Commercial</span>
      </span>
    </span>
  );
}
