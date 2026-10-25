import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class OrthoPlannerErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[OrthoPlannerErrorBoundary]", error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex h-full flex-col items-center justify-center bg-slate-950 p-6 text-center">
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-6 py-4">
              <div className="mb-2 text-sm font-bold text-rose-300">
                OrthoPlanner Unavailable
              </div>
              <div className="text-xs text-rose-200/80">
                The planning workspace encountered an error. Please refresh or contact support.
              </div>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
