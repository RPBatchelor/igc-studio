import { useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useFlightStore } from "../../stores/flightStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { scanLogbook } from "../../lib/logbookScanner";
import { LogbookTimeline } from "./LogbookTimeline";
import type { LogbookEntry } from "../../parsers/types";
import { BookOpen, Clock, Route, Mountain, TrendingUp, TrendingDown, Gauge, CalendarDays } from "lucide-react";

function fileExt(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

// ── helpers ──────────────────────────────────────────────────────────────────

function formatAirtime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

type FilterMode = "all" | "12months" | "custom";

function applyFilter(entries: LogbookEntry[], mode: FilterMode, fromDate: string): LogbookEntry[] {
  if (mode === "all") return entries;
  const cutoff =
    mode === "12months"
      ? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : fromDate;
  if (!cutoff) return entries;
  return entries.filter((e) => e.date >= cutoff);
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "var(--accent)",
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 600 }}>
        <Icon size={13} color={color} />
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text-bright)" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{sub}</div>
      )}
    </div>
  );
}

function BestCard({
  icon: Icon,
  label,
  value,
  meta,
  color = "var(--accent)",
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  meta: string;
  color?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 600 }}>
        <Icon size={12} color={color} />
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-bright)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {meta}
      </div>
    </div>
  );
}

const BAR_COLORS = ["#4fc3f7", "#81c784", "#ce93d8", "#ffb74d", "#f48fb1"];

// ── main component ────────────────────────────────────────────────────────────

export function LogbookView() {
  const {
    sites,
    logbookEntries,
    logbookLoading,
    logbookProgress,
    logbookFilterMode: filterMode,
    logbookFromDate: fromDate,
    setLogbookEntries,
    setLogbookLoading,
    setLogbookProgress,
    setLogbookFilterMode: setFilterMode,
    setLogbookFromDate: setFromDate,
    visibleFileTypes,
    setActiveView,
  } = useFlightStore();
  const { loadFile } = useFileSystem();

  const handleGoToFlight = useCallback((entry: LogbookEntry) => {
    const name = entry.path.replace(/\\/g, "/").split("/").pop() ?? "";
    loadFile(entry.path, name);
    setActiveView("explorer");
  }, [loadFile, setActiveView]);

  // Fallback: trigger scan if somehow entries are still null when the tab opens
  // (normally the scan starts in the background as soon as the folder is opened)
  useEffect(() => {
    if (logbookEntries !== null || logbookLoading || sites.length === 0) return;
    setLogbookLoading(true);
    setLogbookProgress({ done: 0, total: sites.reduce((n, s) => n + s.flights.length, 0) });
    scanLogbook(sites, (done, total) => setLogbookProgress({ done, total }))
      .then((entries) => {
        setLogbookEntries(entries);
        setLogbookProgress(null);
      })
      .finally(() => setLogbookLoading(false));
  }, [sites, logbookEntries, logbookLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "1px",
    color: "var(--text-muted)",
    marginBottom: 10,
  };

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px",
    borderRadius: 4,
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent)" : "var(--bg-tertiary)",
    color: active ? "#fff" : "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  });

  // ── empty / no folder state ──────────────────────────────────────────────
  if (sites.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "var(--text-muted)" }}>
        <BookOpen size={40} strokeWidth={1.2} />
        <div style={{ fontSize: 14 }}>Open a folder to build your logbook</div>
      </div>
    );
  }

  // ── loading state ────────────────────────────────────────────────────────
  if (logbookLoading) {
    const { done = 0, total = 1 } = logbookProgress ?? {};
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, color: "var(--text-secondary)" }}>
        <BookOpen size={40} strokeWidth={1.2} color="var(--accent)" />
        <div style={{ fontSize: 14, fontWeight: 600 }}>Scanning flights…</div>
        <div style={{ width: 280, background: "var(--bg-tertiary)", borderRadius: 4, height: 6, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", transition: "width 0.2s" }} />
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{done} / {total} flights</div>
      </div>
    );
  }

  // ── no entries after scan ────────────────────────────────────────────────
  if (!logbookEntries || logbookEntries.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "var(--text-muted)" }}>
        <BookOpen size={40} strokeWidth={1.2} />
        <div style={{ fontSize: 14 }}>No flights found</div>
      </div>
    );
  }

  const typeFiltered = logbookEntries.filter((e) => {
    const ext = fileExt(e.path);
    if (ext === "igc") return visibleFileTypes.has("igc");
    if (ext === "kml") return visibleFileTypes.has("kml");
    return false; // exclude .bak and any other unexpected types
  });
  const filtered = applyFilter(typeFiltered, filterMode, fromDate);

  // ── aggregate stats ──────────────────────────────────────────────────────
  const totalFlights = filtered.length;
  const totalAirtime = filtered.reduce((s, e) => s + e.duration, 0);
  const totalDistance = filtered.reduce((s, e) => s + e.distance, 0);

  const longestFlight = filtered.reduce<LogbookEntry | null>(
    (best, e) => (best === null || e.duration > best.duration ? e : best), null,
  );
  const farthestFlight = filtered.reduce<LogbookEntry | null>(
    (best, e) => (best === null || e.distance > best.distance ? e : best), null,
  );
  const highestFlight = filtered.reduce<LogbookEntry | null>(
    (best, e) => (best === null || e.maxAltitude > best.maxAltitude ? e : best), null,
  );
  const bestClimbFlight = filtered.reduce<LogbookEntry | null>(
    (best, e) => (best === null || e.maxClimb > best.maxClimb ? e : best), null,
  );

  // Top 5 locations by flight count
  const siteCountMap: Record<string, { name: string; count: number }> = {};
  for (const e of filtered) {
    if (!siteCountMap[e.siteId]) siteCountMap[e.siteId] = { name: e.siteName, count: 0 };
    siteCountMap[e.siteId].count++;
  }
  const topSites = Object.values(siteCountMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 24, background: "var(--bg-primary)" }}>

      {/* Header + filter */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BookOpen size={20} color="var(--accent)" />
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text-bright)" }}>Flight Logbook</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button style={filterBtnStyle(filterMode === "all")} onClick={() => setFilterMode("all")}>All Time</button>
          <button style={filterBtnStyle(filterMode === "12months")} onClick={() => setFilterMode("12months")}>Last 12 Months</button>
          <button style={filterBtnStyle(filterMode === "custom")} onClick={() => setFilterMode("custom")}>From Date</button>
          {filterMode === "custom" && (
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                color: "var(--text-bright)",
                borderRadius: 4,
                padding: "5px 8px",
                fontSize: 12,
                cursor: "pointer",
              }}
            />
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div>
        <div style={sectionLabel}>Summary</div>
        <div style={{ display: "flex", gap: 12 }}>
          <StatCard icon={CalendarDays} label="Total Flights"  value={String(totalFlights)} color="#4fc3f7" />
          <StatCard icon={Clock}        label="Total Airtime"  value={formatAirtime(totalAirtime)} color="#81c784" />
          <StatCard icon={Route}        label="Total Distance" value={`${totalDistance.toFixed(0)} km`} color="#ce93d8" />
        </div>
      </div>

      {/* Personal bests */}
      <div>
        <div style={sectionLabel}>Personal Bests</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <BestCard
            icon={Clock}
            label="Longest Flight"
            value={longestFlight ? formatAirtime(longestFlight.duration) : "—"}
            meta={longestFlight ? `${longestFlight.siteName} · ${formatDate(longestFlight.date)}` : ""}
            color="#81c784"
          />
          <BestCard
            icon={Route}
            label="Farthest Flight"
            value={farthestFlight ? `${farthestFlight.distance.toFixed(1)} km` : "—"}
            meta={farthestFlight ? `${farthestFlight.siteName} · ${formatDate(farthestFlight.date)}` : ""}
            color="#ce93d8"
          />
          <BestCard
            icon={Mountain}
            label="Max Altitude"
            value={highestFlight ? `${Math.round(highestFlight.maxAltitude)} m` : "—"}
            meta={highestFlight ? `${highestFlight.siteName} · ${formatDate(highestFlight.date)}` : ""}
            color="#ffb74d"
          />
          <BestCard
            icon={TrendingUp}
            label="Best Climb"
            value={bestClimbFlight ? `+${bestClimbFlight.maxClimb.toFixed(1)} m/s` : "—"}
            meta={bestClimbFlight ? `${bestClimbFlight.siteName} · ${formatDate(bestClimbFlight.date)}` : ""}
            color="#f48fb1"
          />
        </div>
      </div>

      {/* Top locations chart */}
      {topSites.length > 0 && (
        <div style={{ flex: 1, minHeight: 200 }}>
          <div style={sectionLabel}>Top Locations</div>
          <div style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 8, padding: "16px 8px 8px" }}>
            <ResponsiveContainer width="100%" height={Math.max(160, topSites.length * 44)}>
              <BarChart
                data={topSites}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 8 }}
              >
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  tick={{ fontSize: 12, fill: "var(--text-primary)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  contentStyle={{
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    fontSize: 12,
                    color: "var(--text-primary)",
                  }}
                  formatter={(v) => [`${v} flights`, "Flights"]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {topSites.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Vario bests */}
      <div>
        <div style={sectionLabel}>Vario Records</div>
        <div style={{ display: "flex", gap: 12 }}>
          <StatCard
            icon={TrendingUp}
            label="Best Climb"
            value={bestClimbFlight ? `+${bestClimbFlight.maxClimb.toFixed(1)} m/s` : "—"}
            color="#81c784"
          />
          <StatCard
            icon={TrendingDown}
            label="Max Sink"
            value={(() => {
              const e = filtered.reduce<LogbookEntry | null>(
                (best, x) => (best === null || x.maxSink < best.maxSink ? x : best), null,
              );
              return e ? `${e.maxSink.toFixed(1)} m/s` : "—";
            })()}
            color="#f48fb1"
          />
          <StatCard
            icon={Gauge}
            label="Avg Flights / Month"
            value={(() => {
              const datedFlights = filtered.filter((e) => e.date);
              if (datedFlights.length === 0) return "—";
              const dates = datedFlights.map((e) => e.date).sort();
              const spanMs = new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime();
              const spanMonths = Math.max(1, spanMs / (30 * 24 * 60 * 60 * 1000));
              return (datedFlights.length / spanMonths).toFixed(1);
            })()}
            color="#4fc3f7"
          />
        </div>
      </div>

      {/* Flight timeline */}
      {filtered.some((e) => e.date) && (
        <div>
          <div style={sectionLabel}>Flight Timeline</div>
          <div style={{
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "16px 16px 8px",
            overflow: "visible",
          }}>
            <LogbookTimeline entries={filtered} onGoToFlight={handleGoToFlight} />
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-muted)" }}>
            Stem height = flight duration · Colour = launch site
          </div>
        </div>
      )}

    </div>
  );
}
