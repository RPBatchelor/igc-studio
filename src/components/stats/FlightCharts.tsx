import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useFlightStore } from "../../stores/flightStore";
import { convertSpeed, convertAlt, speedUnitLabel, altUnitLabel } from "../../lib/units";
import { computeVario } from "../../lib/stats";
import { COMPARE_HEX_COLORS } from "../../lib/compareColors";

function formatElapsed(timestamp: number, startTime: number): string {
  const elapsed = (timestamp - startTime) / 1000;
  const m = Math.floor(elapsed / 60);
  const s = Math.floor(elapsed % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function FlightCharts() {
  const { flightData, comparedFlights, playbackTime, setPlaybackTime, setIsPlaying, speedUnit, altUnit, altitudeOffset } =
    useFlightStore();

  if (!flightData || flightData.points.length === 0) return null;

  const startTime = flightData.points[0].timestamp;

  const step = Math.max(1, Math.floor(flightData.points.length / 500));
  const vario = computeVario(flightData.points);
  const lastIdx = flightData.points.length - 1;
  const data = flightData.points
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % step === 0 || i === lastIdx)
    .map(({ p, i }) => ({
      time: p.timestamp,
      altitude: Math.round(convertAlt(p.altGPS + altitudeOffset, altUnit)),
      speed: parseFloat(convertSpeed(p.speed ?? 0, speedUnit).toFixed(1)),
      vario: parseFloat(vario[i].toFixed(1)),
    }));

  // Build per-comparison dataset, remapped to elapsed seconds from primary start
  const compareData = comparedFlights.map((cf) => {
    const cfStep = Math.max(1, Math.floor(cf.points.length / 500));
    const cfVario = computeVario(cf.points);
    const cfLastIdx = cf.points.length - 1;
    const cfOrigin = cf.points[0].timestamp;
    return cf.points
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => i % cfStep === 0 || i === cfLastIdx)
      .map(({ p, i }) => ({
        // Remap to elapsed ms from primary origin so x-axes align
        time: startTime + (p.timestamp - cfOrigin),
        altitude: Math.round(convertAlt(p.altGPS, altUnit)),
        speed: parseFloat(convertSpeed(p.speed ?? 0, speedUnit).toFixed(1)),
        vario: parseFloat(cfVario[i].toFixed(1)),
      }));
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = (e: any) => {
    if (e?.activePayload?.[0]) {
      setIsPlaying(false);
      setPlaybackTime(e.activePayload[0].payload.time as number);
    }
  };

  const tickStyle = { fontSize: 10, fill: "var(--text-secondary)" };

  const aUnit = altUnitLabel(altUnit);
  const sUnit = speedUnitLabel(speedUnit);

  const charts = [
    { key: "altitude", label: `Altitude (${aUnit})`, color: "#4fc3f7", unit: aUnit },
    { key: "speed",    label: `Speed (${sUnit})`,    color: "#81c784", unit: sUnit },
    { key: "vario",    label: "Vario (m/s)",          color: "#ce93d8", unit: "m/s" },
  ] as const;

  const domainMin = data[0].time;
  const domainMax = data[data.length - 1].time;
  const totalMs = domainMax - domainMin;
  const tickCount = 5;
  const tickValues = Array.from({ length: tickCount }, (_, i) =>
    Math.round(domainMin + (i / (tickCount - 1)) * totalMs)
  );

  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ padding: "8px 12px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-secondary)" }}>
        Charts
      </div>
      {charts.map(({ key, label, color, unit }) => (
        <div key={key} style={{ padding: "4px 4px" }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", padding: "0 12px 4px" }}>
            {label}
          </div>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={data} onClick={handleClick}>
              <XAxis
                dataKey="time"
                type="number"
                domain={[domainMin, domainMax]}
                ticks={tickValues}
                tickFormatter={(v) => formatElapsed(v, startTime)}
                tick={tickStyle}
              />
              <YAxis tick={tickStyle} width={36} />
              <Tooltip
                contentStyle={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: "var(--text-primary)" }}
                labelFormatter={(v) => formatElapsed(Number(v), startTime)}
                formatter={(value) => [`${value ?? ""} ${unit}`, label]}
              />
              <Line type="monotone" dataKey={key} stroke={color} dot={false} strokeWidth={1.5} isAnimationActive={false} />
              {compareData.map((cd, ci) => (
                <Line
                  key={`${key}-c${ci}`}
                  data={cd}
                  type="monotone"
                  dataKey={key}
                  stroke={COMPARE_HEX_COLORS[ci]}
                  dot={false}
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  isAnimationActive={false}
                />
              ))}
              {key === "vario" && <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeDasharray="4 3" />}
              <ReferenceLine x={playbackTime} stroke="var(--accent)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
