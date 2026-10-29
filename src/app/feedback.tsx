/**
 * In-app replacements for window.alert / window.confirm.
 * Native browser pop-ups block the page and look broken on mobile; these use the app's own
 * toast and dialog components. <FeedbackHost /> is mounted once in main.tsx.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/ui/alert-dialog";

/** Problem the user needs to fix or know about (replaces alert() for errors). */
export function notifyError(message: string) {
  toast.error(message || "Something went wrong. Please try again.");
}

/** Neutral or success message. */
export function notify(message: string) {
  toast(message);
}

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};
type PendingConfirm = ConfirmOptions & { resolve: (ok: boolean) => void };

let showConfirm: ((req: PendingConfirm) => void) | null = null;

/** Promise-based confirm dialog (replaces window.confirm). Resolves true when confirmed. */
export function askConfirm(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === "string" ? { message: options } : options;
  return new Promise((resolve) => {
    // Host not mounted (should not happen): fall back to the native dialog rather than proceed silently.
    if (!showConfirm) {
      resolve(window.confirm(opts.message));
      return;
    }
    showConfirm({ ...opts, resolve });
  });
}

export function FeedbackHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    showConfirm = (req) =>
      setPending((current) => {
        current?.resolve(false); // a newer request replaces an unanswered one
        return req;
      });
    return () => {
      showConfirm = null;
    };
  }, []);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <>
      <Toaster position="top-center" richColors closeButton />
      <AlertDialog open={pending != null} onOpenChange={(open) => !open && close(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title || "Are you sure?"}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>{pending?.cancelLabel || "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => close(true)}
              className={pending?.destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            >
              {pending?.confirmLabel || "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
