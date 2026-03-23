import {
  Clock,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  Gauge,
  Route,
  MapPin,
} from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import { fmtSpeed, fmtAlt, fmtDist } from "../../lib/units";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

export function FlightStatsPanel() {
  const { flightData, selectedFile, sites, speedUnit, altUnit } = useFlightStore();
  const stats = flightData?.stats;

  const siteName = selectedFile
    ? sites.find((s) => s.flights.some((f) => f.path === selectedFile))?.name ?? null
    : null;

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
    { icon: Clock,     label: "Duration",     value: formatDuration(stats.duration) },
    { icon: ArrowUp,   label: "Max Altitude", value: fmtAlt(stats.maxAltitude, altUnit) },
    { icon: ArrowDown, label: "Min Altitude", value: fmtAlt(stats.minAltitude, altUnit) },
    { icon: TrendingUp,label: "Altitude Gain",value: fmtAlt(stats.altitudeGain, altUnit) },
    { icon: Gauge,     label: "Max Speed",    value: fmtSpeed(stats.maxSpeed, speedUnit) },
    { icon: Gauge,     label: "Avg Speed",    value: fmtSpeed(stats.avgSpeed, speedUnit) },
    { icon: Route,     label: "Distance",     value: fmtDist(stats.totalDistance, altUnit) },
  ];

  return (
    <div style={{ padding: "8px 0" }}>
      {siteName && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "10px 12px 8px",
          borderBottom: "1px solid var(--border)",
          marginBottom: 4,
        }}>
          <MapPin size={14} color="#f48fb1" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-bright)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {siteName}
          </span>
        </div>
      )}
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
