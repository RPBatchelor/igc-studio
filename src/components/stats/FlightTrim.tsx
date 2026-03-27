import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { ChevronDown, ChevronRight, Scissors } from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import { bakPath, trimFileContent } from "../../lib/flightTrimmer";
import { loadFlightData } from "../../lib/flightLoader";
import { convertAlt } from "../../lib/units";

/** Format a Unix-ms timestamp as HH:MM:SS UTC — matches IGC time and the play bar. */
function formatClock(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Status = "idle" | "saving" | "saved" | "restoring" | "error";

// ---------------------------------------------------------------------------
// Drag-handle scrubber with playback cursor overlay
// ---------------------------------------------------------------------------
interface TrimScrubberProps {
  sparkData: { t: number; a: number }[];
  domainMin: number;
  domainMax: number;
  startPct: number;
  endPct: number;
  playPct: number;
  onStartChange: (ms: number) => void;
  onEndChange: (ms: number) => void;
  onSeek: (ms: number) => void;
  startMs: number;
  endMs: number;
}

function TrimScrubber({
  sparkData, domainMin, domainMax,
  startPct, endPct, playPct,
  onStartChange, onEndChange, onSeek,
  startMs, endMs,
}: TrimScrubberProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | null>(null);
  const HANDLE_W = 16;

  const pxToMs = useCallback((clientX: number): number => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(domainMin + frac * (domainMax - domainMin));
  }, [domainMin, domainMax]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragging.current) return;
    const ms = pxToMs(e.clientX);
    if (dragging.current === "start") onStartChange(Math.min(ms, endMs - 5000));
    else                              onEndChange(Math.max(ms, startMs + 5000));
  }, [pxToMs, startMs, endMs, onStartChange, onEndChange]);

  const onPointerUp = useCallback(() => {
    dragging.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  const startDrag = (which: "start" | "end") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = which;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // Click on the sparkline background → seek
  const handleBgClick = (e: React.PointerEvent) => {
    if (dragging.current) return;
    onSeek(pxToMs(e.clientX));
  };

  const Handle = ({ pct, which }: { pct: number; which: "start" | "end" }) => (
    <div
      onPointerDown={startDrag(which)}
      title={which === "start" ? "Drag to set trim start" : "Drag to set trim end"}
      style={{
        position: "absolute", top: 0, bottom: 0,
        left: `${pct}%`,
        transform: `translateX(-${HANDLE_W / 2}px)`,
        width: HANDLE_W, cursor: "ew-resize",
        display: "flex", flexDirection: "column", alignItems: "center",
        zIndex: 20,
      }}
    >
      {/* vertical bar */}
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: "50%",
        transform: "translateX(-50%)",
        width: 3, background: "#f59e0b",
        boxShadow: "0 0 5px rgba(245,158,11,0.9)",
      }} />
      {/* knob */}
      <div style={{
        position: "relative", zIndex: 1, flexShrink: 0,
        width: HANDLE_W, height: HANDLE_W, borderRadius: "50%",
        background: "#f59e0b", border: "2px solid #fff",
        boxShadow: "0 0 7px rgba(245,158,11,1)",
      }} />
      {/* bottom triangle pointer */}
      <div style={{
        position: "absolute", bottom: 0,
        width: 0, height: 0,
        borderLeft: "5px solid transparent",
        borderRight: "5px solid transparent",
        borderTop: "6px solid #f59e0b",
      }} />
    </div>
  );

  return (
    <div
      ref={containerRef}
      onPointerDown={handleBgClick}
      style={{ position: "relative", userSelect: "none", marginBottom: 6, cursor: "crosshair" }}
    >
      {/* Sparkline */}
      <div style={{ pointerEvents: "none", height: 70 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="altGradTrim" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#4fc3f7" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#4fc3f7" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <Area
              type="monotone" dataKey="a"
              stroke="#4fc3f7" strokeWidth={1.5}
              fill="url(#altGradTrim)"
              dot={false} isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Excluded-zone overlays */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: 0, bottom: 0, left: 0,
          width: `${startPct}%`, background: "rgba(0,0,0,0.55)",
        }} />
        <div style={{
          position: "absolute", top: 0, bottom: 0, right: 0,
          width: `${100 - endPct}%`, background: "rgba(0,0,0,0.55)",
        }} />
      </div>

      {/* Playback cursor — white line matching the main flight charts */}
      <div style={{
        position: "absolute", top: 0, bottom: 0,
        left: `${playPct}%`,
        width: 2, background: "rgba(255,255,255,0.85)",
        boxShadow: "0 0 4px rgba(255,255,255,0.5)",
        pointerEvents: "none", zIndex: 15,
        transform: "translateX(-1px)",
      }} />

      <Handle pct={startPct} which="start" />
      <Handle pct={endPct}   which="end" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function FlightTrim() {
  const {
    flightData, selectedFile, setFlightData,
    logbookEntries, setLogbookEntries,
    altUnit,
    playbackTime, setPlaybackTime, setIsPlaying,
  } = useFlightStore();

  const [open, setOpen] = useState(false);
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(0);
  const [hasBackup, setHasBackup] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const prevFileRef = useRef<string | null>(null);
  // Synchronous guard — prevents double-invocation before React re-renders with busy state
  const opInFlightRef = useRef(false);
  // Timer for auto-clearing "saved" status message
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset handles and probe for backup when the loaded file changes
  useEffect(() => {
    if (!flightData || !selectedFile) return;
    if (selectedFile === prevFileRef.current) return;
    prevFileRef.current = selectedFile;

    if (savedTimerRef.current) { clearTimeout(savedTimerRef.current); savedTimerRef.current = null; }
    const pts = flightData.points;
    setStartMs(pts[0].timestamp);
    setEndMs(pts[pts.length - 1].timestamp);
    setStatus("idle");
    setErrorMsg("");
    setHasBackup(null);

    invoke<string>("read_file_text", { path: bakPath(selectedFile) })
      .then(() => setHasBackup(true))
      .catch(() => setHasBackup(false));
  }, [flightData, selectedFile]);

  if (!flightData || !selectedFile) return null;

  const pts = flightData.points;
  const domainMin = pts[0].timestamp;
  const domainMax = pts[pts.length - 1].timestamp;
  const domainSpan = domainMax - domainMin || 1;

  const step = Math.max(1, Math.floor(pts.length / 200));
  const sparkData = pts
    .filter((_, i) => i % step === 0 || i === pts.length - 1)
    .map((p) => ({ t: p.timestamp, a: convertAlt(p.altGPS, altUnit) }));

  const startPct = ((startMs     - domainMin) / domainSpan) * 100;
  const endPct   = ((endMs       - domainMin) / domainSpan) * 100;
  const playPct  = ((playbackTime - domainMin) / domainSpan) * 100;

  const filename = selectedFile.split(/[\\/]/).pop() ?? selectedFile;

  function patchLogbook(fresh: typeof flightData) {
    if (!fresh || !logbookEntries) return;
    setLogbookEntries(logbookEntries.map((e) =>
      e.path !== selectedFile ? e : {
        ...e,
        date: fresh.date,
        duration: fresh.stats.duration,
        distance: fresh.stats.totalDistance,
        maxAltitude: fresh.stats.maxAltitude,
        maxClimb: fresh.stats.maxClimb,
        maxSink: fresh.stats.maxSink,
      },
    ));
  }

  function resetHandlesToFlight(data: typeof flightData) {
    if (!data) return;
    setStartMs(data.points[0].timestamp);
    setEndMs(data.points[data.points.length - 1].timestamp);
  }

  async function handleSave() {
    if (opInFlightRef.current) return;
    if (startMs >= endMs) { setErrorMsg("Start must be before end."); setStatus("error"); return; }
    opInFlightRef.current = true;
    setStatus("saving"); setErrorMsg("");
    try {
      const file = selectedFile!;
      const rawContent = await invoke<string>("read_file_text", { path: file });
      if (!hasBackup) {
        await invoke("write_file_text", { path: bakPath(file), content: rawContent });
        setHasBackup(true);
      }
      const trimmed = trimFileContent(rawContent, file, startMs, endMs, flightData!.date, domainMin, domainMax, pts.length);
      await invoke("write_file_text", { path: file, content: trimmed });
      await loadFlightData(file, filename, setFlightData);
      const fresh = useFlightStore.getState().flightData;
      patchLogbook(fresh);
      resetHandlesToFlight(fresh);
      setStatus("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setErrorMsg(String(err));
      setStatus("error");
    } finally {
      opInFlightRef.current = false;
    }
  }

  async function handleRestore() {
    if (opInFlightRef.current) return;
    opInFlightRef.current = true;
    setStatus("restoring"); setErrorMsg("");
    try {
      const file = selectedFile!;
      const original = await invoke<string>("read_file_text", { path: bakPath(file) });
      await invoke("write_file_text", { path: file, content: original });
      await loadFlightData(file, filename, setFlightData);
      const fresh = useFlightStore.getState().flightData;
      patchLogbook(fresh);
      resetHandlesToFlight(fresh);
      setStatus("idle");
    } catch (err) {
      setErrorMsg(String(err));
      setStatus("error");
    } finally {
      opInFlightRef.current = false;
    }
  }

  const busy = status === "saving" || status === "restoring";

  const captureBtn = (label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      title={`Set to current playback position (${formatClock(playbackTime)})`}
      style={{
        padding: "2px 7px", fontSize: 11, borderRadius: 3,
        border: "1px solid var(--border)", background: "var(--bg-tertiary)",
        color: "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: 4 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 6,
          padding: "8px 12px", background: "none", border: "none",
          cursor: "pointer", color: "var(--text-secondary)", fontSize: 12,
          fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px",
        }}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Scissors size={13} />
        Trim Flight
      </button>

      {open && flightData.hasSyntheticTimestamps && (
        <div style={{
          margin: "0 12px 10px",
          padding: "6px 10px",
          background: "rgba(255,180,0,0.1)",
          border: "1px solid rgba(255,180,0,0.35)",
          borderRadius: 4,
          fontSize: 11,
          color: "var(--text-secondary)",
        }}>
          Trim is not available for this file — it has no GPS timestamps, so the
          trim range cannot be mapped to specific points.
        </div>
      )}

      {open && !flightData.hasSyntheticTimestamps && (
        <div style={{ padding: "0 12px 12px" }}>

          <TrimScrubber
            sparkData={sparkData}
            domainMin={domainMin} domainMax={domainMax}
            startMs={startMs} endMs={endMs}
            startPct={startPct} endPct={endPct} playPct={playPct}
            onStartChange={(v) => { setStartMs(v); setStatus("idle"); }}
            onEndChange={(v)   => { setEndMs(v);   setStatus("idle"); }}
            onSeek={(ms) => { setIsPlaying(false); setPlaybackTime(ms); }}
          />

          {/* Current playback position row */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 6, marginBottom: 6, fontSize: 11,
          }}>
            {captureBtn("← Set start", () => {
              setStartMs(playbackTime);
              // If playback is at or past the end handle, reset end to domain max
              if (playbackTime >= endMs) setEndMs(domainMax);
              setStatus("idle");
            })}
            <span style={{ color: "var(--text-muted)", flex: 1, textAlign: "center" }}>
              Playback{" "}
              <span style={{ color: "rgba(255,255,255,0.85)", fontVariantNumeric: "tabular-nums" }}>
                {formatClock(playbackTime)}
              </span>
            </span>
            {captureBtn("Set end →", () => {
              setEndMs(playbackTime);
              // If playback is at or before the start handle, reset start to domain min
              if (playbackTime <= startMs) setStartMs(domainMin);
              setStatus("idle");
            })}
          </div>

          {/* Trim range readout */}
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 11, color: "var(--text-muted)", marginBottom: 8,
            fontVariantNumeric: "tabular-nums",
          }}>
            <span>
              Start{" "}
              <span style={{ color: "var(--text-primary)" }}>{formatClock(startMs)}</span>
            </span>
            <span style={{ color: "var(--text-secondary)" }}>
              {formatDuration(endMs - startMs)}
            </span>
            <span>
              End{" "}
              <span style={{ color: "var(--text-primary)" }}>{formatClock(endMs)}</span>
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => void handleSave()} disabled={busy}
              style={{
                flex: 1, padding: "5px 10px", fontSize: 12, borderRadius: 4,
                border: "none", cursor: busy ? "not-allowed" : "pointer",
                background: "var(--accent)", color: "#fff", opacity: busy ? 0.6 : 1,
              }}
            >
              {status === "saving" ? "Saving…" : "Save Trim"}
            </button>
            {hasBackup && (
              <button
                onClick={() => void handleRestore()} disabled={busy}
                style={{
                  flex: 1, padding: "5px 10px", fontSize: 12, borderRadius: 4,
                  border: "1px solid var(--border)", cursor: busy ? "not-allowed" : "pointer",
                  background: "var(--bg-tertiary)", color: "var(--text-secondary)",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {status === "restoring" ? "Restoring…" : "Restore Original"}
              </button>
            )}
          </div>

          {status === "saved" && (
            <div style={{ fontSize: 11, color: "#4ade80", marginTop: 6 }}>
              Trimmed and reloaded successfully.
            </div>
          )}
          {status === "error" && (
            <div style={{ fontSize: 11, color: "#f87171", marginTop: 6, wordBreak: "break-word" }}>
              {errorMsg}
            </div>
          )}

          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.4 }}>
            Original backed up as <code style={{ fontSize: 10 }}>.bak</code> on first save.
          </div>
        </div>
      )}
    </div>
  );
}
