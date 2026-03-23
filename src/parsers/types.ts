export interface TrackPoint {
  timestamp: number; // Unix ms
  lat: number;
  lng: number;
  altGPS: number; // meters
  altPressure?: number;
  speed: number; // km/h (computed)
  distance: number; // cumulative km from start (computed)
}

export interface FlightStats {
  duration: number; // seconds
  maxAltitude: number;
  minAltitude: number;
  altitudeGain: number;
  maxSpeed: number;
  avgSpeed: number;
  totalDistance: number; // km
}

export interface FlightData {
  filename: string;
  pilot?: string;
  glider?: string;
  date: string;
  points: TrackPoint[];
  stats: FlightStats;
}

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  extension?: string;
}

export type BaseLayerId =
  // Satellite
  | "esriSatellite"
  | "bingAerial"
  // Topographic
  | "esriTopo"
  | "esriNatGeo"
  | "openTopo"
  // Street
  | "osm"
  | "bingRoads"
  // Minimal / canvas
  | "esriLightGrey"
  | "esriDarkGrey"
  | "cartoLight"
  | "cartoDark";

export type OverlayId = "esriRoads";

export type SpeedUnit = "km/h" | "m/s" | "kts";
export type AltUnit   = "metric" | "imperial"; // metric = m/km, imperial = ft/mi

export interface FlightMeta {
  path: string;
  name: string;
  folderName: string;
  lat: number;
  lng: number;
}

export interface LocationSite {
  id: string;        // "lat3dp_lng3dp"
  name: string;
  lat: number;
  lng: number;
  flights: FlightMeta[];
  geocoded?: boolean;
}
