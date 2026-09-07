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
          prompt: (momentListener?: (notification: { isNotDisplayed?: () => boolean; isSkippedMoment?: () => boolean; isDismissedMoment?: () => boolean; getDismissedReason?: () => string; getNotDisplayedReason?: () => string }) => void) => void;
          cancel: () => void;
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
      existing.addEventListener("error", () => reject(new Error("Could not load Google Sign-In.")));
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
  onError,
  disabled,
  text = "continue_with",
}: {
  onCredential: (credential: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  text?: "signin_with" | "signup_with" | "continue_with";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Keep a stable ref so GIS always calls the latest handler without re-initializing
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onCredentialRef.current = onCredential;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let cancelled = false;
    let credentialSeen = false;
    let watchingPopup = false;
    const onWindowFocus = () => {
      if (!watchingPopup) return;
      window.setTimeout(() => {
        if (!credentialSeen && !cancelled) {
          watchingPopup = false;
          onErrorRef.current?.("Google sign-in was cancelled. You can try again.");
        }
      }, 1500);
    };
    window.addEventListener("focus", onWindowFocus);

    (async () => {
      try {
        const cfg = await getGoogleAuthConfig();
        if (cancelled) return;
        if (!cfg.ok || !cfg.googleOAuthEnabled || !cfg.configured || !cfg.clientId) {
          setConfigured(false);
          if (import.meta.env.DEV) {
            console.warn("[google-auth] OAuth disabled or client ID missing from /api/auth/google/config");
          }
          return;
        }
        setConfigured(true);
        setLoadError(null);
        await loadGoogleScript();
        if (cancelled || !containerRef.current) return;
        window.google!.accounts.id.initialize({
          client_id: cfg.clientId,
          // Popup mode stays on this origin. Production must send
          // Cross-Origin-Opener-Policy: same-origin-allow-popups or the
          // Google popup stays blank and this callback never runs.
          ux_mode: "popup",
          callback: (response: { credential?: string; error?: string; select_by?: string }) => {
            credentialSeen = true;
            watchingPopup = false;
            if (response?.credential) {
              onCredentialRef.current(response.credential);
              return;
            }
            const denied =
              response?.error === "popup_closed_by_user" ||
              response?.error === "access_denied" ||
              response?.error === "user_cancelled";
            const msg = denied
              ? "Google sign-in was cancelled. You can try again."
              : "We couldn't complete Google sign-in. Please try again.";
            onErrorRef.current?.(msg);
          },
          intermediate_iframe_close_callback: () => {
            window.setTimeout(() => {
              if (!credentialSeen) {
                watchingPopup = false;
                onErrorRef.current?.("Google sign-in was cancelled. You can try again.");
              }
            }, 400);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: false,
          itp_support: true,
        });
        containerRef.current.innerHTML = "";
        window.google!.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text,
          width: 320,
          locale: "en",
        });
        const armWatch = () => {
          credentialSeen = false;
          watchingPopup = true;
        };
        containerRef.current.addEventListener("click", armWatch);
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setConfigured(false);
          const message = err instanceof Error ? err.message : "Could not load Google Sign-In.";
          setLoadError(message);
          if (import.meta.env.DEV) {
            console.warn("[google-auth] button init failed:", message);
          }
          onErrorRef.current?.(message);
        }
      }
    })();
    return () => {
      cancelled = true;
      watchingPopup = false;
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [text]); // GIS re-initializes only when button text changes, not on every parent re-render

  if (configured === false && !loadError) return null;

  if (loadError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">
        Google sign-in is temporarily unavailable. Use email and password, or try again shortly.
      </div>
    );
  }

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
