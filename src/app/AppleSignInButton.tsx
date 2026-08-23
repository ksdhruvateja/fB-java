import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          state?: string;
          usePopup?: boolean;
        }) => void;
        signIn: () => Promise<AppleSignInResponse>;
      };
    };
  }
}

export type AppleSignInResponse = {
  authorization: {
    id_token: string;
    code: string;
    state?: string;
  };
  user?: {
    email: string;
    name?: {
      firstName?: string;
      lastName?: string;
    };
  };
};

const SCRIPT_SRC =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

let scriptPromise: Promise<void> | null = null;

function loadAppleScript(): Promise<void> {
  if (window.AppleID?.auth) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Apple script failed")));
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Apple script failed"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

type AppleSignInButtonProps = {
  disabled?: boolean;
  variant?: "homeowner" | "default";
  maxWidthClass?: string;
  onSuccess: (response: AppleSignInResponse) => void;
  onError: (message: string) => void;
};

export default function AppleSignInButton({
  disabled,
  variant = "default",
  maxWidthClass = "max-w-[340px]",
  onSuccess,
  onError,
}: AppleSignInButtonProps) {
  const [ready, setReady] = useState(false);
  const initRef = useRef(false);
  const clientId = import.meta.env.VITE_APPLE_CLIENT_ID;
  const redirectUri =
    import.meta.env.VITE_APPLE_REDIRECT_URI ||
    (typeof window !== "undefined" ? window.location.origin : "");

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;
    loadAppleScript()
      .then(() => {
        if (cancelled || initRef.current || !window.AppleID?.auth) return;
        window.AppleID.auth.init({
          clientId,
          scope: "name email",
          redirectURI: redirectUri,
          usePopup: true,
        });
        initRef.current = true;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) onError("Could not load Sign in with Apple.");
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, redirectUri, onError]);

  const handleClick = async () => {
    if (!ready || !window.AppleID?.auth) {
      onError("Sign in with Apple is not ready yet.");
      return;
    }

    try {
      const response = await window.AppleID.auth.signIn();
      onSuccess(response);
    } catch (err: unknown) {
      const appleErr = err as { error?: string };
      if (appleErr?.error === "popup_closed_by_user") return;
      onError("Apple sign-in failed. Please try again.");
    }
  };

  const buttonClass =
    variant === "homeowner"
      ? `flex h-11 w-full ${maxWidthClass} items-center justify-center gap-2 rounded-full border border-neutral-900 bg-neutral-900 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white`
      : `flex h-11 w-full ${maxWidthClass} items-center justify-center gap-2 rounded-full bg-black text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60`;

  return (
    <button type="button" onClick={handleClick} disabled={disabled || !ready} className={buttonClass}>
      <AppleLogo />
      Continue with Apple
    </button>
  );
}

function AppleLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
