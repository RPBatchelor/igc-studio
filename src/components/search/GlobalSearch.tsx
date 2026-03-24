import { useEffect, useRef, useState, useCallback } from "react";
import { Search } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useFlightStore } from "../../stores/flightStore";
import { useFileSystem } from "../../hooks/useFileSystem";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string]; // [minlat, maxlat, minlng, maxlng]
}

interface SearchResult {
  id: string;
  group: "Flights" | "Places";
  label: string;
  sublabel?: string;
  lat: number;
  lng: number;
  altitude: number;
  // For flight results — navigate to this site in LocationsPanel
  siteId?: string;
  filePath?: string;
  fileName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFlightLabel(filename: string): string {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) {
    const d = new Date(m[1]);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  }
  return filename.replace(/\.[^.]+$/, ""); // strip extension
}

function altitudeFromBbox(bb: [string, string, string, string]): number {
  const latSpan = Math.abs(parseFloat(bb[1]) - parseFloat(bb[0]));
  const lngSpan = Math.abs(parseFloat(bb[3]) - parseFloat(bb[2]));
  const span = Math.max(latSpan, lngSpan);
  return Math.min(Math.max(span * 111_000 * 1.5, 3_000), 3_000_000);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GlobalSearch() {
  const [open, setOpen]               = useState(false);
  const [query, setQuery]             = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [flightResults, setFlightResults] = useState<SearchResult[]>([]);
  const [placeResults, setPlaceResults]   = useState<SearchResult[]>([]);
  const [geocoding, setGeocoding]         = useState(false);
  const [geocodeError, setGeocodeError]   = useState<string | null>(null);

  const inputRef   = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { sites, zoomAltitude, setPendingCameraTarget, setActiveView, setPendingLocationSiteId, visibleFileTypes } = useFlightStore();
  const { loadFile } = useFileSystem();

  // ── Open / close ──────────────────────────────────────────────────────────

  const openPalette = useCallback(() => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setFlightResults([]);
    setPlaceResults([]);
    setActiveIndex(-1);
    setGeocodeError(null);
  }, []);

  // Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        open ? closePalette() : openPalette();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, openPalette, closePalette]);

  // ── Flight search (synchronous) ───────────────────────────────────────────

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) { setFlightResults([]); return; }

    const results: SearchResult[] = [];

    for (const site of sites) {
      if (!site.name.toLowerCase().includes(q)) continue;
      for (const flight of site.flights) {
        // Respect the active file-type filter
        const ext = flight.name.split(".").pop()?.toLowerCase();
        if (ext === "igc" && !visibleFileTypes.has("igc")) continue;
        if (ext === "kml" && !visibleFileTypes.has("kml")) continue;
        const fileType = ext === "igc" ? "IGC" : ext === "kml" ? "KML" : ext?.toUpperCase() ?? "";
        results.push({
          id:       `flight-${site.id}-${flight.path}`,
          group:    "Flights" as const,
          label:    formatFlightLabel(flight.name),
          sublabel: `${fileType}  ·  ${site.name}`,
          lat:      site.lat,
          lng:      site.lng,
          altitude: zoomAltitude,
          siteId:   site.id,
          filePath: flight.path,
          fileName: flight.name,
        });
        if (results.length >= 20) break;
      }
      if (results.length >= 20) break;
    }

    setFlightResults(results);
    setActiveIndex(-1);
  }, [query, sites, zoomAltitude, visibleFileTypes]);

  // ── Nominatim geocode (debounced) ─────────────────────────────────────────

  useEffect(() => {
    const q = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.length < 2) {
      setPlaceResults([]);
      setGeocodeError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setGeocoding(true);
      setGeocodeError(null);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=au`;
        const text = await invoke<string>("fetch_url_text", { url });
        const raw = JSON.parse(text) as NominatimResult[];
        setPlaceResults(
          raw.map((r, i) => ({
            id:       `place-${i}-${r.lat}`,
            group:    "Places" as const,
            label:    r.display_name.split(",")[0].trim(),
            sublabel: r.display_name.split(",").slice(1, 3).join(",").trim(),
            lat:      parseFloat(r.lat),
            lng:      parseFloat(r.lon),
            altitude: altitudeFromBbox(r.boundingbox),
          }))
        );
      } catch {
        setGeocodeError("Place search unavailable");
        setPlaceResults([]);
      } finally {
        setGeocoding(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ── All results (for keyboard nav) ────────────────────────────────────────

  const allResults = [...flightResults, ...placeResults];

  // ── Keyboard navigation ───────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { closePalette(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, allResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(allResults[activeIndex]);
    }
  };

  // ── Select ────────────────────────────────────────────────────────────────

  const handleSelect = (result: SearchResult) => {
    setPendingCameraTarget({ lat: result.lat, lng: result.lng, altitude: result.altitude });
    if (result.siteId && result.filePath && result.fileName) {
      loadFile(result.filePath, result.fileName);
      setActiveView("locations");
      setPendingLocationSiteId(result.siteId);
    }
    closePalette();
  };

  // ── Styles ────────────────────────────────────────────────────────────────

  const triggerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-input, var(--bg-tertiary))",
    color: "var(--text-muted)",
    cursor: "text",
    fontSize: 12,
    width: 280,
    userSelect: "none",
  };

  const dropdownStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 2px)",
    left: "50%",
    transform: "translateX(-50%)",
    width: "min(560px, 90vw)",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    zIndex: 9999,
    overflow: "hidden",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-bright)",
    padding: "10px 14px 10px 38px",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  const groupLabelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    color: "var(--text-muted)",
    padding: "8px 14px 4px",
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Trigger pill */}
      <div style={triggerStyle} onClick={openPalette} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && openPalette()}
      >
        <Search size={13} />
        <span>Search flights &amp; places</span>
        <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.5 }}>Ctrl+K</span>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9998 }}
          onClick={closePalette}
        />
      )}

      {/* Dropdown */}
      {open && (
        <div style={dropdownStyle}>
          {/* Input */}
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search flight sites or places…"
              style={inputStyle}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* Results */}
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {query.trim().length === 0 && (
              <div style={{ padding: "16px 14px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                Type to search your flight sites or find any location on the map
              </div>
            )}

            {/* Flights group */}
            {flightResults.length > 0 && (
              <>
                <div style={groupLabelStyle}>Flights</div>
                {flightResults.map((r) => {
                  const idx = allResults.indexOf(r);
                  return (
                    <ResultRow
                      key={r.id}
                      result={r}
                      active={idx === activeIndex}
                      onSelect={handleSelect}
                      onHover={() => setActiveIndex(idx)}
                    />
                  );
                })}
              </>
            )}

            {/* No flight results */}
            {query.trim().length >= 2 && flightResults.length === 0 && sites.length > 0 && (
              <>
                <div style={groupLabelStyle}>Flights</div>
                <div style={{ padding: "6px 14px 8px", fontSize: 12, color: "var(--text-muted)" }}>No matching flight sites</div>
              </>
            )}

            {/* Places group */}
            {query.trim().length >= 2 && (
              <>
                <div style={{ ...groupLabelStyle, display: "flex", alignItems: "center", gap: 6 }}>
                  Places
                  {geocoding && <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>searching…</span>}
                </div>
                {geocodeError ? (
                  <div style={{ padding: "6px 14px 8px", fontSize: 12, color: "var(--text-muted)" }}>{geocodeError}</div>
                ) : placeResults.length > 0 ? (
                  placeResults.map((r) => {
                    const idx = allResults.indexOf(r);
                    return (
                      <ResultRow
                        key={r.id}
                        result={r}
                        active={idx === activeIndex}
                        onSelect={handleSelect}
                        onHover={() => setActiveIndex(idx)}
                      />
                    );
                  })
                ) : !geocoding ? (
                  <div style={{ padding: "6px 14px 8px", fontSize: 12, color: "var(--text-muted)" }}>No places found</div>
                ) : null}
              </>
            )}

            {/* Bottom padding */}
            <div style={{ height: 6 }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResultRow
// ---------------------------------------------------------------------------

function ResultRow({
  result, active, onSelect, onHover,
}: {
  result: SearchResult;
  active: boolean;
  onSelect: (r: SearchResult) => void;
  onHover: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div
      ref={rowRef}
      onClick={() => onSelect(result)}
      onMouseEnter={onHover}
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "6px 14px",
        cursor: "pointer",
        background: active ? "var(--bg-selected, var(--bg-tertiary))" : "transparent",
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "background 0.08s",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--text-bright)", lineHeight: 1.4 }}>{result.label}</span>
      {result.sublabel && (
        <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4, marginTop: 1 }}>{result.sublabel}</span>
      )}
    </div>
  );
}
