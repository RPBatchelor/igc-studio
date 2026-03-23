import { Component, useEffect, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PanelLayout } from "./components/layout/PanelLayout";
import { loadSettings, loadSecrets } from "./lib/settingsDb";
import { useFlightStore } from "./stores/flightStore";

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

function AppInner() {
  const { setCesiumIonToken, setBingMapsKey, setZoomAltitude, setTheme, setSpeedUnit, setAltUnit, theme } = useFlightStore();

  useEffect(() => {
    loadSettings().then((s) => {
      if (s.zoomAltitude) setZoomAltitude(s.zoomAltitude);
      if (s.theme)        setTheme(s.theme);
      if (s.speedUnit)    setSpeedUnit(s.speedUnit);
      if (s.altUnit)      setAltUnit(s.altUnit);
    });
    loadSecrets().then((s) => {
      if (s.cesiumIonToken) setCesiumIonToken(s.cesiumIonToken);
      if (s.bingMapsKey)    setBingMapsKey(s.bingMapsKey);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep data-theme attribute on <html> and native title bar in sync with store
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    getCurrentWindow().setTheme(theme).catch(() => {});
  }, [theme]);

  return <PanelLayout />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
