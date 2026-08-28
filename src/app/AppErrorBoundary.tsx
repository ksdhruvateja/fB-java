import { Component, type ErrorInfo, type ReactNode } from "react";
import { logClientError } from "./clientErrorLog";

export type AppErrorBoundaryProps = {
  children: ReactNode;
  /** e.g. homeowner-dashboard, admin-jobs */
  section: string;
  onReset?: () => void;
  onGoHome?: () => void;
  homeLabel?: string;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

const isDev = import.meta.env.DEV;

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, State> {
  public override state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logClientError({
      section: this.props.section,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  private handleTryAgain = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public override render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">FixBridge</p>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">Something went wrong loading this section.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This part of the app hit an unexpected error. You can try again or return to a safe screen.
        </p>
        {isDev && this.state.error ? (
          <pre className="mt-4 max-h-48 w-full overflow-auto rounded-xl border border-red-200 bg-red-50 p-3 text-left text-[11px] text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
            {this.state.error.stack || this.state.error.message}
          </pre>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={this.handleTryAgain}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            Try Again
          </button>
          {this.props.onGoHome ? (
            <button
              type="button"
              onClick={this.props.onGoHome}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted/50"
            >
              {this.props.homeLabel || "Return to Dashboard"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted/50"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export function DashboardTabFallback({
  onGoHome,
  tab,
}: {
  onGoHome: () => void;
  tab?: string;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <h2 className="text-lg font-semibold">This section is unavailable</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {tab
          ? `We could not open “${tab}”. It may have moved or your saved navigation is out of date.`
          : "We could not open this section. Your saved navigation may be out of date."}
      </p>
      <button
        type="button"
        onClick={onGoHome}
        className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
      >
        Go to Overview
      </button>
    </div>
  );
}
