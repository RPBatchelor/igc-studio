import type { TrackPoint, FlightStats } from "../parsers/types";

/** Haversine distance in km between two points */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Enrich points with speed and cumulative distance */
export function enrichPoints(points: TrackPoint[]): TrackPoint[] {
  if (points.length === 0) return points;

  points[0].speed = 0;
  points[0].distance = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dist = haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
    const dtHours = (curr.timestamp - prev.timestamp) / 3_600_000;

    curr.distance = prev.distance + dist;
    curr.speed = dtHours > 0 ? dist / dtHours : 0;
  }

  return points;
}

export function computeStats(points: TrackPoint[]): FlightStats {
  if (points.length === 0) {
    return {
      duration: 0,
      maxAltitude: 0,
      minAltitude: 0,
      altitudeGain: 0,
      maxSpeed: 0,
      avgSpeed: 0,
      totalDistance: 0,
    };
  }

  let maxAlt = -Infinity;
  let minAlt = Infinity;
  let altGain = 0;
  let maxSpd = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.altGPS > maxAlt) maxAlt = p.altGPS;
    if (p.altGPS < minAlt) minAlt = p.altGPS;
    if (p.speed > maxSpd) maxSpd = p.speed;
    if (i > 0) {
      const diff = p.altGPS - points[i - 1].altGPS;
      if (diff > 0) altGain += diff;
    }
  }

  const last = points[points.length - 1];
  const first = points[0];
  const duration = (last.timestamp - first.timestamp) / 1000;
  const totalDistance = last.distance;

  return {
    duration,
    maxAltitude: maxAlt,
    minAltitude: minAlt,
    altitudeGain: altGain,
    maxSpeed: maxSpd,
    avgSpeed: duration > 0 ? (totalDistance / duration) * 3600 : 0,
    totalDistance,
  };
}
