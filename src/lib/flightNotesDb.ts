import { invoke } from "@tauri-apps/api/core";

export interface FlightNoteEntry {
  glider?: string;
  notes?: string;
  altitudeOffset?: number; // metres; non-destructive correction applied at render time
}

export type FlightNotesDb = Record<string, FlightNoteEntry>; // key = normalised flight file path

/** Normalise path keys so Windows case/slash differences don't create duplicate entries. */
export function normalizeNotesKey(path: string): string {
  return path.toLowerCase().replace(/\\/g, "/");
}

let dbPath: string | null = null;

async function getDbPath(): Promise<string> {
  if (!dbPath) {
    const dir = await invoke<string>("get_data_dir");
    dbPath = dir.replace(/\\/g, "/") + "/igc-studio/flight-notes.json";
  }
  return dbPath;
}

export async function loadFlightNotesDb(): Promise<FlightNotesDb> {
  try {
    const text = await invoke<string>("read_file_text", { path: await getDbPath() });
    const raw = JSON.parse(text) as FlightNotesDb;
    // Migrate any un-normalised keys that may exist from older versions
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [normalizeNotesKey(k), v])
    );
  } catch {
    return {};
  }
}

export async function saveFlightNotesDb(db: FlightNotesDb): Promise<void> {
  try {
    await invoke("write_file_text", {
      path: await getDbPath(),
      content: JSON.stringify(db, null, 2),
    });
  } catch (e) {
    console.error("Failed to save flight notes:", e);
  }
}
