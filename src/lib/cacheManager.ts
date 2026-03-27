import { invoke } from "@tauri-apps/api/core";

let baseDir: string | null = null;

async function getBaseDir(): Promise<string> {
  if (!baseDir) {
    const dir = await invoke<string>("get_data_dir");
    baseDir = dir.replace(/\\/g, "/") + "/igc-studio";
  }
  return baseDir;
}

/**
 * Read a JSON cache file from the app data directory.
 * Returns null if the file doesn't exist or can't be parsed.
 */
export async function loadCached<T>(filename: string): Promise<T | null> {
  try {
    const path = (await getBaseDir()) + "/" + filename;
    const text = await invoke<string>("read_file_text", { path });
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Write a value as JSON to a cache file in the app data directory.
 */
export async function saveCached<T>(filename: string, data: T): Promise<void> {
  try {
    const path = (await getBaseDir()) + "/" + filename;
    await invoke("write_file_text", { path, content: JSON.stringify(data) });
  } catch (e) {
    console.warn(`Failed to save cache (${filename}):`, e);
  }
}
