import { useAuthTheme } from "./AuthThemeContext";
import { authInputClass, authInputClassDark } from "./AuthShell";

export function useAuthSurfaceStyles() {
  const theme = useAuthTheme();
  const dark = theme === "dark";

  return {
    dark,
    input: dark ? authInputClassDark : authInputClass,
    title: dark ? "text-white" : "text-foreground",
    subtitle: dark ? "text-white/70" : "text-muted-foreground",
    muted: dark ? "text-white/60" : "text-muted-foreground",
    heading: dark ? "text-white font-semibold" : "font-semibold text-foreground",
    optionButton: (selected: boolean) =>
      dark
        ? selected
          ? "border-primary bg-primary/25 text-white"
          : "border-white/25 bg-white/10 text-white hover:border-white/40 hover:bg-white/15"
        : selected
          ? "border-neutral-900 bg-neutral-50 text-neutral-900 dark:border-primary dark:bg-primary/5"
          : "border-neutral-200 bg-white text-neutral-900 dark:border-border dark:bg-background",
    surface: dark
      ? "rounded-xl border border-white/15 bg-white/10"
      : "rounded-xl border border-neutral-200 bg-neutral-50 dark:border-border dark:bg-muted/20",
    surfaceTitle: dark ? "font-semibold text-white" : "font-semibold text-foreground",
    surfaceMuted: dark ? "text-white/65" : "text-muted-foreground",
    uploadZone: dark
      ? "border-white/25 bg-white/5 text-white hover:border-white/40 hover:bg-white/10"
      : "border-neutral-300 bg-neutral-50 text-foreground hover:border-neutral-400 hover:bg-white dark:border-border dark:bg-muted/20",
    fieldset: dark ? "border-white/15 bg-white/5" : "border-border bg-muted/10",
    legend: dark ? "text-white/55" : "text-muted-foreground",
    consentText: dark ? "text-white/90" : "",
    consentOptional: dark ? "text-white/55" : "text-muted-foreground",
    fieldControl: dark
      ? "w-full rounded-xl border border-white/25 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-primary/60 focus:bg-white/10 placeholder:text-white/40"
      : "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40",
    chipOff: dark
      ? "border-white/25 bg-white/10 text-white hover:border-white/40"
      : "border-border bg-card hover:border-primary/40",
    panel: dark ? "border-white/15 bg-white/5" : "border-border bg-muted/20",
  };
}
