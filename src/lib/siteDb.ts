import { invoke } from "@tauri-apps/api/core";

export interface SiteDbEntry {
  geocodedName?: string;   // from OSM Nominatim
  userRename?: string;     // user override — always wins
}

export type SiteDb = Record<string, SiteDbEntry>; // key = site ID

let dbPath: string | null = null;

async function getDbPath(): Promise<string> {
  if (!dbPath) {
    const dir = await invoke<string>("get_data_dir");
    dbPath = dir.replace(/\\/g, "/") + "/igc-studio/sites.json";
  }
  return dbPath;
}

export async function loadSiteDb(): Promise<SiteDb> {
  try {
    const path = await getDbPath();
    const text = await invoke<string>("read_file_text", { path });
    return JSON.parse(text) as SiteDb;
  } catch {
    return {}; // file doesn't exist yet — start fresh
  }
}

export async function saveSiteDb(db: SiteDb): Promise<void> {
  try {
    const path = await getDbPath();
    await invoke("write_file_text", { path, content: JSON.stringify(db, null, 2) });
  } catch (e) {
    console.error("Failed to save site DB:", e);
  }
}

/** Return the display name for a site from the DB (user rename wins over geocoded). */
export function resolveDisplayName(entry: SiteDbEntry | undefined): string | null {
  if (!entry) return null;
  return entry.userRename ?? entry.geocodedName ?? null;
}
