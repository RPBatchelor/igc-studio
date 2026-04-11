import type { TrackPoint } from "../parsers/types";

/**
 * Catmull-Rom spline interpolation over a TrackPoint array.
 *
 * Catmull-Rom passes through every original control point, which keeps the
 * track geographically accurate while smoothing the angular joins between
 * GPS fixes that are visible at low point densities (1 Hz or slower loggers).
 *
 * Each consecutive pair of original points is subdivided into `subdivisions`
 * equal sub-segments. The four control points used for each span are the two
 * surrounding neighbours on each side, clamped at the ends of the track.
 *
 * lat/lng/altGPS/timestamp are all interpolated. speed and distance are left
 * at 0 — callers that need them should run enrichPoints() on the result.
 */
export function catmullRomSpline(
  points: TrackPoint[],
  subdivisions: number,
): TrackPoint[] {
  const n = points.length;
  if (n < 2 || subdivisions <= 1) return points;

  const result: TrackPoint[] = [];

  for (let i = 0; i < n - 1; i++) {
    // Four control points — clamp to array bounds at the ends
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];

    for (let s = 0; s < subdivisions; s++) {
      const t = s / subdivisions;
      result.push(crSample(p0, p1, p2, p3, t));
    }
  }

  // Always include the final original point exactly
  result.push({ ...points[n - 1] });

  return result;
}

/**
 * Evaluate one Catmull-Rom sample at parameter t ∈ [0, 1) between p1 and p2.
 * Standard centripetal formulation with alpha = 0.5 (tension).
 */
function crSample(
  p0: TrackPoint,
  p1: TrackPoint,
  p2: TrackPoint,
  p3: TrackPoint,
  t: number,
): TrackPoint {
  const t2 = t * t;
  const t3 = t2 * t;

  // Catmull-Rom basis coefficients
  const c0 = -0.5 * t3 + t2 - 0.5 * t;
  const c1 =  1.5 * t3 - 2.5 * t2 + 1.0;
  const c2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
  const c3 =  0.5 * t3 - 0.5 * t2;

  return {
    lat:       c0 * p0.lat       + c1 * p1.lat       + c2 * p2.lat       + c3 * p3.lat,
    lng:       c0 * p0.lng       + c1 * p1.lng       + c2 * p2.lng       + c3 * p3.lng,
    altGPS:    c0 * p0.altGPS    + c1 * p1.altGPS    + c2 * p2.altGPS    + c3 * p3.altGPS,
    timestamp: c0 * p0.timestamp + c1 * p1.timestamp + c2 * p2.timestamp + c3 * p3.timestamp,
    speed:     0,
    distance:  0,
  };
}
