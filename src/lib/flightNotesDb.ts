import { invoke } from "@tauri-apps/api/core";

export interface FlightNoteEntry {
  glider?: string;
  notes?: string;
}

export type FlightNotesDb = Record<string, FlightNoteEntry>; // key = flight file path

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
    return JSON.parse(text) as FlightNotesDb;
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
