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

function formatElapsed(timestamp: number, startTime: number): string {
  const elapsed = (timestamp - startTime) / 1000;
  const m = Math.floor(elapsed / 60);
  const s = Math.floor(elapsed % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function FlightCharts() {
  const { flightData, playbackTime, setPlaybackTime, setIsPlaying, speedUnit, altUnit } =
    useFlightStore();

  if (!flightData || flightData.points.length === 0) return null;

  const startTime = flightData.points[0].timestamp;

  const step = Math.max(1, Math.floor(flightData.points.length / 500));
  const data = flightData.points
    .filter((_, i) => i % step === 0 || i === flightData.points.length - 1)
    .map((p) => ({
      time: p.timestamp,
      altitude: Math.round(convertAlt(p.altGPS, altUnit)),
      speed: parseFloat(convertSpeed(p.speed ?? 0, speedUnit).toFixed(1)),
    }));

  const handleClick = (e: { activePayload?: { payload: { time: number } }[] }) => {
    if (e?.activePayload?.[0]) {
      setIsPlaying(false);
      setPlaybackTime(e.activePayload[0].payload.time);
    }
  };

  const tickStyle = { fontSize: 10, fill: "var(--text-secondary)" };

  const aUnit = altUnitLabel(altUnit);
  const sUnit = speedUnitLabel(speedUnit);

  const charts = [
    { key: "altitude", label: `Altitude (${aUnit})`, color: "#4fc3f7", unit: aUnit },
    { key: "speed",    label: `Speed (${sUnit})`,    color: "#81c784", unit: sUnit },
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
                formatter={(value: number) => [`${value} ${unit}`, label]}
              />
              <Line type="monotone" dataKey={key} stroke={color} dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <ReferenceLine x={playbackTime} stroke="var(--accent)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
