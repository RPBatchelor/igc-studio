import { invoke } from "@tauri-apps/api/core";
import { parseIGC } from "../parsers/igc";
import { parseKML } from "../parsers/kml";
import type { FlightData } from "../parsers/types";

/**
 * Reads, parses, enriches and sets flight data for a given file path.
 * Callable without hook context — used by both useFileSystem and FlightTrim.
 */
export async function loadFlightData(
  path: string,
  filename: string,
  setFlightData: (data: FlightData | null) => void,
): Promise<void> {
  const content = await invoke<string>("read_file_text", { path });
  const ext = filename.split(".").pop()?.toLowerCase();

  let data: FlightData | undefined;
  if (ext === "igc") {
    data = parseIGC(content, filename);
  } else if (ext === "kml") {
    data = parseKML(content, filename);
  } else {
    return;
  }

  setFlightData(data);
}
