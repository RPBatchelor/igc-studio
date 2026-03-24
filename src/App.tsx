import { Component, useEffect, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PanelLayout } from "./components/layout/PanelLayout";
import { loadSettings, loadSecrets, saveSettings } from "./lib/settingsDb";
import { loadAirspaceCache, checkAirspaceVersion } from "./lib/airspaceApi";
import { loadSgZonesCache } from "./lib/sgZonesApi";
import { useFileSystem } from "./hooks/useFileSystem";
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
  const {
    setCesiumIonToken, setBingMapsKey, setZoomAltitude,
    setTheme, setSpeedUnit, setAltUnit,
    setAirspaceUrl, setAirspaceUpdateAvailable, setAirspaceValidDate,
    setAirspaces, setAirspacesFetchedAt,
    setSgZones, setSgZonesFetchedAt,
    setRememberLastFolder, setShowCameraOverlay,
    theme, rootFolder,
  } = useFlightStore();

  const { openFolderByPath } = useFileSystem();

  useEffect(() => {
    loadSettings().then((s) => {
      if (s.zoomAltitude)        setZoomAltitude(s.zoomAltitude);
      if (s.theme)               setTheme(s.theme);
      if (s.speedUnit)           setSpeedUnit(s.speedUnit);
      if (s.altUnit)             setAltUnit(s.altUnit);
      if (s.airspaceUrl)         setAirspaceUrl(s.airspaceUrl);
      setRememberLastFolder(s.rememberLastFolder ?? true);
      setShowCameraOverlay(s.showCameraOverlay ?? false);

      // Restore last folder if enabled
      if (s.rememberLastFolder && s.lastFolderPath) {
        openFolderByPath(s.lastFolderPath).catch(() => {
          // Folder no longer accessible — silently ignore
        });
      }
    });
    loadSecrets().then((s) => {
      if (s.cesiumIonToken) setCesiumIonToken(s.cesiumIonToken);
      if (s.bingMapsKey)    setBingMapsKey(s.bingMapsKey);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist last-opened folder whenever rootFolder changes
  useEffect(() => {
    if (!rootFolder) return;
    const s = useFlightStore.getState();
    if (!s.rememberLastFolder) return;
    saveSettings({
      theme:              s.theme,
      zoomAltitude:       s.zoomAltitude,
      speedUnit:          s.speedUnit,
      altUnit:            s.altUnit,
      airspaceUrl:        s.airspaceUrl,
      rememberLastFolder: s.rememberLastFolder,
      showCameraOverlay:  s.showCameraOverlay,
      lastFolderPath:     rootFolder,
    });
  }, [rootFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load airspace from cache on startup, then silently check for updates
  useEffect(() => {
    loadAirspaceCache().then((cached) => {
      if (cached) {
        setAirspaces(cached.features);
        setAirspacesFetchedAt(cached.fetchedAt);
        setAirspaceValidDate(cached.validDate ?? null);
      }
      // Background version check (non-blocking)
      checkAirspaceVersion(cached?.validDate ?? null).then((newDate) => {
        if (newDate) setAirspaceUpdateAvailable(newDate);
      }).catch(() => {});
    });
    // Load Site Guide zones from cache on startup
    loadSgZonesCache().then((cached) => {
      if (cached) {
        setSgZones(cached.zones);
        setSgZonesFetchedAt(cached.fetchedAt);
      }
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
