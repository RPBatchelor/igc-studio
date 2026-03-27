import { invoke } from "@tauri-apps/api/core";
import type { SgZone } from "../parsers/types";
import { loadCached, saveCached } from "./cacheManager";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_URL    = "https://siteguide.org.au/Downloads/XCTrackJson";
const CACHE_FILE  = "siteguide-zones-cache.json";
const CACHE_TTL   = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// Colour scheme by zone class
// ---------------------------------------------------------------------------

const ZONE_STYLE: Record<string, { fill: string; outline: string }> = {
  "LZ":        { fill: "#1188FF", outline: "#0055CC" },  // Landing Zone
  "EmgyLZ":    { fill: "#FFAA00", outline: "#CC7700" },  // Emergency Landing Zone
  "NoLZ":      { fill: "#FF1111", outline: "#CC0000" },  // No Landing Zone
  "NoFly":     { fill: "#CC0000", outline: "#990000" },  // No Fly
  "NoLaunch":  { fill: "#FF6600", outline: "#CC4400" },  // No Launch
  "Powerline": { fill: "#FFEE00", outline: "#BBAA00" },  // Powerline
  "Haz":       { fill: "#FF8800", outline: "#CC5500" },  // Hazard
  "Feature":   { fill: "#888888", outline: "#555555" },  // Generic feature
  "default":   { fill: "#888888", outline: "#555555" },
};

export const ZONE_DISPLAY_NAMES: Record<string, string> = {
  "LZ":        "Landing Zone",
  "EmgyLZ":    "Emergency Landing",
  "NoLZ":      "No Landing Zone",
  "NoFly":     "No Fly Zone",
  "NoLaunch":  "No Launch Zone",
  "Powerline": "Powerline",
  "Haz":       "Hazard",
  "Feature":   "Feature",
};

export function sgZoneDisplayName(zoneClass: string): string {
  return ZONE_DISPLAY_NAMES[zoneClass] ?? zoneClass;
}

export function sgZoneStyle(zoneClass: string): { fill: string; outline: string } {
  // Try exact match first, then case-insensitive
  if (ZONE_STYLE[zoneClass]) return ZONE_STYLE[zoneClass];
  const lower = zoneClass.toLowerCase();
  const key = Object.keys(ZONE_STYLE).find((k) => k.toLowerCase() === lower);
  return (key ? ZONE_STYLE[key] : null) ?? ZONE_STYLE.default;
}

// ---------------------------------------------------------------------------
// JSON shape returned by siteguide.org.au/Downloads/XCTrackJson
// ---------------------------------------------------------------------------

interface RawAirspace {
  airchecktype: string;
  airpen: number[];        // [?, lineWidth, R, G, B]
  airbrush: number[];      // [R, G, B]
  airupper: { type: string; height: number };
  airlower: { type: string; height: number };
  airname: string;
  components: [number, number][];  // [lat, lng] pairs
  aircatpg: boolean;
  airclass: string;
  descriptions: Record<string, unknown>;
}

interface RawResponse {
  airspaces: RawAirspace[];
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

function parseSgZonesJson(raw: unknown): SgZone[] {
  const data = raw as RawResponse;
  if (!data?.airspaces) return [];

  const zones: SgZone[] = [];
  const uniqueClasses = new Set<string>();
  data.airspaces.forEach((a, i) => {
    if (!a.components || a.components.length < 3) return;
    uniqueClasses.add(a.airclass);
    zones.push({
      id:       `${a.airclass}-${a.airname.replace(/\s+/g, "")}-${i}`,
      name:     a.airname,
      class:    a.airclass,
      checkType: a.airchecktype,
      polygon:  a.components.map(([lat, lng]) => ({ lat, lng })),
    });
  });
  console.log("[sgZones] unique airclass values:", [...uniqueClasses].sort());
  return zones;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

interface SgZonesCache {
  zones: SgZone[];
  fetchedAt: number;
}

async function loadCache(): Promise<SgZonesCache | null> {
  return loadCached<SgZonesCache>(CACHE_FILE);
}

async function saveCache(data: SgZonesCache): Promise<void> {
  return saveCached(CACHE_FILE, data);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function loadSgZones(force = false): Promise<{
  zones: SgZone[];
  fromCache: boolean;
  fetchedAt: number | null;
  error?: string;
}> {
  const cached = await loadCache();

  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return { zones: cached.zones, fromCache: true, fetchedAt: cached.fetchedAt };
  }

  try {
    const text     = await invoke<string>("fetch_url_text", { url: DATA_URL });
    const raw      = JSON.parse(text) as unknown;
    const zones    = parseSgZonesJson(raw);
    const fetchedAt = Date.now();
    await saveCache({ zones, fetchedAt });
    return { zones, fromCache: false, fetchedAt };
  } catch (e) {
    if (cached) {
      return { zones: cached.zones, fromCache: true, fetchedAt: cached.fetchedAt, error: String(e) };
    }
    return { zones: [], fromCache: false, fetchedAt: null, error: String(e) };
  }
}

export { parseSgZonesJson, loadCache as loadSgZonesCache, saveCache as saveSgZonesCache };
