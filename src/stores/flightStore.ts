import { create } from "zustand";
import type { FlightData, FsEntry, LocationSite, BaseLayerId, OverlayId, SpeedUnit, AltUnit } from "../parsers/types";
import type { SiteDb } from "../lib/siteDb";

interface FlightStore {
  // File explorer
  rootFolder: string | null;
  entries: FsEntry[];
  expandedDirs: Set<string>;
  selectedFile: string | null;

  // Flight data
  flightData: FlightData | null;

  // Playback
  playbackTime: number; // Unix ms — current position in the flight
  playbackSpeed: number; // multiplier
  isPlaying: boolean;

  // Map layers
  baseLayer: BaseLayerId;
  overlays: Set<OverlayId>;
  terrainEnabled: boolean;
  cesiumIonToken: string;
  bingMapsKey: string;

  // Locations
  sites: LocationSite[];
  sitesLoading: boolean;
  siteDb: SiteDb;
  geocodingUsed: boolean;

  // File type filter (shared between Explorer and Locations)
  visibleFileTypes: Set<"igc" | "kml">;
  toggleFileType: (type: "igc" | "kml") => void;

  // Settings
  zoomAltitude: number;
  theme: "dark" | "light";
  speedUnit: SpeedUnit;
  altUnit: AltUnit;

  // Actions
  setRootFolder: (path: string) => void;
  setEntries: (entries: FsEntry[]) => void;
  toggleDir: (path: string) => void;
  setSelectedFile: (path: string) => void;
  setFlightData: (data: FlightData | null) => void;
  setPlaybackTime: (time: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setBaseLayer: (layer: BaseLayerId) => void;
  toggleOverlay: (overlay: OverlayId) => void;
  setTerrainEnabled: (enabled: boolean) => void;
  setCesiumIonToken: (token: string) => void;
  setBingMapsKey: (key: string) => void;
  setZoomAltitude: (alt: number) => void;
  setTheme: (theme: "dark" | "light") => void;
  setSpeedUnit: (unit: SpeedUnit) => void;
  setAltUnit: (unit: AltUnit) => void;
  setSites: (sites: LocationSite[]) => void;
  setSitesLoading: (loading: boolean) => void;
  setSiteDb: (db: SiteDb) => void;
  updateSiteDb: (siteId: string, patch: Partial<SiteDb[string]>) => SiteDb;
  setGeocodingUsed: (used: boolean) => void;
}

export const useFlightStore = create<FlightStore>((set) => ({
  rootFolder: null,
  entries: [],
  expandedDirs: new Set<string>(),
  selectedFile: null,
  flightData: null,
  playbackTime: 0,
  playbackSpeed: 20,
  isPlaying: false,
  baseLayer: "esriSatellite" as BaseLayerId,
  overlays: new Set<OverlayId>(),
  terrainEnabled: true,
  cesiumIonToken: "",
  bingMapsKey: "",
  sites: [],
  sitesLoading: false,
  siteDb: {},
  geocodingUsed: false,
  visibleFileTypes: new Set<"igc" | "kml">(["igc", "kml"]),
  zoomAltitude: 8000,
  theme: "dark" as "dark" | "light",
  speedUnit: "km/h" as SpeedUnit,
  altUnit: "metric" as AltUnit,

  setRootFolder: (path) => set({ rootFolder: path, entries: [], expandedDirs: new Set(), selectedFile: null, flightData: null }),
  setEntries: (entries) => set({ entries }),
  toggleDir: (path) =>
    set((state) => {
      const next = new Set(state.expandedDirs);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { expandedDirs: next };
    }),
  setSelectedFile: (path) => set({ selectedFile: path }),
  setFlightData: (data) =>
    set({
      flightData: data,
      playbackTime: data?.points[0]?.timestamp ?? 0,
      isPlaying: false,
    }),
  setPlaybackTime: (time) => set({ playbackTime: time }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setBaseLayer: (layer) => set({ baseLayer: layer }),
  toggleOverlay: (overlay) =>
    set((state) => {
      const next = new Set(state.overlays);
      next.has(overlay) ? next.delete(overlay) : next.add(overlay);
      return { overlays: next };
    }),
  setTerrainEnabled: (enabled) => set({ terrainEnabled: enabled }),
  setCesiumIonToken: (token) => set({ cesiumIonToken: token }),
  setBingMapsKey: (key) => set({ bingMapsKey: key }),
  toggleFileType: (type) =>
    set((state) => {
      const next = new Set(state.visibleFileTypes);
      next.has(type) ? next.delete(type) : next.add(type);
      return { visibleFileTypes: next };
    }),
  setZoomAltitude: (alt) => set({ zoomAltitude: alt }),
  setTheme: (theme) => set({ theme }),
  setSpeedUnit: (unit) => set({ speedUnit: unit }),
  setAltUnit: (unit) => set({ altUnit: unit }),
  setSites: (sites) => set({ sites }),
  setSitesLoading: (loading) => set({ sitesLoading: loading }),
  setSiteDb: (db) => set({ siteDb: db }),
  updateSiteDb: (siteId, patch) => {
    let next!: SiteDb;
    set((state) => {
      next = { ...state.siteDb, [siteId]: { ...state.siteDb[siteId], ...patch } };
      return { siteDb: next };
    });
    return next;
  },
  setGeocodingUsed: (used) => set({ geocodingUsed: used }),
}));
