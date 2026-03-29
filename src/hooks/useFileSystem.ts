import { useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useFlightStore } from "../stores/flightStore";
import type { FlightMeta, FsEntry } from "../parsers/types";
import { clusterIntoSites, geocodeSites } from "../lib/siteScanner";
import { loadSiteDb, saveSiteDb, resolveDisplayName } from "../lib/siteDb";
import { scanLogbook } from "../lib/logbookScanner";
import { loadFlightData } from "../lib/flightLoader";
import { prefetchSiteTiles } from "../lib/tilePrefetch";

export function useFileSystem() {
  const store = useFlightStore();

  // Generation counter — incremented on every new folder open.
  // Any async work that captures `gen` at start will self-abort when stale.
  const scanGenRef = useRef(0);

  // Generation counter for file loads — prevents stale loads overwriting newer ones.
  const loadGenRef = useRef(0);

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
    const gen = ++scanGenRef.current;
    store.setSitesLoading(true);
    try {
      // Load persisted DB first so names are applied immediately
      const db = await loadSiteDb();
      if (gen !== scanGenRef.current) return;
      store.setSiteDb(db);

      const metas = await invoke<FlightMeta[]>("scan_flights", { root });
      if (gen !== scanGenRef.current) return;

      let sites = clusterIntoSites(metas);

      // Apply any previously saved names from DB
      sites = sites.map((s) => {
        const saved = resolveDisplayName(db[s.id]);
        return saved ? { ...s, name: saved, geocoded: !!db[s.id]?.geocodedName } : s;
      });

      if (gen !== scanGenRef.current) return;
      store.setSites(sites);
      store.setSitesLoading(false);
      prefetchSiteTiles(sites, useFlightStore.getState().baseLayer); // fire-and-forget via SW

      // Kick off logbook scan in the background immediately after sites are ready
      store.setLogbookLoading(true);
      store.setLogbookProgress({ done: 0, total: sites.reduce((n, s) => n + s.flights.length, 0) });
      scanLogbook(sites, (done, total) => {
        if (gen !== scanGenRef.current) return;
        useFlightStore.getState().setLogbookProgress({ done, total });
      })
        .then((entries) => {
          if (gen !== scanGenRef.current) return;
          const s = useFlightStore.getState();
          s.setLogbookEntries(entries);
          s.setLogbookLoading(false);
          s.setLogbookProgress(null);
        })
        .catch(() => {
          if (gen !== scanGenRef.current) return;
          useFlightStore.getState().setLogbookLoading(false);
        });

      // Only geocode sites not already in the DB
      const needsGeocode = sites.filter((s) => !db[s.id]?.geocodedName);
      if (needsGeocode.length === 0) return;

      const used = await geocodeSites(needsGeocode, {}, async (siteId, geocodedName) => {
        if (gen !== scanGenRef.current) return; // folder has changed — discard
        // Save to DB (don't overwrite a user rename)
        const updatedDb = useFlightStore.getState().updateSiteDb(siteId, { geocodedName });
        await saveSiteDb(updatedDb);

        if (gen !== scanGenRef.current) return;
        // Update displayed name only if user hasn't renamed
        const { sites: current, setSites } = useFlightStore.getState();
        setSites(current.map((s) => {
          if (s.id !== siteId) return s;
          const entry = updatedDb[siteId];
          const name = entry.userRename ?? geocodedName;
          return { ...s, name, geocoded: true };
        }));
      });
      if (gen === scanGenRef.current && used) store.setGeocodingUsed(true);
    } catch (e) {
      if (gen !== scanGenRef.current) return;
      console.error("Site scan failed:", e);
      store.setSitesLoading(false);
    }
  }

  async function loadDirectory(path: string) {
    return invoke<FsEntry[]>("read_directory", { path });
  }

  async function loadFile(path: string, filename: string) {
    const gen = ++loadGenRef.current;
    store.setSelectedFile(path);
    await loadFlightData(path, filename, (data) => {
      // Only commit if this is still the most-recent load request
      if (loadGenRef.current === gen) {
        store.setFlightData(data);
      }
    });
  }

  return { openFolder, openFolderByPath, loadDirectory, loadFile };
}
