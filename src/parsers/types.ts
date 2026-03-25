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
  maxClimb: number; // m/s
  maxSink: number;  // m/s (negative value)
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

export type OverlayId = "esriRoads" | "airspace" | "sgZones";

export interface SgZone {
  id: string;
  name: string;
  class: string;       // "Landing", "Emergency Landing", "No Landing", "Powerline", etc.
  checkType: string;   // "obstacle" | "ignore" | etc.
  polygon: Array<{ lat: number; lng: number }>;
}

export interface AirspaceFeature {
  id: string;
  name: string;
  class: string;       // "CTR", "A"–"G", "R", "P", "Q", etc.
  floorM: number;      // floor altitude metres AMSL (0 for GND/SFC)
  ceilM: number;       // ceiling altitude metres AMSL
  floorIsAGL: boolean; // true when original reference was AGL
  ceilIsAGL: boolean;
  polygon: Array<{ lat: number; lng: number }>; // ≥3 points; circles pre-converted
}

export type SpeedUnit = "km/h" | "m/s" | "kts";
export type AltUnit   = "metric" | "imperial"; // metric = m/km, imperial = ft/mi

export interface LogbookEntry {
  path: string;
  siteId: string;
  siteName: string;
  date: string;        // ISO "YYYY-MM-DD" or ""
  duration: number;    // seconds
  distance: number;    // km
  maxAltitude: number; // m
  maxClimb: number;    // m/s
  maxSink: number;     // m/s
}

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
