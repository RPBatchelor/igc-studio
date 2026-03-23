import { useState, useRef, useEffect } from "react";
import { MapPin, Navigation, Globe, ChevronRight, ChevronDown, Loader } from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { saveSiteDb } from "../../lib/siteDb";
import type { LocationSite } from "../../parsers/types";

const FILE_TYPES = {
  igc: { icon: Navigation, color: "#4fc3f7", label: "IGC" },
  kml: { icon: Globe,      color: "#81c784", label: "KML" },
} as const;

type FileTypeKey = keyof typeof FILE_TYPES;

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "igc") return <Navigation size={13} color="#4fc3f7" />;
  if (ext === "kml") return <Globe size={13} color="#81c784" />;
  return <Navigation size={13} color="#888" />;
}

function formatDate(filename: string): string {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) {
    const d = new Date(m[1]);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  }
  return filename;
}

export function LocationsPanel() {
  const {
    sites, sitesLoading, selectedFile, siteDb, geocodingUsed,
    updateSiteDb, setSites, visibleFileTypes, toggleFileType,
  } = useFlightStore();
  const { loadFile } = useFileSystem();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleSite = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleRename = async (siteId: string, name: string) => {
    const updatedDb = updateSiteDb(siteId, { userRename: name });
    await saveSiteDb(updatedDb);
    setSites(
      useFlightStore.getState().sites.map((s) =>
        s.id === siteId ? { ...s, name } : s
      )
    );
  };

  if (sitesLoading) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "var(--text-muted)" }}>
        <Loader size={20} style={{ animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: 12 }}>Scanning flights…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
        Open a folder to see flight sites.
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Site list */}
      <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
        {sites.map((site) => {
          const visibleFlights = site.flights.filter((f) => {
            const ext = f.name.split(".").pop()?.toLowerCase();
            if (ext === "igc") return visibleFileTypes.has("igc");
            if (ext === "kml") return visibleFileTypes.has("kml");
            return true;
          });
          if (visibleFlights.length === 0) return null;
          return (
            <SiteRow
              key={site.id}
              site={{ ...site, flights: visibleFlights }}
              expanded={expanded.has(site.id)}
              selectedFile={selectedFile}
              onToggle={() => toggleSite(site.id)}
              onFileClick={loadFile}
              onRename={(name) => handleRename(site.id, name)}
            />
          );
        })}
      </div>

      {/* File type filter — shared with Explorer */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "8px 12px", flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--text-muted)", marginBottom: 6 }}>
          Show file types
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(Object.entries(FILE_TYPES) as [FileTypeKey, typeof FILE_TYPES[FileTypeKey]][]).map(([type, { icon: Icon, color, label }]) => {
            const active = visibleFileTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleFileType(type)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 8px", borderRadius: 4,
                  border: `1px solid ${active ? color : "var(--border)"}`,
                  background: active ? `${color}18` : "transparent",
                  color: active ? color : "var(--text-muted)",
                  cursor: "pointer", fontSize: 12, fontWeight: 600,
                  transition: "all 0.15s",
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {geocodingUsed && (
        <div style={{ padding: "4px 12px 6px", fontSize: 10, color: "var(--text-secondary)", flexShrink: 0 }}>
          Site names © OpenStreetMap contributors
        </div>
      )}
    </div>
  );
}

function SiteRow({
  site, expanded, selectedFile, onToggle, onFileClick, onRename,
}: {
  site: LocationSite;
  expanded: boolean;
  selectedFile: string | null;
  onToggle: () => void;
  onFileClick: (path: string, name: string) => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(site.name);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = () => {
    if (draft.trim()) onRename(draft.trim());
    setEditing(false);
  };

  return (
    <>
      <div
        onClick={onToggle}
        style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", cursor: "pointer", userSelect: "none" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      >
        {expanded ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
        <MapPin size={14} color="#f48fb1" />

        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1, background: "var(--bg-input)", border: "1px solid var(--accent)",
              color: "var(--text-bright)", fontSize: 13, padding: "1px 4px", borderRadius: 3, outline: "none",
            }}
          />
        ) : (
          <span
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
            title="Double-click to rename"
            style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {site.name}
          </span>
        )}

        <span style={{ fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 }}>{site.flights.length}</span>
      </div>

      {expanded && site.flights.map((flight) => {
        const isSelected = flight.path === selectedFile;
        return (
          <div
            key={flight.path}
            onClick={() => onFileClick(flight.path, flight.name)}
            title={flight.name}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "3px 8px", paddingLeft: 32, cursor: "pointer",
              background: isSelected ? "var(--bg-selected)" : "transparent",
              color: isSelected ? "var(--text-bright)" : "var(--text-secondary)",
            }}
            onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
          >
            {getFileIcon(flight.name)}
            <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {formatDate(flight.name)}
            </span>
          </div>
        );
      })}
    </>
  );
}
