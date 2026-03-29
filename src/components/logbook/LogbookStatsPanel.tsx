import { Clock, Route, ArrowUp, TrendingUp, TrendingDown, MapPin } from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import { fmtAlt, fmtDist } from "../../lib/units";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

export function LogbookStatsPanel() {
  const { selectedLogbookEntry, altUnit } = useFlightStore();

  if (!selectedLogbookEntry) {
    return (
      <div style={{ padding: 24, color: "var(--text-secondary)", textAlign: "center", fontSize: 13, lineHeight: 1.6 }}>
        Click a flight in the timeline to see its stats
      </div>
    );
  }

  const e = selectedLogbookEntry;

  const items = [
    { icon: Clock,        label: "Duration",     value: formatDuration(e.duration) },
    { icon: Route,        label: "Distance",     value: fmtDist(e.distance, altUnit) },
    { icon: ArrowUp,      label: "Max Altitude", value: fmtAlt(e.maxAltitude, altUnit) },
    { icon: TrendingUp,   label: "Max Climb",    value: `+${e.maxClimb.toFixed(1)} m/s` },
    { icon: TrendingDown, label: "Max Sink",     value: `${e.maxSink.toFixed(1)} m/s` },
  ];

  return (
    <div style={{ padding: "8px 0" }}>
      {/* Site + date header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "10px 12px 8px",
        borderBottom: "1px solid var(--border)",
        marginBottom: 4,
      }}>
        <MapPin size={14} color="#f48fb1" style={{ flexShrink: 0 }} />
        <div style={{ overflow: "hidden" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-bright)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {e.siteName}
          </div>
          {e.date && (
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>
              {new Date(e.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "4px 8px 0", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-secondary)", margin: "4px 4px 2px" }}>
        Flight Stats
      </div>

      <div style={{ display: "grid", gap: 2, padding: "0 8px" }}>
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 8px",
            background: "var(--bg-tertiary)",
            borderRadius: 4,
          }}>
            <Icon size={14} color="var(--accent)" />
            <span style={{ color: "var(--text-secondary)", flex: 1 }}>{label}</span>
            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
