/**
 * Portable settings bundle — serialises user preferences, site renames, and
 * per-flight notes into a single JSON file that can live on OneDrive, Dropbox,
 * or any other cloud-synced folder.  API keys are deliberately excluded.
 *
 * Flight note keys are stored as root-relative paths so the bundle works across
 * devices even when the base folder is mounted at a different drive/path.
 */

import type { FlightNoteEntry, FlightNotesDb } from "./flightNotesDb";
import type { SiteDb, SiteDbEntry } from "./siteDb";
import type { AppSettings } from "./settingsDb";

export interface PortableBundle {
  version: 1;
  exportedAt: string;         // ISO timestamp
  appVersion: string;
  settings: Omit<AppSettings, "lastFolderPath" | "syncFilePath">;
  /** Full site DB entries — includes user rename, geocoded name, and all parsed site guide details. */
  sites: Record<string, SiteDbEntry>;
  flightNotes: Record<string, FlightNoteEntry>; // relative path → entry
}

const CURRENT_VERSION = 1 as const;

// ── Path helpers ─────────────────────────────────────────────────────────────

/** Normalise slashes and lowercase for consistent key comparison. */
function norm(p: string): string {
  return p.toLowerCase().replace(/\\/g, "/");
}

/**
 * Convert an absolute flight-note key to a root-relative key for the bundle.
 * If the key doesn't start with the root, return it unchanged so it is still
 * preserved (and matched by filename fallback on the receiving device).
 */
export function toRelativeKey(absKey: string, rootFolder: string): string {
  const normKey  = norm(absKey);
  const normRoot = norm(rootFolder).replace(/\/?$/, "/"); // ensure trailing slash
  return normKey.startsWith(normRoot) ? normKey.slice(normRoot.length) : normKey;
}

/**
 * Reconstruct an absolute path from a relative bundle key and the current root
 * folder.  If the key already looks absolute (starts with drive letter or /),
 * return it as-is — it came from a device whose root didn't match at export time.
 */
export function toAbsKey(relKey: string, rootFolder: string): string {
  const isAbsolute = /^([a-z]:\/|\/)/i.test(relKey);
  if (isAbsolute) return relKey;
  const root = norm(rootFolder).replace(/\/?$/, "/");
  return root + relKey;
}

// ── Build ────────────────────────────────────────────────────────────────────

export function buildBundle(
  rootFolder: string | null,
  settings: AppSettings,
  notesDb: FlightNotesDb,
  siteDb: SiteDb,
  appVersion: string,
): PortableBundle {
  // Exclude device-specific and sensitive fields from settings
  const {
    lastFolderPath: _lf,
    syncFilePath: _sf,
    ...syncableSettings
  } = settings;

  // Full site DB — includes user rename, geocoded name, and all parsed site guide details
  const sites: Record<string, SiteDbEntry> = { ...siteDb };

  // Flight notes keyed by root-relative path
  const flightNotes: Record<string, FlightNoteEntry> = {};
  for (const [absKey, entry] of Object.entries(notesDb)) {
    const relKey = rootFolder ? toRelativeKey(absKey, rootFolder) : absKey;
    flightNotes[relKey] = entry;
  }

  return {
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    settings: syncableSettings,
    sites,
    flightNotes,
  };
}

// ── Apply ────────────────────────────────────────────────────────────────────

export interface BundleApplyResult {
  settings: Omit<AppSettings, "lastFolderPath" | "syncFilePath">;
  /** Merged flight notes: bundle entries resolved to absolute paths + existing local entries. */
  notesDb: FlightNotesDb;
  /** Merged site DB: bundle entries win on conflict; local-only entries kept. */
  siteDb: SiteDb;
}

/**
 * Merge a bundle into the current local state.
 * - Settings:     bundle wins (last-write-wins for preferences)
 * - Flight notes: additive — bundle entries are added/updated; local-only entries kept
 * - Site DB:      additive — bundle entries win on conflict; local-only entries kept
 */
export function applyBundle(
  bundle: PortableBundle,
  rootFolder: string | null,
  localNotesDb: FlightNotesDb,
  localSiteDb: SiteDb,
): BundleApplyResult {
  // Resolve bundle flight note relative keys to absolute paths
  const resolvedNotes: FlightNotesDb = {};
  for (const [relKey, entry] of Object.entries(bundle.flightNotes)) {
    const absKey = rootFolder ? toAbsKey(relKey, rootFolder) : relKey;
    resolvedNotes[absKey] = entry;
  }

  // Merge notes: local entries not in bundle are preserved; bundle entries win on conflict
  const notesDb: FlightNotesDb = { ...localNotesDb, ...resolvedNotes };

  // Merge site DB: local entries not in bundle are preserved; bundle entries win on conflict.
  // Handle both the new full-entry format and the legacy siteRenames-only format.
  const bundleSites: SiteDb = bundle.sites ?? {};
  const legacyRenames: Record<string, string> = (bundle as unknown as { siteRenames?: Record<string, string> }).siteRenames ?? {};

  const siteDb: SiteDb = { ...localSiteDb };
  for (const [id, entry] of Object.entries(bundleSites)) {
    siteDb[id] = { ...siteDb[id], ...entry };
  }
  // Apply any legacy rename-only entries (bundles written before this change)
  for (const [id, name] of Object.entries(legacyRenames)) {
    siteDb[id] = { ...siteDb[id], userRename: name };
  }

  return { settings: bundle.settings, notesDb, siteDb };
}

// ── Serialise / parse ────────────────────────────────────────────────────────

export function serializeBundle(bundle: PortableBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function parseBundle(text: string): PortableBundle | null {
  try {
    const obj = JSON.parse(text);
    if (typeof obj !== "object" || obj === null) return null;
    if (obj.version !== CURRENT_VERSION) return null;
    if (typeof obj.settings !== "object") return null;
    return obj as PortableBundle;
  } catch {
    return null;
  }
}
