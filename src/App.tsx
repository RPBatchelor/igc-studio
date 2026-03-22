import { Component, type ReactNode } from "react";
import { PanelLayout } from "./components/layout/PanelLayout";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 32,
            fontFamily: "monospace",
            background: "#1e1e1e",
            color: "#f44",
            height: "100vh",
          }}
        >
          <h2 style={{ marginBottom: 16 }}>Render Error</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>
            {(this.state.error as Error).message}
            {"\n\n"}
            {(this.state.error as Error).stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <PanelLayout />
    </ErrorBoundary>
  );
}
