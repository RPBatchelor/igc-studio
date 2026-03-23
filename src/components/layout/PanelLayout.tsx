import { useState, useRef, useEffect } from "react";
import { saveSettings, saveSecrets } from "../../lib/settingsDb";
import type { SpeedUnit, AltUnit } from "../../parsers/types";
import { FolderOpen, MapPin, Layers, Settings, Sun, Moon } from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import { FileExplorer } from "../explorer/FileExplorer";
import { MapLayers } from "../explorer/MapLayers";
import { LocationsPanel } from "../explorer/LocationsPanel";
import { FlightMap } from "../map/FlightMap";
import { FlightStatsPanel } from "../stats/FlightStats";
import { FlightCharts } from "../stats/FlightCharts";
import { TimelineScrubber } from "../timeline/TimelineScrubber";

type View = "explorer" | "locations" | "layers" | "settings";

const VIEWS: { id: View; icon: typeof FolderOpen; title: string }[] = [
  { id: "explorer",  icon: FolderOpen, title: "Explorer" },
  { id: "locations", icon: MapPin,     title: "Locations" },
  { id: "layers",    icon: Layers,     title: "Map Layers" },
  { id: "settings",  icon: Settings,   title: "Settings" },
];

const keyInputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  color: "var(--text-bright)",
  padding: "4px 8px",
  borderRadius: 4,
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

function SettingsPanel() {
  const {
    zoomAltitude, setZoomAltitude,
    cesiumIonToken, setCesiumIonToken,
    bingMapsKey, setBingMapsKey,
    theme, setTheme,
    speedUnit, setSpeedUnit,
    altUnit, setAltUnit,
  } = useFlightStore();

  const [ionDraft,  setIonDraft]  = useState(cesiumIonToken);
  const [bingDraft, setBingDraft] = useState(bingMapsKey);

  // Sync drafts when secrets load from disk after mount
  useEffect(() => { setIonDraft(cesiumIonToken); },  [cesiumIonToken]);
  useEffect(() => { setBingDraft(bingMapsKey); }, [bingMapsKey]);

  const persistSecrets = (patch: { cesiumIonToken?: string; bingMapsKey?: string }) => {
    const s = useFlightStore.getState();
    saveSecrets({
      cesiumIonToken: patch.cesiumIonToken ?? s.cesiumIonToken,
      bingMapsKey:    patch.bingMapsKey    ?? s.bingMapsKey,
    });
  };

  const persistSettings = (patch: Partial<{ theme: "dark" | "light"; zoomAltitude: number; speedUnit: SpeedUnit; altUnit: AltUnit }>) => {
    const s = useFlightStore.getState();
    saveSettings({
      theme:        patch.theme        ?? s.theme,
      zoomAltitude: patch.zoomAltitude ?? s.zoomAltitude,
      speedUnit:    patch.speedUnit    ?? s.speedUnit,
      altUnit:      patch.altUnit      ?? s.altUnit,
    });
  };

  const changeTheme = (t: "dark" | "light") => {
    setTheme(t);
    persistSettings({ theme: t });
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, textTransform: "uppercase",
    letterSpacing: "0.8px", color: "var(--text-muted)", marginBottom: 12,
  };

  return (
    <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-primary)" }}>

      {/* Appearance */}
      <div style={{ marginBottom: 20 }}>
        <div style={sectionLabel}>Appearance</div>
        <div style={{ display: "flex", gap: 6 }}>
          {([["dark", "Dark", Moon], ["light", "Light", Sun]] as const).map(([t, label, Icon]) => (
            <button
              key={t}
              onClick={() => changeTheme(t)}
              style={{
                flex: 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "6px 0",
                borderRadius: 4,
                border: `1px solid ${theme === t ? "var(--accent)" : "var(--border)"}`,
                background: theme === t ? "var(--accent)" : "var(--bg-tertiary)",
                color: theme === t ? "#fff" : "var(--text-secondary)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div style={{ marginBottom: 20 }}>
        <div style={sectionLabel}>Map</div>
        <label style={{ display: "block", marginBottom: 6, color: "var(--text-primary)" }}>
          Default zoom altitude
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="range" min={500} max={50000} step={500}
            value={zoomAltitude}
            onChange={(e) => {
              const alt = Number(e.target.value);
              setZoomAltitude(alt);
              persistSettings({ zoomAltitude: alt });
            }}
            style={{ flex: 1, accentColor: "#0078d4" }}
          />
          <span style={{ minWidth: 70, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-bright)" }}>
            {zoomAltitude >= 1000 ? `${(zoomAltitude / 1000).toFixed(1)} km` : `${zoomAltitude} m`}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          Camera altitude when a flight is opened
        </div>
      </div>

      {/* Units */}
      <div style={{ marginBottom: 20 }}>
        <div style={sectionLabel}>Units</div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 6, color: "var(--text-primary)" }}>Speed</div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["km/h", "m/s", "kts"] as SpeedUnit[]).map((u) => (
              <button
                key={u}
                onClick={() => { setSpeedUnit(u); persistSettings({ speedUnit: u }); }}
                style={{
                  flex: 1, padding: "5px 0", borderRadius: 4, fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                  border: `1px solid ${speedUnit === u ? "var(--accent)" : "var(--border)"}`,
                  background: speedUnit === u ? "var(--accent)" : "var(--bg-tertiary)",
                  color: speedUnit === u ? "#fff" : "var(--text-secondary)",
                }}
              >{u}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 6, color: "var(--text-primary)" }}>Altitude &amp; Distance</div>
          <div style={{ display: "flex", gap: 6 }}>
            {([["metric", "Metric (m / km)"], ["imperial", "Imperial (ft / mi)"]] as [AltUnit, string][]).map(([u, label]) => (
              <button
                key={u}
                onClick={() => { setAltUnit(u); persistSettings({ altUnit: u }); }}
                style={{
                  flex: 1, padding: "5px 0", borderRadius: 4, fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                  border: `1px solid ${altUnit === u ? "var(--accent)" : "var(--border)"}`,
                  background: altUnit === u ? "var(--accent)" : "var(--bg-tertiary)",
                  color: altUnit === u ? "#fff" : "var(--text-secondary)",
                }}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div style={sectionLabel}>API Keys</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
        Keys are stored in a local <code>.secrets</code> file and never committed to git.
      </div>

      {/* Cesium Ion */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", marginBottom: 4, color: "var(--text-primary)" }}>
          Cesium Ion Token
        </label>
        <input
          type="password"
          value={ionDraft}
          onChange={(e) => setIonDraft(e.target.value)}
          onBlur={() => {
            const token = ionDraft.trim();
            setCesiumIonToken(token);
            persistSecrets({ cesiumIonToken: token });
          }}
          placeholder="Enables 3D terrain"
          style={keyInputStyle}
        />
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
          Free at <a href="https://cesium.com/ion/signup" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>cesium.com/ion</a>
        </div>
      </div>

      {/* Bing Maps */}
      <div>
        <label style={{ display: "block", marginBottom: 4, color: "var(--text-primary)" }}>
          Bing Maps API Key
        </label>
        <input
          type="password"
          value={bingDraft}
          onChange={(e) => setBingDraft(e.target.value)}
          onBlur={() => {
            const key = bingDraft.trim();
            setBingMapsKey(key);
            persistSecrets({ bingMapsKey: key });
          }}
          placeholder="Enables Bing Aerial & Roads"
          style={keyInputStyle}
        />
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
          Free at <a href="https://www.bingmapsportal.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>bingmapsportal.com</a>
        </div>
      </div>

    </div>
  );
}

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

export function PanelLayout() {
  const [activeView, setActiveView] = useState<View | null>("explorer");
  const left = useDragResize(240, 150, 500, "right");
  const right = useDragResize(300, 200, 550, "left");

  const toggleView = (id: View) =>
    setActiveView((prev) => (prev === id ? null : id));

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

        {/* Left side panel + resize handle */}
        {activeView && (
          <>
            <div style={{ width: left.size, flexShrink: 0, background: "var(--bg-secondary)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-primary)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                {VIEWS.find((v) => v.id === activeView)?.title}
              </div>
              <div style={{ flex: 1, overflow: "auto" }}>
                {activeView === "explorer"  && <FileExplorer />}
                {activeView === "locations" && <LocationsPanel />}
                {activeView === "layers"    && <MapLayers />}
                {activeView === "settings"  && <SettingsPanel />}
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

        {/* Map */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <FlightMap />
        </div>

        {/* Right resize handle + panel */}
        <div
          style={handleStyle}
          onMouseDown={right.onMouseDown}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
        />
        <div style={{ width: right.size, flexShrink: 0, overflow: "auto", background: "var(--bg-secondary)", borderLeft: "1px solid var(--border)" }}>
          <FlightStatsPanel />
          <FlightCharts />
        </div>

      </div>

      <TimelineScrubber />
    </div>
  );
}
