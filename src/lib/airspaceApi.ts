import { invoke } from "@tauri-apps/api/core";
import { parseOpenAir, parseValidityDate } from "./airspaceParser";
import type { AirspaceFeature } from "../parsers/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_FILE    = "airspace-cache.json";
const CACHE_TTL_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days

// Lightweight HTML index page — used for version checking only (~10 KB)
const VERSION_CHECK_URL = "https://soaringweb.org/Airspace/AU.html";

// ---------------------------------------------------------------------------
// Cache file path (mirrors settingsDb.ts pattern)
// ---------------------------------------------------------------------------

let baseDir: string | null = null;

async function getBaseDir(): Promise<string> {
  if (!baseDir) {
    const dir = await invoke<string>("get_data_dir");
    baseDir = dir.replace(/\\/g, "/") + "/igc-studio";
  }
  return baseDir;
}

// ---------------------------------------------------------------------------
// Cache types + read/write
// ---------------------------------------------------------------------------

export interface AirspaceCache {
  features: AirspaceFeature[];
  fetchedAt: number;
  validDate: string | null;
}

export async function loadAirspaceCache(): Promise<AirspaceCache | null> {
  try {
    const path = (await getBaseDir()) + "/" + CACHE_FILE;
    const text = await invoke<string>("read_file_text", { path });
    return JSON.parse(text) as AirspaceCache;
  } catch {
    return null;
  }
}

export async function saveAirspaceCache(data: AirspaceCache): Promise<void> {
  try {
    const path = (await getBaseDir()) + "/" + CACHE_FILE;
    await invoke("write_file_text", { path, content: JSON.stringify(data) });
  } catch (e) {
    console.warn("Failed to save airspace cache:", e);
  }
}

// ---------------------------------------------------------------------------
// Load airspaces — cache-first, network fallback, stale-cache fallback
// ---------------------------------------------------------------------------

export async function loadAirspaces(
  url: string,
  force = false,
): Promise<{
  features: AirspaceFeature[];
  fromCache: boolean;
  fetchedAt: number | null;
  validDate: string | null;
  error?: string;
}> {
  const cached = await loadAirspaceCache();

  // Return fresh cache unless forced
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      features:  cached.features,
      fromCache: true,
      fetchedAt: cached.fetchedAt,
      validDate: cached.validDate ?? null,
    };
  }

  // Fetch from network via Rust backend (bypasses browser CORS)
  try {
    const text      = await invoke<string>("fetch_url_text", { url });
    const features  = parseOpenAir(text);
    const validDate = parseValidityDate(text);
    const fetchedAt = Date.now();
    await saveAirspaceCache({ features, fetchedAt, validDate });
    return { features, fromCache: false, fetchedAt, validDate };
  } catch (e) {
    // Return stale cache if available
    if (cached) {
      return {
        features:  cached.features,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
        validDate: cached.validDate ?? null,
        error:     String(e),
      };
    }
    return { features: [], fromCache: false, fetchedAt: null, validDate: null, error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Background version check — fetches AU.html index and extracts latest date
// Returns a newer date string if an update is available, null otherwise
// ---------------------------------------------------------------------------

export async function checkAirspaceVersion(cachedValidDate: string | null): Promise<string | null> {
  try {
    const html = await invoke<string>("fetch_url_text", { url: VERSION_CHECK_URL });

    // Extract date from filename pattern: australia_class_all_25_11_27.txt
    const m = html.match(/australia_class_all_(\d{2}_\d{2}_\d{2})\.txt/);
    if (!m) return null;
    const latestCode = m[1]; // "25_11_27" = YY_MM_DD

    if (!cachedValidDate) return latestCode; // No cache at all — update available

    // Convert latestCode "25_11_27" → ISO "2025-11-27"
    const [yy, mm, dd] = latestCode.split("_");
    const latestISO = `20${yy}-${mm}-${dd}`;

    // Convert cachedValidDate "27-November-2025" → ISO "2025-11-27"
    const MONTHS: Record<string, string> = {
      january: "01", february: "02", march: "03",    april: "04",
      may:     "05", june:     "06", july:   "07",   august: "08",
      september:"09",october:  "10", november:"11",  december:"12",
    };
    const cachedMatch = cachedValidDate.match(/(\d{1,2})-(\w+)-(\d{4})/i);
    if (!cachedMatch) return latestCode; // Can't parse cache date — assume update
    const cachedISO = `${cachedMatch[3]}-${MONTHS[cachedMatch[2].toLowerCase()] ?? "01"}-${cachedMatch[1].padStart(2, "0")}`;

    return latestISO > cachedISO ? latestCode : null;
  } catch {
    return null;
  }
}
