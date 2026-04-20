import React from "react";

interface Props {
  children: React.ReactNode;
  /** Rendered when an error is caught. Defaults to null (silent). */
  fallback?: React.ReactNode;
  /** Optional label for console diagnostics. */
  label?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Tiny granular ErrorBoundary used to wrap volatile widgets (realtime
 * subscriptions, third-party popovers, etc.) so a thrown render error
 * doesn't bring down the entire page.
 *
 * Logs the error to the console for diagnosis but renders the optional
 * `fallback` (or nothing) in place of the broken subtree.
 */
export class SafeBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // eslint-disable-next-line no-console
    console.error(`[SafeBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info);
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
