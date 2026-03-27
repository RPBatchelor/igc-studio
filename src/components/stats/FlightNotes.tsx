import { useState, useEffect, useRef } from "react";
import { useFlightStore } from "../../stores/flightStore";
import { saveFlightNotesDb, normalizeNotesKey } from "../../lib/flightNotesDb";

export function FlightNotes() {
  const { selectedFile, flightNotesDb, updateFlightNote } = useFlightStore();

  const entry = selectedFile ? (flightNotesDb[normalizeNotesKey(selectedFile)] ?? {}) : null;

  const [glider, setGlider] = useState(entry?.glider ?? "");
  const [notes,  setNotes]  = useState(entry?.notes  ?? "");

  // Sync local state when the selected flight changes
  useEffect(() => {
    setGlider(entry?.glider ?? "");
    setNotes(entry?.notes  ?? "");
  }, [selectedFile]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!selectedFile) return null;

  const persist = (patch: { glider?: string; notes?: string }) => {
    const next = updateFlightNote(selectedFile, patch);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveFlightNotesDb(next), 600);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--bg-input, var(--bg-tertiary))",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--text-bright)",
    fontSize: 12,
    padding: "5px 8px",
    outline: "none",
    boxSizing: "border-box",
    resize: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--text-secondary)",
    marginBottom: 4,
    display: "block",
  };

  return (
    <div
      style={{
        padding: "12px 12px 16px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-secondary)", marginBottom: 2 }}>
        Flight Notes
      </div>

      {/* Glider */}
      <div>
        <label style={labelStyle}>Glider</label>
        <input
          type="text"
          value={glider}
          placeholder="e.g. Ozone Zeno 2"
          onChange={(e) => {
            setGlider(e.target.value);
            persist({ glider: e.target.value });
          }}
          style={inputStyle}
        />
      </div>

      {/* Notes */}
      <div>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={notes}
          placeholder="Conditions, route, observations…"
          rows={4}
          onChange={(e) => {
            setNotes(e.target.value);
            persist({ notes: e.target.value });
          }}
          style={{ ...inputStyle, lineHeight: 1.5 }}
        />
      </div>
    </div>
  );
}
