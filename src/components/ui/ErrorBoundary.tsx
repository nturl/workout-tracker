"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <ErrorFallback error={this.state.error} onRetry={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ error, onRetry }: { error?: Error; onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg-primary)" }}>
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">😵</div>
        <h2 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>Something went wrong</h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          {error?.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={onRetry}
          className="px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
          style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
