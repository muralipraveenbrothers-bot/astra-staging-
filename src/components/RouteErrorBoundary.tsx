import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

const UPDATED_DEP = /Failed to fetch dynamically imported module|Outdated Optimize Dep|Loading chunk/;

type Props = {
  children: ReactNode;
  /** Changing this (the route path) clears a previous failure. */
  resetKey?: string;
};

type State = {
  error: Error | null;
  nonce: number;
};

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null, nonce: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route failed to render", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private retry = () => {
    this.setState((s) => ({ error: null, nonce: s.nonce + 1 }));
  };

  render() {
    const { error, nonce } = this.state;
    if (!error) {
      return <Fragment key={nonce}>{this.props.children}</Fragment>;
    }

    const message = error.message || String(error);
    const updated = UPDATED_DEP.test(message);

    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="glass p-8 text-center max-w-md space-y-3">
          <p className="text-sm font-semibold text-white">This dashboard failed to load</p>
          <p className="text-xs text-slate-300 break-words">{message}</p>
          {updated && (
            <p className="text-xs text-amber-300">Astra was updated. Reload to continue</p>
          )}
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={this.retry}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded-lg border border-white/20 text-white text-xs font-semibold"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
