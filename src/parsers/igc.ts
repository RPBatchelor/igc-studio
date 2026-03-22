import IGCParser from "igc-parser";
import type { FlightData, TrackPoint } from "./types";
import { enrichPoints, computeStats } from "../lib/stats";

export function parseIGC(content: string, filename: string): FlightData {
  const result = IGCParser.parse(content, { lenient: true });

  const rawPoints: TrackPoint[] = result.fixes.map((fix) => ({
    timestamp: fix.timestamp,
    lat: fix.latitude,
    lng: fix.longitude,
    altGPS: fix.gpsAltitude ?? fix.pressureAltitude ?? 0,
    altPressure: fix.pressureAltitude ?? undefined,
    speed: 0,
    distance: 0,
  }));

  const points = enrichPoints(rawPoints);
  const stats = computeStats(points);

  return {
    filename,
    pilot: result.pilot ?? undefined,
    glider: result.gliderType ?? undefined,
    date: result.date ?? "",
    points,
    stats,
  };
}
