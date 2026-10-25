import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AnatomyErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[AnatomyErrorBoundary]", error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex h-full flex-col items-center justify-center bg-slate-950 p-6 text-center">
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-6 py-4">
              <div className="mb-2 text-sm font-bold text-amber-300">
                Detailed 3D Viewer Unavailable
              </div>
              <div className="text-xs text-amber-200/80">
                Lightweight anatomy is active. The detailed anatomy engine could not load.
              </div>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
