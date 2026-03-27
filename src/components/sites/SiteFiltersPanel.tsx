import { useMemo } from "react";
import { X } from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";

const selectStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  color: "var(--text-bright)",
  padding: "4px 6px",
  borderRadius: 4,
  fontSize: 12,
  outline: "none",
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  marginBottom: 3,
  display: "block",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 14,
};

export function SiteFiltersPanel() {
  const {
    sites, siteDb,
    siteFilterSearch, setSiteFilterSearch,
    siteFilterStatus, setSiteFilterStatus,
    siteFilterType,   setSiteFilterType,
    siteFilterCountry, setSiteFilterCountry,
    siteFilterState,  setSiteFilterState,
    siteFilterRating, setSiteFilterRating,
    clearSiteFilters,
    groupSitesByType, setGroupSitesByType,
  } = useFlightStore();

  // Build unique option lists from actual data
  const options = useMemo(() => {
    const countries = new Set<string>();
    const states    = new Set<string>();
    const types     = new Set<string>();
    const ratings   = new Set<string>();
    for (const site of sites) {
      const info = siteDb[site.id]?.siteInfo;
      if (info?.country) countries.add(info.country);
      if (info?.state)   states.add(info.state);
      if (info?.type)    types.add(info.type);
      if (info?.rating)  ratings.add(info.rating);
    }
    const TYPE_ORDER = ["Inland", "Coastal", "Mountain", "Other"];
    return {
      countries: [...countries].sort(),
      states:    [...states].sort(),
      types:     TYPE_ORDER.filter((t) => types.has(t)),
      ratings:   [...ratings].sort(),
    };
  }, [sites, siteDb]);

  const hasActiveFilters = siteFilterSearch || siteFilterStatus !== "any" ||
    siteFilterType || siteFilterCountry || siteFilterState || siteFilterRating;

  const activeCount = [
    siteFilterSearch,
    siteFilterStatus !== "any" ? siteFilterStatus : "",
    siteFilterType, siteFilterCountry, siteFilterState, siteFilterRating,
  ].filter(Boolean).length;

  return (
    <div style={{ padding: "12px 14px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
          Filters {activeCount > 0 && <span style={{ color: "var(--accent)" }}>({activeCount})</span>}
        </span>
        {hasActiveFilters && (
          <button
            onClick={clearSiteFilters}
            title="Clear all filters"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "none", border: "1px solid var(--border)",
              color: "var(--text-muted)", borderRadius: 4, padding: "2px 7px",
              cursor: "pointer", fontSize: 11,
            }}
          >
            <X size={11} /> Clear
          </button>
        )}
      </div>

      {/* Search */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Search</label>
        <input
          type="text"
          value={siteFilterSearch}
          onChange={(e) => setSiteFilterSearch(e.target.value)}
          placeholder="Site name…"
          style={{ ...selectStyle, cursor: "text" }}
        />
      </div>

      {/* Status */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Status</label>
        <div style={{ display: "flex", gap: 6 }}>
          {(["any", "open", "closed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSiteFilterStatus(s)}
              style={{
                flex: 1, padding: "4px 0", borderRadius: 4, fontSize: 11, fontWeight: 600,
                cursor: "pointer", border: "1px solid",
                borderColor: siteFilterStatus === s
                  ? s === "open" ? "#22c55e" : s === "closed" ? "#ef4444" : "var(--accent)"
                  : "var(--border)",
                background: siteFilterStatus === s
                  ? s === "open" ? "#22c55e22" : s === "closed" ? "#ef444422" : "var(--accent-dim, #0078d422)"
                  : "transparent",
                color: siteFilterStatus === s
                  ? s === "open" ? "#22c55e" : s === "closed" ? "#ef4444" : "var(--accent)"
                  : "var(--text-muted)",
                textTransform: "capitalize",
              }}
            >
              {s === "any" ? "Any" : s === "open" ? "● Open" : "✕ Closed"}
            </button>
          ))}
        </div>
      </div>

      {/* Type */}
      {options.types.length > 0 && (
        <div style={sectionStyle}>
          <label style={labelStyle}>Type</label>
          <select value={siteFilterType} onChange={(e) => setSiteFilterType(e.target.value)} style={selectStyle}>
            <option value="">All types</option>
            {options.types.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      )}

      {/* Country */}
      {options.countries.length > 0 && (
        <div style={sectionStyle}>
          <label style={labelStyle}>Country</label>
          <select value={siteFilterCountry} onChange={(e) => setSiteFilterCountry(e.target.value)} style={selectStyle}>
            <option value="">All countries</option>
            {options.countries.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* State */}
      {options.states.length > 0 && (
        <div style={sectionStyle}>
          <label style={labelStyle}>State</label>
          <select value={siteFilterState} onChange={(e) => setSiteFilterState(e.target.value)} style={selectStyle}>
            <option value="">All states</option>
            {options.states.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* Rating */}
      {options.ratings.length > 0 && (
        <div style={sectionStyle}>
          <label style={labelStyle}>Rating</label>
          <select value={siteFilterRating} onChange={(e) => setSiteFilterRating(e.target.value)} style={selectStyle}>
            <option value="">All ratings</option>
            {options.ratings.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
      )}

      {/* Divider */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 4 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text-primary)" }}>
          <input
            type="checkbox"
            checked={groupSitesByType}
            onChange={(e) => setGroupSitesByType(e.target.checked)}
            style={{ accentColor: "#0078d4" }}
          />
          Group by type
        </label>
      </div>

      {/* Empty state hint */}
      {options.types.length === 0 && options.countries.length === 0 && (
        <div style={{ marginTop: 14, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
          Pull site details from the Site Guide URL in the editor to populate filter options.
        </div>
      )}
    </div>
  );
}
