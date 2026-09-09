import { Loader2 } from "lucide-react";

/**
 * Full-screen auth progress overlay — never leave users on a blank white page
 * while Google credential exchange / session setup is in progress.
 */
export default function AuthSigningOverlay({
  open,
  title = "Signing you in securely…",
  subtitle = "Please wait while FixBridge verifies your Google account.",
  error,
  onTryAgain,
  onReturnToSignIn,
}: {
  open: boolean;
  title?: string;
  subtitle?: string;
  error?: string | null;
  onTryAgain?: () => void;
  onReturnToSignIn?: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-white/95 px-6 backdrop-blur-sm dark:bg-neutral-950/95"
      role="alertdialog"
      aria-live="assertive"
      aria-busy={!error}
      aria-label={error ? "Sign-in error" : title}
    >
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
          FixBridge
        </p>
        {error ? (
          <>
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              We couldn&apos;t finish signing you in
            </h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{error}</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              {onTryAgain ? (
                <button
                  type="button"
                  onClick={onTryAgain}
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Try Again
                </button>
              ) : null}
              {onReturnToSignIn ? (
                <button
                  type="button"
                  onClick={onReturnToSignIn}
                  className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  Return to Sign In
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
            </div>
            <h2 className="mt-4 text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              {title}
            </h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>
          </>
        )}
      </div>
    </div>
  );
}
