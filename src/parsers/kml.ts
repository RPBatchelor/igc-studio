import { XMLParser } from "fast-xml-parser";
import type { FlightData, TrackPoint } from "./types";
import { enrichPoints, computeStats } from "../lib/stats";

export function parseKML(content: string, filename: string): FlightData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const doc = parser.parse(content);

  const hasRealTimestamps = !!findNode(doc, "gx:Track") || !!findNode(doc, "gx:track");
  const points = extractPoints(doc);
  const enriched = enrichPoints(points);
  const stats = computeStats(enriched);

  return {
    filename,
    date: extractDate(doc) ?? "",
    points: enriched,
    stats,
    ...(hasRealTimestamps ? {} : { hasSyntheticTimestamps: true }),
  };
}

function extractPoints(doc: Record<string, unknown>): TrackPoint[] {
  const points: TrackPoint[] = [];

  // Try gx:Track format first (has timestamps)
  const track = findNode(doc, "gx:Track");
  if (track) {
    const t = track as Record<string, unknown>;
    const whens: string[] = asArray((t["when"] ?? []) as string[]);
    const coords: string[] = asArray((t["gx:coord"] ?? []) as string[]);

    for (let i = 0; i < Math.min(whens.length, coords.length); i++) {
      const parts = String(coords[i]).trim().split(/\s+/);
      if (parts.length >= 3) {
        points.push({
          timestamp: new Date(whens[i]).getTime(),
          lng: parseFloat(parts[0]),
          lat: parseFloat(parts[1]),
          altGPS: parseFloat(parts[2]),
          speed: 0,
          distance: 0,
        });
      }
    }
    return points;
  }

  // Fallback: LineString coordinates
  const coordStr = findNode(doc, "coordinates");
  if (typeof coordStr === "string") {
    const lines = coordStr.trim().split(/\s+/);
    const baseTime = Date.now();
    lines.forEach((line, i) => {
      const [lng, lat, alt] = line.split(",").map(Number);
      if (!isNaN(lat) && !isNaN(lng)) {
        points.push({
          timestamp: baseTime + i * 1000, // synthetic 1s intervals
          lat,
          lng,
          altGPS: alt || 0,
          speed: 0,
          distance: 0,
        });
      }
    });
  }

  return points;
}

function findNode(obj: unknown, key: string): unknown {
  if (obj == null || typeof obj !== "object") return undefined;
  const record = obj as Record<string, unknown>;
  if (key in record) return record[key];
  for (const v of Object.values(record)) {
    const found = findNode(v, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function extractDate(doc: Record<string, unknown>): string | undefined {
  const when = findNode(doc, "when");
  if (typeof when === "string") return when.slice(0, 10);
  if (Array.isArray(when) && when.length > 0) return String(when[0]).slice(0, 10);
  return undefined;
}

function asArray<T>(val: T | T[]): T[] {
  return Array.isArray(val) ? val : [val];
}
