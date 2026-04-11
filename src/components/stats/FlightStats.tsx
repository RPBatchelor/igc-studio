import {
  Clock,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  TrendingDown,
  Gauge,
  Route,
  MapPin,
} from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import { fmtSpeed, fmtAlt, fmtDist } from "../../lib/units";
import { COMPARE_HEX_COLORS } from "../../lib/compareColors";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

export function FlightStatsPanel() {
  const { flightData, comparedFlights, selectedFile, sites, speedUnit, altUnit, altitudeOffset } = useFlightStore();
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
    { icon: Clock,        label: "Duration",     value: formatDuration(stats.duration) },
    { icon: Route,        label: "Distance",     value: fmtDist(stats.totalDistance, altUnit) },
    { icon: ArrowUp,      label: "Max Altitude", value: fmtAlt(stats.maxAltitude + altitudeOffset, altUnit) },
    { icon: ArrowDown,    label: "Min Altitude", value: fmtAlt(stats.minAltitude + altitudeOffset, altUnit) },
    { icon: TrendingUp,   label: "Altitude Gain",value: fmtAlt(stats.altitudeGain, altUnit) },
    { icon: TrendingUp,   label: "Max Climb",    value: `+${stats.maxClimb.toFixed(1)} m/s` },
    { icon: TrendingDown, label: "Max Sink",     value: `${stats.maxSink.toFixed(1)} m/s` },
    { icon: Gauge,        label: "Max Speed",    value: fmtSpeed(stats.maxSpeed, speedUnit) },
    { icon: Gauge,        label: "Avg Speed",    value: fmtSpeed(stats.avgSpeed, speedUnit) },
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

      {altitudeOffset !== 0 && (
        <div style={{
          padding: "4px 16px 0",
          fontSize: 11,
          color: "var(--text-secondary)",
          fontStyle: "italic",
        }}>
          Altitudes corrected by {altitudeOffset > 0 ? "+" : ""}{altitudeOffset} m
        </div>
      )}

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

      {flightData?.hasSyntheticTimestamps && (
        <div style={{
          margin: "0 12px 10px",
          padding: "6px 10px",
          background: "rgba(255,180,0,0.1)",
          border: "1px solid rgba(255,180,0,0.35)",
          borderRadius: 4,
          fontSize: 11,
          color: "var(--text-secondary)",
          lineHeight: 1.4,
        }}>
          No GPS timestamps — speed, vario and trim use estimated 1 s intervals.
        </div>
      )}

      {comparedFlights.length > 0 && (
        <div style={{ padding: "0 8px 8px" }}>
          <div style={{ padding: "8px 4px 6px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-secondary)" }}>
            Comparison
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "3px 6px", color: "var(--text-muted)", fontWeight: 500 }}>Metric</th>
                  {comparedFlights.map((cf, ci) => (
                    <th key={ci} style={{ textAlign: "right", padding: "3px 6px", fontWeight: 600, color: COMPARE_HEX_COLORS[ci] }}>
                      {cf.filename.replace(/\.[^.]+$/, "").slice(0, 12)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ["Duration",     (s: typeof stats) => s ? formatDuration(s.duration) : "—"],
                  ["Distance",     (s: typeof stats) => s ? fmtDist(s.totalDistance, altUnit) : "—"],
                  ["Max Alt",      (s: typeof stats) => s ? fmtAlt(s.maxAltitude, altUnit) : "—"],
                  ["Alt Gain",     (s: typeof stats) => s ? fmtAlt(s.altitudeGain, altUnit) : "—"],
                  ["Max Climb",    (s: typeof stats) => s ? `+${s.maxClimb.toFixed(1)} m/s` : "—"],
                  ["Max Sink",     (s: typeof stats) => s ? `${s.maxSink.toFixed(1)} m/s` : "—"],
                  ["Max Speed",    (s: typeof stats) => s ? fmtSpeed(s.maxSpeed, speedUnit) : "—"],
                ] as [string, (s: typeof stats) => string][]).map(([label, fmt]) => (
                  <tr key={label} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "3px 6px", color: "var(--text-muted)" }}>{label}</td>
                    {comparedFlights.map((cf, ci) => (
                      <td key={ci} style={{ textAlign: "right", padding: "3px 6px", fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>
                        {fmt(cf.stats)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
