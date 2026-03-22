import { create } from "zustand";
import type { FlightData, FsEntry, MapLayerId } from "../parsers/types";

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
  activeLayers: Set<MapLayerId>;

  // Actions
  setRootFolder: (path: string) => void;
  setEntries: (entries: FsEntry[]) => void;
  toggleDir: (path: string) => void;
  setSelectedFile: (path: string) => void;
  setFlightData: (data: FlightData | null) => void;
  setPlaybackTime: (time: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setIsPlaying: (playing: boolean) => void;
  toggleLayer: (layer: MapLayerId) => void;
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
  activeLayers: new Set<MapLayerId>(["osm", "terrain"]),

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
  toggleLayer: (layer) =>
    set((state) => {
      const next = new Set(state.activeLayers);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return { activeLayers: next };
    }),
}));
