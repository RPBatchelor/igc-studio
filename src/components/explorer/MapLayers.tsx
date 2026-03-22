import { Map, Mountain, Layers } from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import type { MapLayerId } from "../../parsers/types";

const LAYERS: { id: MapLayerId; label: string; icon: typeof Map }[] = [
  { id: "osm", label: "OpenStreetMap", icon: Map },
  { id: "bingAerial", label: "Bing Aerial", icon: Layers },
  { id: "bingRoad", label: "Bing Roads", icon: Map },
  { id: "esriSatellite", label: "ESRI Satellite", icon: Layers },
  { id: "terrain", label: "3D Terrain", icon: Mountain },
];

export function MapLayers() {
  const { activeLayers, toggleLayer } = useFlightStore();

  return (
    <div style={{ background: "var(--bg-secondary)", padding: "0 4px" }}>
      {LAYERS.map(({ id, label, icon: Icon }) => (
        <label
          key={id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 12px",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          <input
            type="checkbox"
            checked={activeLayers.has(id)}
            onChange={() => toggleLayer(id)}
            style={{ accentColor: "var(--accent)" }}
          />
          <Icon size={14} />
          {label}
        </label>
      ))}
    </div>
  );
}
