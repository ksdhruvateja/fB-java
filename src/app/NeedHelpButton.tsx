import { useState } from "react";
import { Headset, Loader2 } from "lucide-react";
import { openHelpChat } from "./LeadConnectorChatWidget";
import { brand } from "../config/brand";

/**
 * FixBridge's own "Need help?" control. The support chat stays hidden until the homeowner
 * asks for it here, then it opens directly. If the chat cannot load, the support email is shown.
 */
export default function NeedHelpButton({
  variant = "link",
  label = "Need help?",
  className = "",
}: {
  variant?: "link" | "icon" | "pill" | "button";
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await openHelpChat();
    setBusy(false);
    if (!ok) setFailed(true);
  };

  const icon = busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Headset className="h-4 w-4" aria-hidden />;
  const styles: Record<typeof variant, string> = {
    link: "inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors",
    icon: "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors",
    pill: "inline-flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur hover:border-primary/50 transition-colors",
    button: "inline-flex items-center justify-center gap-2 border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:border-primary hover:text-primary transition-colors",
  };

  return (
    <span className="relative inline-flex flex-col">
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        aria-label={variant === "icon" ? `${label} Chat with ${brand.productName} support` : undefined}
        title={variant === "icon" ? label : undefined}
        className={`${styles[variant]} disabled:opacity-70 ${className}`}
      >
        {icon}
        {variant === "icon" ? null : <span>{busy ? "Opening chat…" : label}</span>}
      </button>
      {failed ? (
        <span role="status" className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
          Chat is unavailable right now. Email{" "}
          <a className="font-medium text-primary underline" href={`mailto:${brand.supportEmail}`}>
            {brand.supportEmail}
          </a>
          .
        </span>
      ) : null}
    </span>
  );
}
