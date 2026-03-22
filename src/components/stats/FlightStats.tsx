import {
  Clock,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  Gauge,
  Route,
} from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

export function FlightStatsPanel() {
  const { flightData } = useFlightStore();
  const stats = flightData?.stats;

  if (!stats) {
    return (
      <div
        style={{
          padding: 20,
          color: "var(--text-secondary)",
          textAlign: "center",
        }}
      >
        Open a flight log to see statistics
      </div>
    );
  }

  const items = [
    {
      icon: Clock,
      label: "Duration",
      value: formatDuration(stats.duration),
    },
    {
      icon: ArrowUp,
      label: "Max Altitude",
      value: `${Math.round(stats.maxAltitude)} m`,
    },
    {
      icon: ArrowDown,
      label: "Min Altitude",
      value: `${Math.round(stats.minAltitude)} m`,
    },
    {
      icon: TrendingUp,
      label: "Altitude Gain",
      value: `${Math.round(stats.altitudeGain)} m`,
    },
    {
      icon: Gauge,
      label: "Max Speed",
      value: `${Math.round(stats.maxSpeed)} km/h`,
    },
    {
      icon: Gauge,
      label: "Avg Speed",
      value: `${Math.round(stats.avgSpeed)} km/h`,
    },
    {
      icon: Route,
      label: "Distance",
      value: `${stats.totalDistance.toFixed(1)} km`,
    },
  ];

  return (
    <div style={{ padding: "8px 0" }}>
      <div
        style={{
          padding: "8px 12px",
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "1px",
          color: "var(--text-secondary)",
        }}
      >
        Flight Stats
      </div>
      <div style={{ display: "grid", gap: 2, padding: "0 8px" }}>
        {items.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              background: "var(--bg-tertiary)",
              borderRadius: 4,
            }}
          >
            <Icon size={14} color="var(--accent)" />
            <span style={{ color: "var(--text-secondary)", flex: 1 }}>
              {label}
            </span>
            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {flightData?.pilot && (
        <div
          style={{
            padding: "8px 16px",
            color: "var(--text-secondary)",
            fontSize: 12,
          }}
        >
          Pilot: {flightData.pilot}
          {flightData.glider && <> &middot; {flightData.glider}</>}
        </div>
      )}
    </div>
  );
}
