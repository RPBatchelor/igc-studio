import { Component, useEffect, useRef, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PanelLayout } from "./components/layout/PanelLayout";
import { loadSettings, loadSecrets, saveSettings } from "./lib/settingsDb";
import { loadAirspaceCache, checkAirspaceVersion } from "./lib/airspaceApi";
import { loadSgZonesCache } from "./lib/sgZonesApi";
import { loadFlightNotesDb, saveFlightNotesDb } from "./lib/flightNotesDb";
import { loadSiteDb, saveSiteDb } from "./lib/siteDb";
import { buildBundle, applyBundle, serializeBundle, parseBundle } from "./lib/portableSettings";
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
    setRememberLastFolder, setShowCameraOverlay, setShowFullFilename, setShowBakFiles, setGroupSitesByType,
    setShowShadowCurtain, setSmoothFlightPath, setSyncFilePath,
    toggleOverlay, setFlightNotesDb,
    theme, rootFolder, syncFilePath, flightNotesDb, siteDb,
  } = useFlightStore();

  const writeBundleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { openFolderByPath } = useFileSystem();

  useEffect(() => {
    (async () => {
      const s = await loadSettings();

      // Apply local settings first
      if (s.zoomAltitude)        setZoomAltitude(s.zoomAltitude);
      if (s.theme)               setTheme(s.theme);
      if (s.speedUnit)           setSpeedUnit(s.speedUnit);
      if (s.altUnit)             setAltUnit(s.altUnit);
      if (s.airspaceUrl)         setAirspaceUrl(s.airspaceUrl);
      setRememberLastFolder(s.rememberLastFolder ?? true);
      setShowCameraOverlay(s.showCameraOverlay ?? false);
      setShowFullFilename(s.showFullFilename ?? false);
      setShowBakFiles(s.showBakFiles ?? false);
      setGroupSitesByType(s.groupSitesByType ?? false);
      setShowShadowCurtain(s.showShadowCurtain ?? false);
      setSmoothFlightPath(s.smoothFlightPath ?? false);
      if (s.syncFilePath)        setSyncFilePath(s.syncFilePath);
      for (const id of (s.activeOverlays ?? [])) toggleOverlay(id as import("./parsers/types").OverlayId);

      // If a sync file is configured, read the bundle and merge over local settings
      if (s.syncFilePath) {
        try {
          const text = await invoke<string>("read_file_text", { path: s.syncFilePath });
          const bundle = parseBundle(text);
          if (bundle) {
            const localNotes = await loadFlightNotesDb();
            const localSiteDb = await loadSiteDb();
            const result = applyBundle(bundle, s.lastFolderPath || null, localNotes, localSiteDb);

            // Apply bundled settings (override local)
            const bs = result.settings;
            if (bs.theme)               setTheme(bs.theme);
            if (bs.speedUnit)           setSpeedUnit(bs.speedUnit);
            if (bs.altUnit)             setAltUnit(bs.altUnit);
            if (bs.zoomAltitude)        setZoomAltitude(bs.zoomAltitude);
            setShowCameraOverlay(bs.showCameraOverlay ?? s.showCameraOverlay);
            setRememberLastFolder(bs.rememberLastFolder ?? s.rememberLastFolder);
            setShowFullFilename(bs.showFullFilename ?? s.showFullFilename);
            setShowBakFiles(bs.showBakFiles ?? s.showBakFiles);
            setGroupSitesByType(bs.groupSitesByType ?? s.groupSitesByType);
            setShowShadowCurtain(bs.showShadowCurtain ?? s.showShadowCurtain);
            setSmoothFlightPath(bs.smoothFlightPath ?? s.smoothFlightPath);

            // Persist merged notes and site renames
            await saveFlightNotesDb(result.notesDb);
            setFlightNotesDb(result.notesDb);
            await saveSiteDb(result.siteDb);
          }
        } catch {
          // Sync file unreadable (missing or corrupt) — continue with local settings
        }
      }

      // Restore last folder if enabled (after bundle applied so we have the merged notes)
      if (s.rememberLastFolder && s.lastFolderPath) {
        openFolderByPath(s.lastFolderPath).catch(() => {});
      }

      const sec = await loadSecrets();
      if (sec.cesiumIonToken) setCesiumIonToken(sec.cesiumIonToken);
      if (sec.bingMapsKey)    setBingMapsKey(sec.bingMapsKey);
    })();
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
      showFullFilename:   s.showFullFilename,
      showBakFiles:       s.showBakFiles,
      groupSitesByType:   s.groupSitesByType,
      showShadowCurtain:  s.showShadowCurtain,
      smoothFlightPath:   s.smoothFlightPath,
      syncFilePath:       s.syncFilePath,
      activeOverlays:     Array.from(s.overlays),
      lastFolderPath:     rootFolder,
    });
  }, [rootFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced write-back to sync file whenever syncable state changes
  useEffect(() => {
    if (!syncFilePath) return;
    if (writeBundleTimer.current) clearTimeout(writeBundleTimer.current);
    writeBundleTimer.current = setTimeout(async () => {
      try {
        const s = useFlightStore.getState();
        const currentSiteDb = await loadSiteDb();
        const bundle = buildBundle(s.rootFolder, {
          theme: s.theme, zoomAltitude: s.zoomAltitude, speedUnit: s.speedUnit, altUnit: s.altUnit,
          airspaceUrl: s.airspaceUrl, rememberLastFolder: s.rememberLastFolder, lastFolderPath: s.rootFolder ?? "",
          showCameraOverlay: s.showCameraOverlay, showFullFilename: s.showFullFilename,
          showBakFiles: s.showBakFiles, groupSitesByType: s.groupSitesByType,
          showShadowCurtain: s.showShadowCurtain, smoothFlightPath: s.smoothFlightPath,
          syncFilePath: s.syncFilePath, activeOverlays: Array.from(s.overlays),
        }, s.flightNotesDb, currentSiteDb, __APP_VERSION__);
        await invoke("write_file_text", { path: syncFilePath, content: serializeBundle(bundle) });
      } catch {
        // Write failed (e.g. file on disconnected drive) — silently skip
      }
    }, 800);
  }, [syncFilePath, flightNotesDb, siteDb]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Load flight notes DB
    loadFlightNotesDb().then(setFlightNotesDb);
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
