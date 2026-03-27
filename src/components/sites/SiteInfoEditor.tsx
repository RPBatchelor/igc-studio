import { useState, useEffect, useRef } from "react";
import { Globe, Loader, Save, RotateCcw } from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import { saveSiteDb } from "../../lib/siteDb";
import { fetchAndParseSiteInfo } from "../../lib/siteInfoParser";
import type { SiteInfo } from "../../parsers/types";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  color: "var(--text-bright)",
  padding: "4px 8px",
  borderRadius: 4,
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  marginBottom: 3,
  display: "block",
};

const sectionStyle: React.CSSProperties = {
  borderTop: "1px solid var(--border)",
  paddingTop: 14,
  marginTop: 14,
};

type ParseStatus = "idle" | "fetching" | "success" | "error";

interface Draft {
  displayName: string;
  siteInfo: SiteInfo;
}

// ── Merge modal ────────────────────────────────────────────────────────────

const SITEINFO_FIELDS: { key: keyof SiteInfo; label: string }[] = [
  { key: "status",       label: "Status" },
  { key: "officialName", label: "Official Name" },
  { key: "type",         label: "Type" },
  { key: "region",       label: "Region" },
  { key: "country",      label: "Country" },
  { key: "state",        label: "State" },
  { key: "lat",          label: "Latitude" },
  { key: "lng",          label: "Longitude" },
  { key: "conditions",   label: "Conditions" },
  { key: "height",       label: "Height" },
  { key: "rating",       label: "Rating" },
  { key: "description",  label: "Description" },
  { key: "siteGuideUrl", label: "Site Guide URL" },
];

type MergeRowKind = "new" | "changed" | "same";

interface MergeRow {
  key: keyof SiteInfo;
  label: string;
  currentVal: string;
  fetchedVal: string;
  kind: MergeRowKind;
  selected: boolean;
}

function toDisplayStr(_key: keyof SiteInfo, val: unknown): string {
  if (val === undefined || val === null || val === "") return "";
  return String(val);
}

function buildMergeRows(current: SiteInfo, fetched: Partial<SiteInfo>): MergeRow[] {
  return SITEINFO_FIELDS
    .filter(({ key }) => {
      const fv = toDisplayStr(key, fetched[key]);
      return fv !== ""; // only show fields the web returned a value for
    })
    .map(({ key, label }) => {
      const cv = toDisplayStr(key, current[key]);
      const fv = toDisplayStr(key, fetched[key]);
      const kind: MergeRowKind = cv === "" ? "new" : cv === fv ? "same" : "changed";
      return { key, label, currentVal: cv, fetchedVal: fv, kind, selected: kind !== "same" };
    });
}

function FieldValue({ fieldKey, value }: { fieldKey: keyof SiteInfo; value: string }) {
  if (!value) return <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>—</span>;
  if (fieldKey === "status") {
    const color = value === "open" ? "#22c55e" : value === "closed" ? "#ef4444" : "var(--text-muted)";
    return <span style={{ color, fontWeight: 600 }}>{value === "open" ? "● Open" : value === "closed" ? "✕ Closed" : value}</span>;
  }
  if (fieldKey === "description") {
    const t = value.length > 100 ? value.slice(0, 100) + "…" : value;
    return <span style={{ whiteSpace: "pre-wrap", lineHeight: 1.4, wordBreak: "break-word" }}>{t}</span>;
  }
  return <span>{value}</span>;
}

interface MergeModalProps {
  rows: MergeRow[];
  onApply: (selected: MergeRow[]) => void;
  onCancel: () => void;
}

function MergeModal({ rows, onApply, onCancel }: MergeModalProps) {
  const [localRows, setLocalRows] = useState<MergeRow[]>(rows);

  const toggle = (i: number) =>
    setLocalRows((prev) => prev.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r));

  const selectAll = (v: boolean) =>
    setLocalRows((prev) => prev.map((r) => r.kind === "same" ? r : { ...r, selected: v }));

  const selectable = localRows.filter((r) => r.kind !== "same");
  const selectedCount = selectable.filter((r) => r.selected).length;
  const allChecked = selectable.every((r) => r.selected);
  const noneChecked = selectable.every((r) => !r.selected);

  const KIND_BG: Record<MergeRowKind, string> = {
    new:     "rgba(34,197,94,0.08)",
    changed: "rgba(251,191,36,0.08)",
    same:    "transparent",
  };
  const KIND_BADGE: Record<MergeRowKind, { label: string; color: string }> = {
    new:     { label: "NEW",     color: "#22c55e" },
    changed: { label: "CHANGED", color: "#f59e0b" },
    same:    { label: "SAME",    color: "var(--text-muted)" },
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-panel)", border: "1px solid var(--border)",
          borderRadius: 8, width: 700, maxWidth: "95vw", maxHeight: "80vh",
          display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-bright)" }}>
            Review Web Import
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
            Select which fields to overwrite with data fetched from the web.
          </div>
        </div>

        {/* Column headers */}
        <div style={{
          display: "grid", gridTemplateColumns: "28px 110px 1fr 1fr",
          padding: "6px 18px", borderBottom: "1px solid var(--border)",
          fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
          color: "var(--text-muted)",
        }}>
          <span />
          <span>Field</span>
          <span>Current</span>
          <span>From Web</span>
        </div>

        {/* Rows */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {localRows.map((row, i) => {
            const badge = KIND_BADGE[row.kind];
            const isSelectable = row.kind !== "same";
            return (
              <div
                key={row.key}
                onClick={() => isSelectable && toggle(i)}
                style={{
                  display: "grid", gridTemplateColumns: "28px 110px 1fr 1fr",
                  padding: "7px 18px", alignItems: "start",
                  background: KIND_BG[row.kind],
                  borderBottom: "1px solid var(--border)",
                  cursor: isSelectable ? "pointer" : "default",
                  opacity: row.kind === "same" ? 0.5 : 1,
                }}
              >
                {/* Checkbox */}
                <div style={{ paddingTop: 1 }}>
                  {isSelectable && (
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={() => toggle(i)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                    />
                  )}
                </div>

                {/* Field label + kind badge */}
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-bright)", fontWeight: 500 }}>{row.label}</div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: badge.color, letterSpacing: "0.04em" }}>
                    {badge.label}
                  </span>
                </div>

                {/* Current value */}
                <div style={{ fontSize: 11, color: "var(--text-secondary)", paddingRight: 12 }}>
                  <FieldValue fieldKey={row.key} value={row.currentVal} />
                </div>

                {/* Fetched value */}
                <div style={{
                  fontSize: 11, paddingRight: 4,
                  color: row.kind === "new" ? "#22c55e" : row.kind === "changed" ? "#f59e0b" : "var(--text-secondary)",
                  fontWeight: row.kind !== "same" ? 500 : 400,
                }}>
                  <FieldValue fieldKey={row.key} value={row.fetchedVal} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 18px", borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          {/* Select all/none */}
          <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
            <button
              onClick={() => selectAll(true)}
              disabled={allChecked}
              style={{ background: "none", border: "none", cursor: allChecked ? "default" : "pointer",
                color: allChecked ? "var(--text-muted)" : "var(--accent)", fontSize: 11, padding: 0 }}
            >All</button>
            <span>·</span>
            <button
              onClick={() => selectAll(false)}
              disabled={noneChecked}
              style={{ background: "none", border: "none", cursor: noneChecked ? "default" : "pointer",
                color: noneChecked ? "var(--text-muted)" : "var(--accent)", fontSize: 11, padding: 0 }}
            >None</button>
          </div>

          <div style={{ flex: 1 }} />

          <button
            onClick={onCancel}
            style={{
              background: "var(--bg-input)", border: "1px solid var(--border)",
              color: "var(--text-bright)", borderRadius: 4, padding: "5px 14px",
              cursor: "pointer", fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(localRows.filter((r) => r.selected))}
            disabled={selectedCount === 0}
            style={{
              background: selectedCount === 0 ? "var(--bg-input)" : "var(--accent)",
              border: "none", color: selectedCount === 0 ? "var(--text-muted)" : "#fff",
              borderRadius: 4, padding: "5px 14px", cursor: selectedCount === 0 ? "default" : "pointer",
              fontSize: 12, fontWeight: 600,
            }}
          >
            Import Selected ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  );
}

function buildMiniMapSrc(lat: number | undefined, lng: number | undefined): string | null {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;
  const delta = 0.05;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

export function SiteInfoEditor() {
  const { selectedSiteId, sites, siteDb, updateSiteDb, setSites } = useFlightStore();

  const site = sites.find((s) => s.id === selectedSiteId);
  const dbEntry = selectedSiteId ? siteDb[selectedSiteId] : undefined;

  const buildDraft = (): Draft => ({
    displayName: dbEntry?.userRename ?? dbEntry?.geocodedName ?? site?.name ?? "",
    siteInfo: dbEntry?.siteInfo ? { ...dbEntry.siteInfo } : {},
  });

  const [draft, setDraft] = useState<Draft>(buildDraft);
  const [urlInput, setUrlInput] = useState(dbEntry?.siteInfo?.siteGuideUrl ?? "");
  const [parseStatus, setParseStatus] = useState<ParseStatus>("idle");
  const [parseMsg, setParseMsg] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingMerge, setPendingMerge] = useState<{ fetched: Partial<SiteInfo>; rows: MergeRow[] } | null>(null);
  const [miniMapSrc, setMiniMapSrc] = useState<string | null>(
    buildMiniMapSrc(dbEntry?.siteInfo?.lat, dbEntry?.siteInfo?.lng)
  );
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);

  // Reset when selected site changes
  useEffect(() => {
    const d = buildDraft();
    setDraft(d);
    setUrlInput(dbEntry?.siteInfo?.siteGuideUrl ?? "");
    setMiniMapSrc(buildMiniMapSrc(d.siteInfo.lat, d.siteInfo.lng));
    setParseStatus("idle");
    setParseMsg("");
    setPendingMerge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSiteId]);

  const patchInfo = (patch: Partial<SiteInfo>) =>
    setDraft((d) => ({ ...d, siteInfo: { ...d.siteInfo, ...patch } }));

  const handleLatLngBlur = () => {
    setMiniMapSrc(buildMiniMapSrc(draft.siteInfo.lat, draft.siteInfo.lng));
  };

  const handlePullFromWeb = async () => {
    const url = urlInput.trim();
    if (!url) { setParseMsg("Enter a URL first."); setParseStatus("error"); return; }
    setParseStatus("fetching");
    setParseMsg("Fetching…");
    try {
      const parsed = await fetchAndParseSiteInfo(url);
      const hasSiteData = Boolean(
        draft.siteInfo.officialName || draft.siteInfo.status || draft.siteInfo.type ||
        draft.siteInfo.region || draft.siteInfo.country || draft.siteInfo.description
      );
      if (hasSiteData) {
        // Existing data — show merge modal so user can choose what to overwrite
        const rows = buildMergeRows(draft.siteInfo, parsed);
        setPendingMerge({ fetched: parsed, rows });
        setParseStatus("idle");
        setParseMsg("");
      } else {
        // First-time pull — apply everything directly
        setDraft((d) => ({ ...d, siteInfo: { ...d.siteInfo, ...parsed } }));
        setMiniMapSrc(buildMiniMapSrc(parsed.lat, parsed.lng));
        setParseStatus("success");
        setParseMsg("Parsed — review and save.");
      }
    } catch (e) {
      setParseStatus("error");
      setParseMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleApplyMerge = (selectedRows: MergeRow[]) => {
    if (!pendingMerge) return;
    const patch: Partial<SiteInfo> = {};
    for (const row of selectedRows) {
      (patch as Record<string, unknown>)[row.key] = pendingMerge.fetched[row.key];
    }
    setDraft((d) => ({ ...d, siteInfo: { ...d.siteInfo, ...patch } }));
    if (patch.lat !== undefined || patch.lng !== undefined) {
      const newInfo = { ...draft.siteInfo, ...patch };
      setMiniMapSrc(buildMiniMapSrc(newInfo.lat, newInfo.lng));
    }
    setPendingMerge(null);
    setParseStatus("success");
    setParseMsg(`Imported ${selectedRows.length} field${selectedRows.length !== 1 ? "s" : ""} — review and save.`);
  };

  const handleSave = async () => {
    if (!selectedSiteId) return;
    const updatedDb = updateSiteDb(selectedSiteId, {
      userRename: draft.displayName || undefined,
      siteInfo: { ...draft.siteInfo, siteGuideUrl: urlInput.trim() || draft.siteInfo.siteGuideUrl },
    });
    await saveSiteDb(updatedDb);
    // Reflect name change in sites list
    setSites(sites.map((s) =>
      s.id === selectedSiteId ? { ...s, name: draft.displayName || s.name } : s
    ));
    // Show save confirmation
    setSavedAt(Date.now());
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedAt(null), 2500);
  };

  const handleRevert = () => {
    const d = buildDraft();
    setDraft(d);
    setUrlInput(dbEntry?.siteInfo?.siteGuideUrl ?? "");
    setMiniMapSrc(buildMiniMapSrc(d.siteInfo.lat, d.siteInfo.lng));
    setParseStatus("idle");
    setParseMsg("");
  };

  if (!selectedSiteId || !site) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 13 }}>
        Select a site from the list to view or edit its details.
      </div>
    );
  }

  const { siteInfo } = draft;
  const status = siteInfo.status;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 20px", boxSizing: "border-box" }}>

      {/* Name + status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <input
          value={draft.displayName}
          onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
          placeholder="Display name"
          style={{ ...inputStyle, fontSize: 16, fontWeight: 600, padding: "5px 8px", flex: 1 }}
        />
        {status === "open" && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", border: "1px solid #22c55e55", borderRadius: 4, padding: "3px 7px", flexShrink: 0 }}>
            ● OPEN
          </span>
        )}
        {status === "closed" && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", border: "1px solid #ef444455", borderRadius: 4, padding: "3px 7px", flexShrink: 0 }}>
            ✕ CLOSED
          </span>
        )}
      </div>

      {siteInfo.officialName && siteInfo.officialName !== draft.displayName && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
          Site Guide name: <em>{siteInfo.officialName}</em>
        </div>
      )}

      {/* Region / Country / State */}
      <div style={sectionStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div>
            <label style={labelStyle}>Region</label>
            <input value={siteInfo.region ?? ""} onChange={(e) => patchInfo({ region: e.target.value })} placeholder="e.g. Victoria > East Inland" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Country</label>
            <input value={siteInfo.country ?? ""} onChange={(e) => patchInfo({ country: e.target.value })} placeholder="e.g. Australia" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>State</label>
            <input value={siteInfo.state ?? ""} onChange={(e) => patchInfo({ state: e.target.value })} placeholder="e.g. Victoria" style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Type */}
      <div style={{ marginTop: 10 }}>
        <label style={labelStyle}>Type</label>
        <select
          value={siteInfo.type ?? ""}
          onChange={(e) => patchInfo({ type: e.target.value || undefined })}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          <option value="">— select —</option>
          <option>Inland</option>
          <option>Coastal</option>
          <option>Mountain</option>
          <option>Other</option>
        </select>
      </div>

      {/* Lat / Lng + mini-map */}
      <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label style={labelStyle}>Latitude</label>
              <input
                ref={latRef}
                type="number"
                step="0.00001"
                value={siteInfo.lat ?? ""}
                onChange={(e) => patchInfo({ lat: e.target.value ? parseFloat(e.target.value) : undefined })}
                onBlur={handleLatLngBlur}
                placeholder="-37.12269"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Longitude</label>
              <input
                ref={lngRef}
                type="number"
                step="0.00001"
                value={siteInfo.lng ?? ""}
                onChange={(e) => patchInfo({ lng: e.target.value ? parseFloat(e.target.value) : undefined })}
                onBlur={handleLatLngBlur}
                placeholder="145.41304"
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div>
              <label style={labelStyle}>Conditions</label>
              <input value={siteInfo.conditions ?? ""} onChange={(e) => patchInfo({ conditions: e.target.value })} placeholder="e.g. NW–NE" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Height</label>
              <input value={siteInfo.height ?? ""} onChange={(e) => patchInfo({ height: e.target.value })} placeholder="e.g. 340m / 1115ft" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Rating</label>
              <input value={siteInfo.rating ?? ""} onChange={(e) => patchInfo({ rating: e.target.value })} placeholder="e.g. PG2" style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Mini-map */}
        {miniMapSrc && (
          <div style={{ flexShrink: 0 }}>
            <label style={labelStyle}>Map</label>
            <iframe
              src={miniMapSrc}
              width={200}
              height={150}
              style={{ border: "1px solid var(--border)", borderRadius: 4, display: "block" }}
              title="Site location"
            />
          </div>
        )}
      </div>

      {/* Description */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Description</label>
        <textarea
          value={siteInfo.description ?? ""}
          onChange={(e) => patchInfo({ description: e.target.value })}
          placeholder="Site details, hazards, local knowledge…"
          rows={6}
          style={{ ...inputStyle, resize: "vertical", minHeight: 120, fontFamily: "inherit", lineHeight: 1.5 }}
        />
      </div>

      {/* Pull from Web */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Site Guide URL</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://siteguide.org.au/Sites/Details/…"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={handlePullFromWeb}
            disabled={parseStatus === "fetching"}
            title={siteInfo.siteGuideUrl ? "Refresh from stored URL" : "Pull from web"}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "var(--bg-input)", border: "1px solid var(--border)",
              color: "var(--text-bright)", borderRadius: 4, padding: "4px 10px",
              cursor: parseStatus === "fetching" ? "default" : "pointer", fontSize: 12, flexShrink: 0,
            }}
          >
            {parseStatus === "fetching"
              ? <Loader size={13} style={{ animation: "spin 1s linear infinite" }} />
              : <Globe size={13} />}
            {siteInfo.siteGuideUrl ? "Refresh" : "Pull from Web"}
          </button>
        </div>
        {parseMsg && (
          <div style={{
            marginTop: 5, fontSize: 11,
            color: parseStatus === "error" ? "#ef4444" : parseStatus === "success" ? "#22c55e" : "var(--text-muted)",
          }}>
            {parseMsg}
          </div>
        )}
      </div>

      {/* Save / Revert */}
      <div style={{ ...sectionStyle, display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={handleSave}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "var(--accent)", border: "none",
            color: "#fff", borderRadius: 4, padding: "5px 14px",
            cursor: "pointer", fontSize: 12, fontWeight: 600,
            transform: savedAt ? "scale(1.06)" : "scale(1)",
            transition: "transform 0.15s ease",
          }}
        >
          <Save size={13} /> Save
        </button>
        <button
          onClick={handleRevert}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "var(--bg-input)", border: "1px solid var(--border)",
            color: "var(--text-bright)", borderRadius: 4, padding: "5px 14px",
            cursor: "pointer", fontSize: 12,
          }}
        >
          <RotateCcw size={13} /> Revert
        </button>
        <span style={{
          fontSize: 11, color: "#22c55e",
          opacity: savedAt ? 1 : 0,
          transition: "opacity 0.4s ease",
          pointerEvents: "none",
        }}>
          Changes saved
        </span>
      </div>

      {/* Merge modal — shown when existing data + refresh triggered */}
      {pendingMerge && (
        <MergeModal
          rows={pendingMerge.rows}
          onApply={handleApplyMerge}
          onCancel={() => { setPendingMerge(null); setParseStatus("idle"); setParseMsg(""); }}
        />
      )}
    </div>
  );
}
