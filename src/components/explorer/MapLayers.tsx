import { Lock } from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import type { BaseLayerId } from "../../parsers/types";

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

export function MapLayers() {
  const {
    baseLayer, setBaseLayer,
    overlays, toggleOverlay,
    terrainEnabled, setTerrainEnabled,
    cesiumIonToken, bingMapsKey,
  } = useFlightStore();

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
          onChange={() => toggleOverlay("esriRoads")}
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

    </div>
  );
}
