import { create } from "zustand";
import type { FlightData, FsEntry, LocationSite, BaseLayerId, OverlayId, SpeedUnit, AltUnit, AirspaceFeature, SgZone } from "../parsers/types";
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

  // Site Guide zones
  sgZones: SgZone[];
  sgZonesLoading: boolean;
  sgZonesError: string | null;
  sgZonesFetchedAt: number | null;

  // Airspace
  airspaces: AirspaceFeature[];
  airspacesLoading: boolean;
  airspacesError: string | null;
  airspacesFetchedAt: number | null;
  airspaceValidDate: string | null;
  airspaceUpdateAvailable: string | null; // date string of available newer file
  airspaceUrl: string;

  // Settings
  zoomAltitude: number;
  theme: "dark" | "light";
  speedUnit: SpeedUnit;
  altUnit: AltUnit;
  rememberLastFolder: boolean;
  showCameraOverlay: boolean;
  pendingCameraTarget: { lat: number; lng: number; altitude: number } | null;
  activeView: "explorer" | "locations" | "layers" | "settings" | null;
  pendingLocationSiteId: string | null;

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
  setSgZones: (z: SgZone[]) => void;
  setSgZonesLoading: (b: boolean) => void;
  setSgZonesError: (e: string | null) => void;
  setSgZonesFetchedAt: (t: number | null) => void;
  setAirspaces: (f: AirspaceFeature[]) => void;
  setAirspacesLoading: (b: boolean) => void;
  setAirspacesError: (e: string | null) => void;
  setAirspacesFetchedAt: (t: number | null) => void;
  setAirspaceValidDate: (d: string | null) => void;
  setAirspaceUpdateAvailable: (d: string | null) => void;
  setAirspaceUrl: (url: string) => void;
  setZoomAltitude: (alt: number) => void;
  setTheme: (theme: "dark" | "light") => void;
  setSpeedUnit: (unit: SpeedUnit) => void;
  setAltUnit: (unit: AltUnit) => void;
  setRememberLastFolder: (b: boolean) => void;
  setShowCameraOverlay: (b: boolean) => void;
  setPendingCameraTarget: (t: { lat: number; lng: number; altitude: number } | null) => void;
  setActiveView: (v: "explorer" | "locations" | "layers" | "settings" | null) => void;
  setPendingLocationSiteId: (id: string | null) => void;
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
  sgZones: [],
  sgZonesLoading: false,
  sgZonesError: null,
  sgZonesFetchedAt: null,
  airspaces: [],
  airspacesLoading: false,
  airspacesError: null,
  airspacesFetchedAt: null,
  airspaceValidDate: null,
  airspaceUpdateAvailable: null,
  airspaceUrl: "https://xcaustralia.org/download/class_all.php",
  zoomAltitude: 8000,
  theme: "dark" as "dark" | "light",
  speedUnit: "km/h" as SpeedUnit,
  altUnit: "metric" as AltUnit,
  rememberLastFolder: true,
  showCameraOverlay: false,
  pendingCameraTarget: null,
  activeView: "explorer" as "explorer" | "locations" | "layers" | "settings" | null,
  pendingLocationSiteId: null,

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
  setSgZones: (z) => set({ sgZones: z }),
  setSgZonesLoading: (b) => set({ sgZonesLoading: b }),
  setSgZonesError: (e) => set({ sgZonesError: e }),
  setSgZonesFetchedAt: (t) => set({ sgZonesFetchedAt: t }),
  setAirspaces: (f) => set({ airspaces: f }),
  setAirspacesLoading: (b) => set({ airspacesLoading: b }),
  setAirspacesError: (e) => set({ airspacesError: e }),
  setAirspacesFetchedAt: (t) => set({ airspacesFetchedAt: t }),
  setAirspaceValidDate: (d) => set({ airspaceValidDate: d }),
  setAirspaceUpdateAvailable: (d) => set({ airspaceUpdateAvailable: d }),
  setAirspaceUrl: (url) => set({ airspaceUrl: url }),
  setRememberLastFolder: (b) => set({ rememberLastFolder: b }),
  setShowCameraOverlay: (b) => set({ showCameraOverlay: b }),
  setPendingCameraTarget: (t) => set({ pendingCameraTarget: t }),
  setActiveView: (v) => set({ activeView: v }),
  setPendingLocationSiteId: (id) => set({ pendingLocationSiteId: id }),
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
