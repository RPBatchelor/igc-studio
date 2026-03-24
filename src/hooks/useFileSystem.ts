import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useFlightStore } from "../stores/flightStore";
import { parseIGC } from "../parsers/igc";
import { parseKML } from "../parsers/kml";
import type { FlightMeta, FsEntry } from "../parsers/types";
import { clusterIntoSites, geocodeSites } from "../lib/siteScanner";
import { loadSiteDb, saveSiteDb, resolveDisplayName } from "../lib/siteDb";

export function useFileSystem() {
  const store = useFlightStore();

  async function openFolderByPath(root: string) {
    store.setRootFolder(root);
    const entries = await invoke<FsEntry[]>("read_directory", { path: root });
    store.setEntries(entries);
    scanSites(root); // fire-and-forget
  }

  async function openFolder() {
    const selected = await open({ directory: true });
    if (!selected) return;
    await openFolderByPath(selected as string);
  }

  async function scanSites(root: string) {
    store.setSitesLoading(true);
    try {
      // Load persisted DB first so names are applied immediately
      const db = await loadSiteDb();
      store.setSiteDb(db);

      const metas = await invoke<FlightMeta[]>("scan_flights", { root });
      let sites = clusterIntoSites(metas);

      // Apply any previously saved names from DB
      sites = sites.map((s) => {
        const saved = resolveDisplayName(db[s.id]);
        return saved ? { ...s, name: saved, geocoded: !!db[s.id]?.geocodedName } : s;
      });

      store.setSites(sites);
      store.setSitesLoading(false);

      // Only geocode sites not already in the DB
      const needsGeocode = sites.filter((s) => !db[s.id]?.geocodedName);
      if (needsGeocode.length === 0) return;

      const used = await geocodeSites(needsGeocode, {}, async (siteId, geocodedName) => {
        // Save to DB (don't overwrite a user rename)
        const updatedDb = useFlightStore.getState().updateSiteDb(siteId, { geocodedName });
        await saveSiteDb(updatedDb);

        // Update displayed name only if user hasn't renamed
        const { sites: current, setSites } = useFlightStore.getState();
        setSites(current.map((s) => {
          if (s.id !== siteId) return s;
          const entry = updatedDb[siteId];
          const name = entry.userRename ?? geocodedName;
          return { ...s, name, geocoded: true };
        }));
      });
      if (used) store.setGeocodingUsed(true);
    } catch (e) {
      console.error("Site scan failed:", e);
      store.setSitesLoading(false);
    }
  }

  async function loadDirectory(path: string) {
    return invoke<FsEntry[]>("read_directory", { path });
  }

  async function loadFile(path: string, filename: string) {
    store.setSelectedFile(path);
    const content = await invoke<string>("read_file_text", { path });
    const ext = filename.split(".").pop()?.toLowerCase();

    let data;
    if (ext === "igc") {
      data = parseIGC(content, filename);
    } else if (ext === "kml") {
      data = parseKML(content, filename);
    } else {
      return;
    }

    store.setFlightData(data);
  }

  return { openFolder, openFolderByPath, loadDirectory, loadFile };
}
