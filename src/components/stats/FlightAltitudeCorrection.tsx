import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, MountainSnow } from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import { saveFlightNotesDb, normalizeNotesKey } from "../../lib/flightNotesDb";

const MIN_OFFSET = -50;
const MAX_OFFSET = 50;

export function FlightAltitudeCorrection() {
  const {
    flightData,
    selectedFile,
    altitudeOffset,
    setAltitudeOffset,
    launchTerrainAlt,
    terrainEnabled,
    cesiumIonToken,
    flightNotesDb,
    updateFlightNote,
  } = useFlightStore();

  const [open, setOpen] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted offset after flight data is set.
  // Must watch flightData (not selectedFile) because setFlightData resets altitudeOffset to 0
  // after setSelectedFile fires — watching flightData ensures we load after that reset.
  useEffect(() => {
    if (!selectedFile || !flightData) return;
    const saved = flightNotesDb[normalizeNotesKey(selectedFile)]?.altitudeOffset ?? 0;
    setAltitudeOffset(saved);
  }, [flightData]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!flightData || !selectedFile) return null;

  const launchAltGPS = flightData.points[0]?.altGPS ?? 0;

  const persist = (value: number) => {
    const next = updateFlightNote(selectedFile, {
      altitudeOffset: value !== 0 ? value : undefined,
    });
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveFlightNotesDb(next), 600);
  };

  const handleChange = (raw: number) => {
    const clamped = Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, Math.round(raw)));
    setAltitudeOffset(clamped);
    persist(clamped);
  };

  const handleAutoDetect = () => {
    if (launchTerrainAlt === null) return;
    handleChange(Math.round(launchTerrainAlt - launchAltGPS));
  };

  const handleReset = () => {
    handleChange(0);
  };

  // Auto button is only meaningful when real terrain data exists
  const autoEnabled = terrainEnabled && cesiumIonToken !== "" && launchTerrainAlt !== null;
  const autoTitle = !terrainEnabled
    ? "Enable 3D terrain in Map Layers first"
    : !cesiumIonToken
    ? "Requires a Cesium Ion token in Settings"
    : launchTerrainAlt === null
    ? "Terrain data not yet sampled — wait a moment"
    : (() => { const d = Math.round(launchTerrainAlt - launchAltGPS); return `Set offset to match terrain at launch (${d >= 0 ? "+" : ""}${d} m)`; })();

  const btnStyle = (disabled = false): React.CSSProperties => ({
    padding: "4px 10px",
    borderRadius: 4,
    border: "1px solid var(--border)",
    background: disabled ? "transparent" : "var(--bg-tertiary)",
    color: disabled ? "var(--text-secondary)" : "var(--text-bright)",
    fontSize: 11,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      {/* Header */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", cursor: "pointer", userSelect: "none" }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <MountainSnow size={14} color="var(--accent)" />
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-bright)", flex: 1 }}>
          Altitude Correction
        </span>
        {altitudeOffset !== 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            background: "rgba(100,180,255,0.15)",
            border: "1px solid rgba(100,180,255,0.4)",
            color: "#64b4ff",
            borderRadius: 10,
            padding: "1px 7px",
          }}>
            {altitudeOffset > 0 ? "+" : ""}{altitudeOffset} m
          </span>
        )}
      </div>

      {/* Body */}
      {open && (
        <div style={{ padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>

          {/* Numeric input + slider */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>Offset</span>
            <input
              type="number"
              min={MIN_OFFSET}
              max={MAX_OFFSET}
              step={1}
              value={altitudeOffset}
              onChange={(e) => handleChange(Number(e.target.value))}
              style={{
                width: 64,
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--text-bright)",
                fontSize: 12,
                padding: "4px 6px",
                textAlign: "right",
                outline: "none",
              }}
            />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>m</span>
          </div>

          <input
            type="range"
            min={MIN_OFFSET}
            max={MAX_OFFSET}
            step={1}
            value={altitudeOffset}
            onChange={(e) => handleChange(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleAutoDetect}
              disabled={!autoEnabled}
              title={autoTitle}
              style={btnStyle(!autoEnabled)}
            >
              Auto from terrain
            </button>
            <button
              onClick={handleReset}
              disabled={altitudeOffset === 0}
              style={btnStyle(altitudeOffset === 0)}
            >
              Reset
            </button>
          </div>

          {/* Terrain info row */}
          {autoEnabled && launchTerrainAlt !== null && (
            <div style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}>
              <span>Launch GPS: <strong style={{ color: "var(--text-bright)" }}>{Math.round(launchAltGPS)} m</strong></span>
              <span>Terrain: <strong style={{ color: "var(--text-bright)" }}>{Math.round(launchTerrainAlt)} m</strong></span>
              <span>Δ = <strong style={{ color: altitudeOffset !== 0 ? "#64b4ff" : "var(--text-bright)" }}>
                {Math.round(launchTerrainAlt - launchAltGPS) >= 0 ? "+" : ""}{Math.round(launchTerrainAlt - launchAltGPS)} m
              </strong></span>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
