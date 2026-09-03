import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getGoogleAuthConfig } from "./marketingApi";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, config: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGoogleScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google Sign-In."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export default function GoogleSignInButton({
  onCredential,
  disabled,
  text = "continue_with",
}: {
  onCredential: (credential: string) => void;
  disabled?: boolean;
  text?: "signin_with" | "signup_with" | "continue_with";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await getGoogleAuthConfig();
      if (cancelled) return;
      if (!cfg.ok || !cfg.googleOAuthEnabled || !cfg.configured || !cfg.clientId) {
        setConfigured(false);
        return;
      }
      setConfigured(true);
      try {
        await loadGoogleScript();
        if (cancelled || !containerRef.current) return;
        window.google!.accounts.id.initialize({
          client_id: cfg.clientId,
          callback: (response: { credential?: string }) => {
            if (response?.credential) onCredential(response.credential);
          },
          auto_select: false,
        });
        containerRef.current.innerHTML = "";
        window.google!.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text,
          width: 320,
        });
        setReady(true);
      } catch {
        setConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onCredential, text]);

  if (configured === false) return null;

  return (
    <div className={`w-full ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      {!ready && (
        <div className="flex h-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-sm text-neutral-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading Google…
        </div>
      )}
      <div ref={containerRef} className={`flex justify-center ${ready ? "" : "hidden"}`} />
    </div>
  );
}
