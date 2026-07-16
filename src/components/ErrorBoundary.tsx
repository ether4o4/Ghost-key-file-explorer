import React from 'react';

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors anywhere in the tree so a single bad component
 * shows a recovery screen instead of a blank white crash (especially important
 * inside the Android WebView, where there's no console to fall back on).
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Best-effort log; the device has no dev console but remote debugging will see it.
    console.error('Ghost Key crashed:', error, info);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-ghost-bg text-ghost-text p-6 text-center">
        <div className="text-4xl">👻</div>
        <div className="text-lg font-semibold">Something went wrong</div>
        <div className="text-[12px] text-ghost-muted max-w-sm break-words font-mono">{error.message}</div>
        <div className="flex gap-2 mt-1">
          <button
            onClick={this.reset}
            className="px-4 py-2 rounded-lg bg-ghost-accent/20 border border-ghost-accent/40 text-sm text-ghost-text"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg border border-ghost-border text-sm text-ghost-muted"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
