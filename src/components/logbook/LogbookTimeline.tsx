import { useRef, useState, useEffect } from "react";
import { Map as MapIcon, Lock } from "lucide-react";
import type { LogbookEntry } from "../../parsers/types";
import { useFlightStore } from "../../stores/flightStore";

// ── palette ────────────────────────────────────────────────────────────────

const PALETTE = [
  "#4fc3f7", "#81c784", "#ce93d8", "#ffb74d",
  "#f48fb1", "#80cbc4", "#ffcc80", "#a5d6a7",
];

function siteColor(siteId: string): string {
  let h = 0;
  for (let i = 0; i < siteId.length; i++) h = (h * 31 + siteId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ── helpers ────────────────────────────────────────────────────────────────

function fmtAirtime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// ── layout constants ────────────────────────────────────────────────────────

const CHART_H      = 200;
const AXIS_H       = 28;
const STEM_AREA    = CHART_H - AXIS_H;
const CIRCLE_R     = 5;
const MIN_STEM     = CIRCLE_R * 2 + 4;
const MAX_STEM     = STEM_AREA - CIRCLE_R - 4;
const CLUSTER_GAP  = 10; // px between lollipops in the same date cluster

// ── types ────────────────────────────────────────────────────────────────────

interface Marker {
  entry: LogbookEntry;
  cx: number;     // absolute pixel x
  stemPx: number;
  color: string;
}

// ── month ticks ────────────────────────────────────────────────────────────

function monthTicks(minMs: number, maxMs: number, spanMs: number): { label: string; x: number }[] {
  const ticks: { label: string; x: number }[] = [];
  const cur = new Date(minMs);
  cur.setUTCDate(1);
  cur.setUTCHours(0, 0, 0, 0);
  if (cur.getTime() < minMs) cur.setUTCMonth(cur.getUTCMonth() + 1);

  const spanDays = spanMs / 86_400_000;
  const skipN = spanDays < 365 ? 1 : spanDays < 730 ? 2 : spanDays < 1460 ? 3 : 6;

  let idx = 0;
  while (cur.getTime() <= maxMs) {
    if (idx % skipN === 0) {
      ticks.push({
        label: cur.toLocaleDateString(undefined, {
          month: "short",
          ...(skipN >= 6 ? { year: "2-digit" } : {}),
        }),
        x: (cur.getTime() - minMs) / spanMs,
      });
    }
    cur.setUTCMonth(cur.getUTCMonth() + 1);
    idx++;
  }
  return ticks;
}

// ── component ──────────────────────────────────────────────────────────────

interface Props {
  entries: LogbookEntry[];
  onGoToFlight: (entry: LogbookEntry) => void;
}

export function LogbookTimeline({ entries, onGoToFlight }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth]         = useState(600);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const setSelectedLogbookEntry = useFlightStore((s) => s.setSelectedLogbookEntry);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Filter + date calculations
  const dated = entries.filter((e) => e.date);
  if (dated.length === 0) return null;

  const dateMsArr = dated.map((e) => new Date(e.date).getTime());
  const minMs  = Math.min(...dateMsArr);
  const maxMs  = Math.max(...dateMsArr);
  const spanMs = maxMs - minMs || 1;

  const maxDuration = Math.max(...dated.map((e) => e.duration), 1);

  const PAD_L   = 8;
  const PAD_R   = 8;
  const usableW = width - PAD_L - PAD_R;

  // ── Horizontal layout with same-day clustering ─────────────────────────
  // Group indices by ISO date string, then spread each cluster evenly
  const byDate = new Map<string, number[]>();
  dated.forEach((e, i) => {
    const k = e.date;
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k)!.push(i);
  });

  const cxArr: number[] = new Array(dated.length);
  byDate.forEach((idxs) => {
    const basePx = PAD_L + ((dateMsArr[idxs[0]] - minMs) / spanMs) * usableW;
    const n = idxs.length;
    // centre the cluster: offset = (slot - (n-1)/2) * CLUSTER_GAP
    idxs.forEach((idx, slot) => {
      cxArr[idx] = basePx + (slot - (n - 1) / 2) * CLUSTER_GAP;
    });
  });

  const markers: Marker[] = dated.map((entry, i) => ({
    entry,
    cx: cxArr[i],
    stemPx: MIN_STEM + (entry.duration / maxDuration) * (MAX_STEM - MIN_STEM),
    color: siteColor(entry.siteId),
  }));

  const ticks = monthTicks(minMs, maxMs, spanMs);
  const fx = (frac: number) => PAD_L + frac * usableW;

  // What to show in the detail panel: selected takes priority over hovered
  const activeIdx = selectedIdx ?? hoveredIdx;
  const am = activeIdx !== null ? markers[activeIdx] : null;

  const handleMarkerClick = (i: number) => {
    // Toggle selection: click same → deselect, click different → select
    setSelectedIdx((prev) => {
      const next = prev === i ? null : i;
      setSelectedLogbookEntry(next !== null ? markers[next].entry : null);
      return next;
    });
  };

  const handleMarkerEnter = (i: number) => {
    setHoveredIdx(i);
  };

  const handleMarkerLeave = () => {
    setHoveredIdx(null);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <svg width={width} height={CHART_H} style={{ display: "block" }}>
        {/* Baseline */}
        <line
          x1={PAD_L} y1={CHART_H - AXIS_H}
          x2={width - PAD_R} y2={CHART_H - AXIS_H}
          stroke="var(--border)" strokeWidth={1}
        />

        {/* Month ticks + labels */}
        {ticks.map(({ label, x }) => {
          const px = fx(x);
          return (
            <g key={label + x}>
              <line x1={px} y1={CHART_H - AXIS_H} x2={px} y2={CHART_H - AXIS_H + 4} stroke="var(--border)" strokeWidth={1} />
              <text x={px} y={CHART_H - 4} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{label}</text>
            </g>
          );
        })}

        {/* Lollipop markers — render selected/hovered on top */}
        {[...markers.keys()]
          .sort((a, b) => {
            // Draw selected last (on top), then hovered, then others
            const rank = (i: number) => i === selectedIdx ? 2 : i === hoveredIdx ? 1 : 0;
            return rank(a) - rank(b);
          })
          .map((i) => {
            const m = markers[i];
            const baseY  = CHART_H - AXIS_H;
            const circleY = baseY - m.stemPx;
            const isHovered  = hoveredIdx === i;
            const isSelected = selectedIdx === i;
            const isActive   = isHovered || isSelected;

            return (
              <g
                key={`${m.entry.path}-${i}`}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => handleMarkerEnter(i)}
                onMouseLeave={handleMarkerLeave}
                onClick={() => handleMarkerClick(i)}
              >
                {/* Tall hit target covering full stem */}
                <rect
                  x={m.cx - 6} y={circleY - CIRCLE_R}
                  width={12} height={m.stemPx + CIRCLE_R * 2}
                  fill="transparent"
                />
                {/* Stem */}
                <line
                  x1={m.cx} y1={baseY}
                  x2={m.cx} y2={circleY}
                  stroke={m.color}
                  strokeWidth={isActive ? 2 : 1.5}
                  strokeOpacity={isActive ? 1 : 0.6}
                />
                {/* Circle */}
                <circle
                  cx={m.cx} cy={circleY}
                  r={isActive ? CIRCLE_R + 2 : CIRCLE_R}
                  fill={m.color}
                  fillOpacity={isActive ? 1 : 0.8}
                />
                {/* Selection ring */}
                {isSelected && (
                  <circle cx={m.cx} cy={circleY} r={CIRCLE_R + 5}
                    fill="none" stroke={m.color} strokeWidth={1.5} strokeOpacity={0.5} strokeDasharray="3 2"
                  />
                )}
                {/* Hover ring */}
                {isHovered && !isSelected && (
                  <circle cx={m.cx} cy={circleY} r={CIRCLE_R + 4}
                    fill="none" stroke={m.color} strokeWidth={1} strokeOpacity={0.35}
                  />
                )}
              </g>
            );
          })}
      </svg>

      {/* Detail panel — fixed below chart, never overlaps */}
      <div style={{
        borderTop: "1px solid var(--border)",
        marginTop: 4,
        minHeight: 52,
        display: "flex",
        alignItems: "center",
      }}>
        {am ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "8px 4px" }}>
            {/* Colour swatch + lock indicator */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <div style={{ width: 3, height: 32, background: am.color, borderRadius: 2 }} />
              {selectedIdx !== null && (
                <Lock size={9} color="var(--text-muted)" />
              )}
            </div>

            {/* Site + date */}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-bright)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {am.entry.siteName || "Unknown site"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>
                {fmtDate(am.entry.date)}
                {selectedIdx !== null && (
                  <span style={{ marginLeft: 6, color: "var(--text-muted)", fontSize: 10 }}>
                    (click marker again to unlock)
                  </span>
                )}
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
              <span>⏱ {fmtAirtime(am.entry.duration)}</span>
              <span>↗ {am.entry.distance.toFixed(1)} km</span>
              <span>↕ {Math.round(am.entry.maxAltitude)} m</span>
              <span>▲ +{am.entry.maxClimb.toFixed(1)} m/s</span>
            </div>

            {/* Action */}
            <button
              onClick={() => { setSelectedIdx(null); setHoveredIdx(null); onGoToFlight(am.entry); }}
              style={{
                display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                background: "var(--accent)", border: "none",
                color: "#fff", borderRadius: 5, padding: "5px 12px",
                cursor: "pointer", fontSize: 11, fontWeight: 600,
              }}
            >
              <MapIcon size={12} /> View on map
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "0 4px" }}>
            Hover a marker · Click to lock selection
          </div>
        )}
      </div>
    </div>
  );
}
