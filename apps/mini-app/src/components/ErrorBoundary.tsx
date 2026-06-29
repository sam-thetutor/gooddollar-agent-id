import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Renders runtime errors on-screen instead of a blank page. Important inside
 * MiniPay's in-app webview where there's no easy console access.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("App crashed:", error, info);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="app">
          <header>
            <p className="eyebrow">G$ Copilot</p>
            <h1>Something went wrong</h1>
          </header>
          <section className="card">
            <p className="error">{this.state.error.message}</p>
            <button
              type="button"
              className="btn"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
