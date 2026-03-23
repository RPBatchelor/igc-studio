import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import { useFlightAnimation } from "../../hooks/useFlightAnimation";

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function TimelineScrubber() {
  const {
    flightData,
    playbackTime,
    playbackSpeed,
    isPlaying,
    setPlaybackTime,
    setPlaybackSpeed,
    setIsPlaying,
  } = useFlightStore();

  useFlightAnimation();

  if (!flightData || flightData.points.length === 0) return null;

  const startTime = flightData.points[0].timestamp;
  const endTime = flightData.points[flightData.points.length - 1].timestamp;
  const speeds = [1, 2, 5, 10, 20, 50];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        background: "var(--bg-secondary)",
        borderTop: "1px solid var(--border)",
        fontSize: 12,
      }}
    >
      {/* Controls */}
      <button
        onClick={() => setPlaybackTime(startTime)}
        style={btnStyle}
        title="Reset"
      >
        <SkipBack size={14} />
      </button>
      <button
        onClick={() => setIsPlaying(!isPlaying)}
        style={btnStyle}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <button
        onClick={() => setPlaybackTime(endTime)}
        style={btnStyle}
        title="End"
      >
        <SkipForward size={14} />
      </button>

      {/* Time display */}
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          minWidth: 65,
          color: "var(--text-secondary)",
        }}
      >
        {formatTimestamp(playbackTime)}
      </span>

      {/* Slider */}
      <input
        type="range"
        min={startTime}
        max={endTime}
        value={playbackTime}
        onChange={(e) => {
          setIsPlaying(false);
          setPlaybackTime(Number(e.target.value));
        }}
        style={{
          flex: 1,
          accentColor: "var(--accent)",
          height: 4,
          cursor: "pointer",
        }}
      />

      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          minWidth: 65,
          color: "var(--text-secondary)",
          textAlign: "right",
        }}
      >
        {formatTimestamp(endTime)}
      </span>

      {/* Speed selector */}
      <select
        value={playbackSpeed}
        onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
        style={{
          background: "var(--bg-tertiary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          borderRadius: 3,
          padding: "2px 4px",
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        {speeds.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-primary)",
  cursor: "pointer",
  padding: 4,
  display: "flex",
  alignItems: "center",
  borderRadius: 3,
};
