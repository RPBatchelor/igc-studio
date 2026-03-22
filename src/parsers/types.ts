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

export type MapLayerId =
  | "osm"
  | "bingAerial"
  | "bingRoad"
  | "esriSatellite"
  | "terrain";
