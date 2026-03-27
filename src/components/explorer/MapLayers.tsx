import { useEffect, useRef } from "react";
import { Lock, RefreshCw, AlertCircle } from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import type { BaseLayerId, OverlayId } from "../../parsers/types";
import { loadAirspaces, saveAirspaceCache } from "../../lib/airspaceApi";
import { parseOpenAir, parseValidityDate } from "../../lib/airspaceParser";
import { loadSgZones } from "../../lib/sgZonesApi";
import { saveSettings } from "../../lib/settingsDb";

interface LayerOption {
  id: BaseLayerId;
  label: string;
  requiresBing?: true;
}

const LAYER_GROUPS: { label: string; layers: LayerOption[] }[] = [
  {
    label: "Satellite",
    layers: [
      { id: "esriSatellite", label: "ESRI Satellite" },
      { id: "bingAerial",    label: "Bing Aerial", requiresBing: true },
    ],
  },
  {
    label: "Topographic",
    layers: [
      { id: "esriTopo",   label: "ESRI Topo Map" },
      { id: "esriNatGeo", label: "National Geographic" },
      { id: "openTopo",   label: "OpenTopoMap" },
    ],
  },
  {
    label: "Street",
    layers: [
      { id: "osm",       label: "OpenStreetMap" },
      { id: "bingRoads", label: "Bing Roads", requiresBing: true },
    ],
  },
  {
    label: "Minimal / Canvas",
    layers: [
      { id: "esriLightGrey", label: "ESRI Light Grey" },
      { id: "esriDarkGrey",  label: "ESRI Dark Grey" },
      { id: "cartoLight",    label: "Carto Light" },
      { id: "cartoDark",     label: "Carto Dark" },
    ],
  },
];

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.8px",
  color: "var(--text-muted)",
  marginBottom: 6,
  marginTop: 14,
};

const divider: React.CSSProperties = {
  borderTop: "1px solid var(--border)",
  margin: "14px 0 0",
};

function formatAgo(ms: number | null): string {
  if (!ms) return "never";
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60)  return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function MapLayers() {
  const {
    baseLayer, setBaseLayer,
    overlays, toggleOverlay,
    terrainEnabled, setTerrainEnabled,
    cesiumIonToken, bingMapsKey,
    airspaces, airspacesLoading, airspacesError, airspacesFetchedAt,
    airspaceValidDate, airspaceUpdateAvailable, airspaceUrl,
    setAirspaces, setAirspacesLoading, setAirspacesError,
    setAirspacesFetchedAt, setAirspaceValidDate, setAirspaceUpdateAvailable,
    sgZones, sgZonesLoading, sgZonesError, sgZonesFetchedAt,
    setSgZones, setSgZonesLoading, setSgZonesError, setSgZonesFetchedAt,
    showShadowCurtain, setShowShadowCurtain,
  } = useFlightStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleAndSave = (id: OverlayId) => {
    toggleOverlay(id);
    // Compute next state and persist immediately
    const next = new Set(overlays);
    next.has(id) ? next.delete(id) : next.add(id);
    const s = useFlightStore.getState();
    saveSettings({
      theme: s.theme, zoomAltitude: s.zoomAltitude,
      speedUnit: s.speedUnit, altUnit: s.altUnit,
      airspaceUrl: s.airspaceUrl, rememberLastFolder: s.rememberLastFolder,
      showCameraOverlay: s.showCameraOverlay, lastFolderPath: s.rootFolder ?? "",
      activeOverlays: Array.from(next),
    });
  };

  // Auto-load when airspace overlay is enabled for the first time
  useEffect(() => {
    if (overlays.has("airspace") && airspaces.length === 0 && !airspacesLoading) {
      triggerLoad(false);
    }
  }, [overlays]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load when sgZones overlay is enabled for the first time
  useEffect(() => {
    if (overlays.has("sgZones") && sgZones.length === 0 && !sgZonesLoading) {
      triggerSgLoad(false);
    }
  }, [overlays]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerLoad = async (force: boolean) => {
    setAirspacesLoading(true);
    setAirspacesError(null);
    const result = await loadAirspaces(airspaceUrl, force);
    setAirspaces(result.features);
    setAirspacesFetchedAt(result.fetchedAt);
    setAirspaceValidDate(result.validDate ?? null);
    setAirspacesLoading(false);
    if (result.error) setAirspacesError(result.error);
    if (force) setAirspaceUpdateAvailable(null);
  };

  const triggerSgLoad = async (force: boolean) => {
    setSgZonesLoading(true);
    setSgZonesError(null);
    const result = await loadSgZones(force);
    setSgZones(result.zones);
    setSgZonesFetchedAt(result.fetchedAt);
    setSgZonesLoading(false);
    if (result.error) setSgZonesError(result.error);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const features  = parseOpenAir(text);
      const validDate = parseValidityDate(text);
      const fetchedAt = Date.now();
      setAirspaces(features);
      setAirspacesFetchedAt(fetchedAt);
      setAirspaceValidDate(validDate);
      setAirspaceUpdateAvailable(null);
      void saveAirspaceCache({ features, fetchedAt, validDate });
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-imported
    e.target.value = "";
  };

  const sgZonesStatus = sgZonesLoading
    ? "Loading…"
    : sgZonesError && sgZones.length === 0
      ? `Error: ${sgZonesError}`
      : sgZones.length > 0
        ? `${sgZones.length} zones · ${formatAgo(sgZonesFetchedAt)}`
        : "Not loaded";

  const airspaceStatus = airspacesLoading
    ? "Loading…"
    : airspacesError && airspaces.length === 0
      ? `Error: ${airspacesError}`
      : airspaces.length > 0
        ? `${airspaces.length} zones · ${formatAgo(airspacesFetchedAt)}`
        : "Not loaded";

  return (
    <div style={{ padding: "8px 16px 16px", fontSize: 13, color: "var(--text-primary)" }}>

      {/* Base layers — grouped radio buttons */}
      {LAYER_GROUPS.map((group) => (
        <div key={group.label}>
          <div style={sectionLabel}>{group.label}</div>
          {group.layers.map(({ id, label, requiresBing }) => {
            const locked = requiresBing && !bingMapsKey;
            return (
              <label
                key={id}
                title={locked ? "Add a Bing Maps API key in Settings to enable" : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "3px 0", cursor: locked ? "not-allowed" : "pointer",
                  opacity: locked ? 0.45 : 1,
                }}
              >
                <input
                  type="radio"
                  name="baseLayer"
                  value={id}
                  checked={baseLayer === id}
                  disabled={!!locked}
                  onChange={() => setBaseLayer(id)}
                  style={{ accentColor: "#0078d4" }}
                />
                {label}
                {locked && <Lock size={11} color="var(--text-muted)" style={{ marginLeft: "auto" }} />}
              </label>
            );
          })}
        </div>
      ))}

      <div style={divider} />

      {/* Overlays */}
      <div style={sectionLabel}>Overlays</div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={overlays.has("esriRoads")}
          onChange={() => toggleAndSave("esriRoads")}
          style={{ accentColor: "#0078d4" }}
        />
        Roads
      </label>

      <div style={divider} />

      {/* 3D Terrain */}
      <div style={sectionLabel}>3D Terrain</div>
      <label
        title={!cesiumIonToken ? "Add a Cesium Ion token in Settings to enable" : undefined}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "3px 0",
          cursor: cesiumIonToken ? "pointer" : "not-allowed",
          opacity: cesiumIonToken ? 1 : 0.45,
        }}
      >
        <input
          type="checkbox"
          checked={terrainEnabled}
          disabled={!cesiumIonToken}
          onChange={() => setTerrainEnabled(!terrainEnabled)}
          style={{ accentColor: "#0078d4" }}
        />
        Enable 3D Terrain
        {!cesiumIonToken && <Lock size={11} color="var(--text-muted)" style={{ marginLeft: "auto" }} />}
      </label>

      <div style={divider} />

      {/* Airspace */}
      <div style={sectionLabel}>Airspace</div>

      {/* Update available banner */}
      {airspaceUpdateAvailable && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "var(--bg-tertiary)", border: "1px solid var(--accent)",
          borderRadius: 4, padding: "5px 8px", marginBottom: 6, fontSize: 11,
          color: "var(--accent)", cursor: "pointer",
        }}
          onClick={() => void triggerLoad(true)}
        >
          <AlertCircle size={12} />
          New data available · click to update
        </div>
      )}

      {/* Toggle + Refresh row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
          <input
            type="checkbox"
            checked={overlays.has("airspace")}
            onChange={() => toggleAndSave("airspace")}
            style={{ accentColor: "#0078d4" }}
          />
          Show Airspace
        </label>
        <button
          title="Download latest airspace data"
          disabled={airspacesLoading}
          onClick={() => void triggerLoad(true)}
          style={{
            background: "none", border: "1px solid var(--border)", borderRadius: 4,
            cursor: airspacesLoading ? "not-allowed" : "pointer",
            color: "var(--text-secondary)", padding: "2px 5px", display: "flex", alignItems: "center",
            opacity: airspacesLoading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={12} style={airspacesLoading ? { animation: "spin 1s linear infinite" } : undefined} />
        </button>
      </div>

      {/* Status */}
      <div style={{ fontSize: 11, color: airspacesError && airspaces.length === 0 ? "var(--color-error, #f87171)" : "var(--text-muted)", marginBottom: 4 }}>
        {airspaceStatus}
        {airspaceValidDate && !airspacesLoading && (
          <span style={{ opacity: 0.7 }}> · valid {airspaceValidDate}</span>
        )}
      </div>

      {/* Import file */}
      <label style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 11, color: "var(--text-secondary)", cursor: "pointer",
        padding: "3px 6px", border: "1px solid var(--border)", borderRadius: 4,
        marginTop: 2,
      }}>
        Import .txt file
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          style={{ display: "none" }}
          onChange={handleImport}
        />
      </label>

      <div style={divider} />

      {/* Site Guide Zones */}
      <div style={sectionLabel}>Site Guide Zones</div>

      {/* Toggle + Refresh row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
          <input
            type="checkbox"
            checked={overlays.has("sgZones")}
            onChange={() => toggleAndSave("sgZones")}
            style={{ accentColor: "#0078d4" }}
          />
          Landing &amp; No-Landing Zones
        </label>
        <button
          title="Download latest Site Guide zones"
          disabled={sgZonesLoading}
          onClick={() => void triggerSgLoad(true)}
          style={{
            background: "none", border: "1px solid var(--border)", borderRadius: 4,
            cursor: sgZonesLoading ? "not-allowed" : "pointer",
            color: "var(--text-secondary)", padding: "2px 5px", display: "flex", alignItems: "center",
            opacity: sgZonesLoading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={12} style={sgZonesLoading ? { animation: "spin 1s linear infinite" } : undefined} />
        </button>
      </div>

      {/* Status */}
      <div style={{ fontSize: 11, color: sgZonesError && sgZones.length === 0 ? "var(--color-error, #f87171)" : "var(--text-muted)", marginBottom: 4 }}>
        {sgZonesStatus}
      </div>

      {sgZonesError && sgZones.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--color-warning, #fbbf24)", marginBottom: 4 }}>
          <AlertCircle size={11} />
          Showing cached data
        </div>
      )}

      <div style={divider} />

      {/* Playback */}
      <div style={sectionLabel}>Playback</div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={showShadowCurtain}
          onChange={() => setShowShadowCurtain(!showShadowCurtain)}
          style={{ accentColor: "#0078d4" }}
        />
        <span>Shadow Curtain</span>
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
          color: "#f59e0b", border: "1px solid #f59e0b33", borderRadius: 3,
          padding: "1px 4px", marginLeft: 2,
        }}>
          Beta
        </span>
      </label>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>
        Renders a fading vertical wall below the flight path during playback. May stutter on some flights.
      </div>

    </div>
  );
}
