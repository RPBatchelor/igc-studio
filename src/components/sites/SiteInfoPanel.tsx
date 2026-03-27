import { MapPin, Plus, Loader } from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import { saveSiteDb } from "../../lib/siteDb";
import type { LocationSite } from "../../parsers/types";

const TYPE_ORDER = ["Inland", "Coastal", "Mountain", "Other", "Unknown"];

export function SiteInfoPanel() {
  const {
    sites, sitesLoading, selectedSiteId, setSelectedSiteId,
    setSites, siteDb, updateSiteDb,
    groupSitesByType,
    siteFilterSearch, siteFilterStatus, siteFilterType,
    siteFilterCountry, siteFilterState, siteFilterRating,
  } = useFlightStore();

  const handleAddSite = async () => {
    const id = `manual-${Date.now()}`;
    const newSite: LocationSite = { id, name: "New Site", lat: 0, lng: 0, flights: [] };
    const newSites = [...sites, newSite];
    setSites(newSites);
    const updatedDb = updateSiteDb(id, { userRename: "New Site", siteInfo: {} });
    await saveSiteDb(updatedDb);
    setSelectedSiteId(id);
  };

  // Resolve display name and apply filters, then sort alphabetically
  const filtered = sites
    .map((site) => {
      const dbEntry = siteDb[site.id];
      const displayName = dbEntry?.userRename ?? dbEntry?.geocodedName ?? site.name;
      const info = dbEntry?.siteInfo;
      return { site, dbEntry, displayName, info };
    })
    .filter(({ displayName, info }) => {
      if (siteFilterSearch && !displayName.toLowerCase().includes(siteFilterSearch.toLowerCase())) return false;
      if (siteFilterStatus !== "any" && info?.status !== siteFilterStatus) return false;
      if (siteFilterType && info?.type !== siteFilterType) return false;
      if (siteFilterCountry && info?.country !== siteFilterCountry) return false;
      if (siteFilterState && info?.state !== siteFilterState) return false;
      if (siteFilterRating && info?.rating !== siteFilterRating) return false;
      return true;
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));

  const hasActiveFilters = siteFilterSearch || siteFilterStatus !== "any" ||
    siteFilterType || siteFilterCountry || siteFilterState || siteFilterRating;

  // Group by type if setting on
  type Group = { label: string; items: typeof filtered };
  const groups: Group[] = groupSitesByType
    ? (() => {
        const buckets: Record<string, typeof filtered> = {};
        for (const row of filtered) {
          const t = row.info?.type ?? "Unknown";
          const key = TYPE_ORDER.slice(0, -1).includes(t) ? t : "Unknown";
          (buckets[key] ??= []).push(row);
        }
        const keys = [...TYPE_ORDER.filter((k) => buckets[k])];
        return keys.map((label) => ({ label, items: buckets[label] }));
      })()
    : [{ label: "", items: filtered }];

  const renderItem = ({ site, displayName, info }: typeof filtered[number]) => {
    const isSelected = site.id === selectedSiteId;
    const status = info?.status;
    return (
      <div
        key={site.id}
        onClick={() => setSelectedSiteId(site.id)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 12px", cursor: "pointer",
          background: isSelected ? "var(--bg-selected)" : "transparent",
          borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
        }}
      >
        <MapPin size={13} color={isSelected ? "var(--accent)" : "var(--text-muted)"} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, color: "var(--text-bright)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayName}
        </span>
        {status === "closed" && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "#ef4444", border: "1px solid #ef444433", borderRadius: 3, padding: "1px 4px", flexShrink: 0 }}>
            CLOSED
          </span>
        )}
        {status === "open" && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "#22c55e", border: "1px solid #22c55e33", borderRadius: 3, padding: "1px 4px", flexShrink: 0 }}>
            OPEN
          </span>
        )}
        {site.flights.length > 0 && (
          <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
            {site.flights.length}
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
          Sites
          {hasActiveFilters && (
            <span style={{ marginLeft: 6, color: "var(--accent)" }}>{filtered.length}/{sites.length}</span>
          )}
        </span>
        <button
          onClick={handleAddSite}
          title="Add new site"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "var(--bg-input)", border: "1px solid var(--border)",
            color: "var(--text-bright)", borderRadius: 4, padding: "3px 8px",
            cursor: "pointer", fontSize: 11,
          }}
        >
          <Plus size={12} />
          Add Site
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {sitesLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", color: "var(--text-muted)", fontSize: 12 }}>
            <Loader size={13} style={{ animation: "spin 1s linear infinite" }} />
            Scanning flights…
          </div>
        )}

        {!sitesLoading && sites.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
            <MapPin size={24} style={{ margin: "0 auto 8px", display: "block", opacity: 0.4 }} />
            No sites yet.<br />
            Open a flight folder or add a site manually.
          </div>
        )}

        {!sitesLoading && sites.length > 0 && filtered.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
            No sites match the current filters.
          </div>
        )}

        {groups.map(({ label, items }, gi) => (
          <div key={label || "__all"}>
            {label && (
              <div style={{
                padding: "6px 12px 3px",
                fontSize: 10, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.06em",
                color: "var(--text-muted)",
                borderTop: gi === 0 ? "none" : "1px solid var(--border)",
                marginTop: gi === 0 ? 0 : 4,
              }}>
                {label}
              </div>
            )}
            {items.map(renderItem)}
          </div>
        ))}
      </div>
    </div>
  );
}
