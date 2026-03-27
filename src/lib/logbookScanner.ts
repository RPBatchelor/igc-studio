import { invoke } from "@tauri-apps/api/core";
import type { LocationSite, LogbookEntry } from "../parsers/types";
import { parseIGC } from "../parsers/igc";
import { parseKML } from "../parsers/kml";

export async function scanLogbook(
  sites: LocationSite[],
  onProgress: (done: number, total: number) => void,
): Promise<LogbookEntry[]> {
  const allFlights = sites.flatMap((site) =>
    site.flights
      .filter((f) => !f.name.toLowerCase().endsWith(".bak"))
      .map((f) => ({ ...f, siteId: site.id, siteName: site.name })),
  );

  const entries: LogbookEntry[] = [];

  for (let i = 0; i < allFlights.length; i++) {
    const f = allFlights[i];
    try {
      const content = await invoke<string>("read_file_text", { path: f.path });
      const ext = f.path.split(".").pop()?.toLowerCase();
      const data =
        ext === "kml" ? parseKML(content, f.name) : parseIGC(content, f.name);
      entries.push({
        path: f.path,
        siteId: f.siteId,
        siteName: f.siteName,
        date: data.date,
        duration: data.stats.duration,
        distance: data.stats.totalDistance,
        maxAltitude: data.stats.maxAltitude,
        maxClimb: data.stats.maxClimb,
        maxSink: data.stats.maxSink,
      });
    } catch {
      // skip files that fail to parse
    }
    onProgress(i + 1, allFlights.length);
  }

  return entries;
}
