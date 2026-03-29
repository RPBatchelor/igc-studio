import { useState, useRef, useEffect } from "react";
import { FolderOpen, MapPin, BookOpen, Layers, Settings, Minus, Square, X, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { loadFlightData } from "../../lib/flightLoader";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { GlobalSearch } from "../search/GlobalSearch";
import { useFlightStore } from "../../stores/flightStore";
import { FileExplorer } from "../explorer/FileExplorer";
import { MapLayers } from "../explorer/MapLayers";
import { LocationsPanel } from "../explorer/LocationsPanel";
import { FlightMap } from "../map/FlightMap";
import { FlightStatsPanel } from "../stats/FlightStats";
import { FlightCharts } from "../stats/FlightCharts";
import { FlightNotes } from "../stats/FlightNotes";
import { FlightAltitudeCorrection } from "../stats/FlightAltitudeCorrection";
import { FlightTrim } from "../stats/FlightTrim";
import { SiteInfoPanel } from "../sites/SiteInfoPanel";
import { SiteInfoEditor } from "../sites/SiteInfoEditor";
import { SiteFiltersPanel } from "../sites/SiteFiltersPanel";
import { LogbookStatsPanel } from "../logbook/LogbookStatsPanel";
import { TimelineScrubber } from "../timeline/TimelineScrubber";
import { LogbookView } from "../logbook/LogbookView";
import { LogbookPanel } from "../logbook/LogbookPanel";
import { SettingsView } from "../settings/SettingsView";

type View = "explorer" | "locations" | "sites" | "logbook" | "layers" | "settings";

const VIEWS: { id: View; icon: typeof FolderOpen; title: string }[] = [
  { id: "explorer",  icon: FolderOpen, title: "Explorer" },
  { id: "locations", icon: MapPin,     title: "Locations" },
  { id: "sites",     icon: Info,       title: "Sites" },
  { id: "logbook",   icon: BookOpen,   title: "Logbook" },
  { id: "layers",    icon: Layers,     title: "Map Layers" },
  { id: "settings",  icon: Settings,   title: "Settings" },
];


function useDragResize(initial: number, min: number, max: number, direction: "right" | "left") {
  const [size, setSize] = useState(initial);
  const startX = useRef(0);
  const startSize = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    startSize.current = size;

    const onMove = (ev: MouseEvent) => {
      const delta = direction === "right"
        ? ev.clientX - startX.current
        : startX.current - ev.clientX;
      setSize(Math.max(min, Math.min(max, startSize.current + delta)));
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return { size, onMouseDown };
}

// ── navigation entry type ──────────────────────────────────────────────────
interface NavEntry {
  view: "explorer" | "locations" | "sites" | "logbook" | "layers" | "settings" | null;
  selectedFile: string | null;
}

export function PanelLayout() {
  const { activeView, setActiveView, selectedFile, setSelectedFile, setFlightData, rootFolder } = useFlightStore();
  const left = useDragResize(240, 150, 500, "right");
  const right = useDragResize(300, 200, 550, "left");

  const toggleView = (id: View) =>
    setActiveView(activeView === id ? null : id);

  // ── Navigation history ───────────────────────────────────────────────────
  const histRef    = useRef<NavEntry[]>([]);
  const histIdxRef = useRef(-1);
  const skipRef    = useRef<string | null>(null); // fingerprint to skip during back/forward
  const [canBack,    setCanBack]    = useState(false);
  const [canForward, setCanForward] = useState(false);

  const navFp = (v: NavEntry["view"], f: string | null) => `${v ?? ""}::${f ?? ""}`;

  // Watch for navigation events and push to history
  useEffect(() => {
    const fp = navFp(activeView, selectedFile);
    if (skipRef.current === fp) {
      skipRef.current = null;
      return;
    }
    // Truncate forward history, skip duplicate at head
    const truncated = histRef.current.slice(0, histIdxRef.current + 1);
    const last = truncated[truncated.length - 1];
    if (last && navFp(last.view, last.selectedFile) === fp) return;
    truncated.push({ view: activeView, selectedFile });
    histRef.current = truncated;
    histIdxRef.current = truncated.length - 1;
    setCanBack(histIdxRef.current > 0);
    setCanForward(false);
  }, [activeView, selectedFile]);

  // Clear history when root folder changes
  useEffect(() => {
    histRef.current = [];
    histIdxRef.current = -1;
    setCanBack(false);
    setCanForward(false);
  }, [rootFolder]);

  const applyNavEntry = async (target: NavEntry) => {
    skipRef.current = navFp(target.view, target.selectedFile);
    setActiveView(target.view);
    if (target.selectedFile !== selectedFile) {
      if (target.selectedFile) {
        const filename = target.selectedFile.replace(/\\/g, "/").split("/").pop() ?? "";
        setSelectedFile(target.selectedFile);
        await loadFlightData(target.selectedFile, filename, setFlightData);
      } else {
        setSelectedFile(null);
        setFlightData(null);
      }
    }
  };

  const handleNavBack = async () => {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current--;
    const target = histRef.current[histIdxRef.current];
    setCanBack(histIdxRef.current > 0);
    setCanForward(true);
    await applyNavEntry(target);
  };

  const handleNavForward = async () => {
    if (histIdxRef.current >= histRef.current.length - 1) return;
    histIdxRef.current++;
    const target = histRef.current[histIdxRef.current];
    setCanBack(true);
    setCanForward(histIdxRef.current < histRef.current.length - 1);
    await applyNavEntry(target);
  };

  const handleStyle: React.CSSProperties = {
    width: 4,
    flexShrink: 0,
    cursor: "col-resize",
    background: "transparent",
    transition: "background 0.15s",
    zIndex: 10,
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-primary)", color: "var(--text-primary)" }}>

      {/* Custom title bar */}
      <div
        onMouseDown={(e) => {
          // Drag the window unless the click was on a button or input
          if (!(e.target as HTMLElement).closest("button, input, [role='button']")) {
            void getCurrentWindow().startDragging();
          }
        }}
        style={{
          height: 38,
          flexShrink: 0,
          background: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          position: "relative",
          zIndex: 100,
          userSelect: "none",
        }}
      >
        {/* App name + back/forward — left */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, paddingLeft: 10 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", paddingRight: 6, pointerEvents: "none" }}>
            IGC Studio
          </span>
          {([
            { title: "Back",    icon: ChevronLeft,  enabled: canBack,    action: handleNavBack },
            { title: "Forward", icon: ChevronRight, enabled: canForward, action: handleNavForward },
          ] as const).map(({ title, icon: Icon, enabled, action }) => (
            <button
              key={title}
              title={title}
              onClick={() => void action()}
              disabled={!enabled}
              style={{
                width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "transparent", border: "none",
                color: enabled ? "var(--text-secondary)" : "var(--text-muted)",
                cursor: enabled ? "pointer" : "default",
                opacity: enabled ? 1 : 0.35,
                borderRadius: 4,
                transition: "background 0.1s, opacity 0.1s",
              }}
              onMouseEnter={(e) => { if (enabled) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-tertiary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>

        {/* Search — centred, NOT a drag region so clicks work */}
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          <GlobalSearch />
        </div>

        {/* Window controls — right */}
        <div style={{ marginLeft: "auto", display: "flex" }}>
          {[
            { title: "Minimise",         icon: Minus,  action: () => getCurrentWindow().minimize(),       hoverBg: "var(--bg-tertiary)" },
            { title: "Maximise/Restore", icon: Square, action: () => getCurrentWindow().toggleMaximize(), hoverBg: "var(--bg-tertiary)" },
            { title: "Close",            icon: X,      action: () => getCurrentWindow().close(),          hoverBg: "#c42b1c" },
          ].map(({ title, icon: Icon, action, hoverBg }) => (
            <button
              key={title}
              title={title}
              onClick={action}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = hoverBg; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              style={{
                width: 46, height: 38,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "transparent", border: "none",
                color: "var(--text-muted)", cursor: "pointer",
                transition: "background 0.1s, color 0.1s",
              }}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* Activity bar */}
        <div style={{ width: 48, flexShrink: 0, background: "var(--bg-sidebar)", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
          {VIEWS.map(({ id, icon: Icon, title }) => (
            <button
              key={id}
              title={title}
              onClick={() => toggleView(id)}
              style={{
                width: 48,
                height: 48,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: activeView === id ? "var(--text-bright)" : "var(--text-muted)",
                borderLeft: activeView === id ? `2px solid var(--text-bright)` : "2px solid transparent",
              }}
            >
              <Icon size={22} />
            </button>
          ))}
        </div>

        {/* Left side panel + resize handle — hidden for settings */}
        {activeView && activeView !== "settings" && (
          <>
            <div style={{ width: left.size, flexShrink: 0, background: "var(--bg-secondary)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {activeView !== "sites" && (
                <div style={{ padding: "8px 12px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-primary)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                  {VIEWS.find((v) => v.id === activeView)?.title}
                </div>
              )}
              <div style={{ flex: 1, overflow: "auto" }}>
                {activeView === "explorer"  && <FileExplorer />}
                {activeView === "locations" && <LocationsPanel />}
                {activeView === "sites"     && <SiteInfoPanel />}
                {activeView === "logbook"   && <LogbookPanel />}
                {activeView === "layers"    && <MapLayers />}
              </div>
            </div>
            <div
              style={handleStyle}
              onMouseDown={left.onMouseDown}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--accent)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
            />
          </>
        )}

        {/* Centre panel — settings, logbook, site editor, or map */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {activeView === "settings" ? (
            <SettingsView />
          ) : activeView === "logbook" ? (
            <LogbookView />
          ) : activeView === "sites" ? (
            <>
              {/* Keep FlightMap mounted but hidden so Cesium state is preserved */}
              <div style={{ position: "absolute", inset: 0, display: "none" }}>
                <FlightMap />
              </div>
              <SiteInfoEditor />
            </>
          ) : (
            <FlightMap />
          )}
        </div>

        {/* Right resize handle + panel */}
        <div
          style={handleStyle}
          onMouseDown={right.onMouseDown}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
        />
        <div style={{ width: right.size, flexShrink: 0, overflow: "auto", background: "var(--bg-secondary)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
          {activeView === "sites" ? (
            <SiteFiltersPanel />
          ) : activeView === "logbook" ? (
            <LogbookStatsPanel />
          ) : (
            <>
              <FlightStatsPanel />
              <FlightCharts />
              <FlightNotes />
              <FlightAltitudeCorrection />
              <FlightTrim />
            </>
          )}
        </div>

      </div>

      <TimelineScrubber />
    </div>
  );
}
