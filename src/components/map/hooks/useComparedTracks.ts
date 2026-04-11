import { useEffect, useRef } from "react";
import { Viewer, Cartesian3, Color, type Entity } from "cesium";
import { useFlightStore } from "../../../stores/flightStore";
import { COMPARE_CESIUM_COLORS } from "../../../lib/compareColors";
import { catmullRomSpline } from "../../../lib/interpolate";
import type { TrackPoint } from "../../../parsers/types";

export function useComparedTracks(viewerRef: React.RefObject<Viewer | null>) {
  // One entity array per comparison slot (up to 3)
  const segmentEntitiesRef = useRef<Entity[][]>([[], [], []]);
  const pilotEntitiesRef   = useRef<(Entity | null)[]>([null, null, null]);
  // The rendered (possibly spline-interpolated) points per slot — playback effect
  // must index into these, not the raw flight.points, so trail and marker stay in sync.
  const renderedPtsRef     = useRef<TrackPoint[][]>([[], [], []]);

  const {
    flightData,
    comparedFlights,
    comparedPaths,
    playbackTime,
    isStopped,
    smoothFlightPath,
    altitudeOffset,
  } = useFlightStore();

  // Rebuild track polylines when the set of compared flights changes
  useEffect(() => {
    const viewer = viewerRef.current;

    // Remove all existing comparison entities
    for (let slot = 0; slot < 3; slot++) {
      segmentEntitiesRef.current[slot].forEach((e) => viewer?.entities.remove(e));
      segmentEntitiesRef.current[slot] = [];
      renderedPtsRef.current[slot] = [];
      if (pilotEntitiesRef.current[slot]) {
        viewer?.entities.remove(pilotEntitiesRef.current[slot]!);
        pilotEntitiesRef.current[slot] = null;
      }
    }

    if (!viewer) return;

    for (let slot = 0; slot < comparedFlights.length; slot++) {
      const flight = comparedFlights[slot];
      const color  = COMPARE_CESIUM_COLORS[slot];

      const rawPts = flight.points;
      const subdivisions = smoothFlightPath
        ? Math.max(2, Math.min(4, Math.floor(8000 / rawPts.length)))
        : 1;
      const pts: TrackPoint[] = smoothFlightPath
        ? catmullRomSpline(rawPts, subdivisions)
        : rawPts;
      renderedPtsRef.current[slot] = pts;

      const entities: Entity[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        entities.push(
          viewer.entities.add({
            show: false,
            polyline: {
              positions: [
                Cartesian3.fromDegrees(pts[i].lng,     pts[i].lat,     pts[i].altGPS     + altitudeOffset),
                Cartesian3.fromDegrees(pts[i+1].lng,   pts[i+1].lat,   pts[i+1].altGPS   + altitudeOffset),
              ],
              width: 3,
              material: color,
              clampToGround: false,
            },
          })
        );
      }
      segmentEntitiesRef.current[slot] = entities;

      // Pilot marker entity (hidden until first playback update)
      const markerColor = color.clone();
      pilotEntitiesRef.current[slot] = viewer.entities.add({
        id: `pilot-compare-${slot}`,
        show: false,
        position: Cartesian3.fromDegrees(pts[0].lng, pts[0].lat, pts[0].altGPS + altitudeOffset),
        point: { pixelSize: 10, color: markerColor, outlineColor: Color.WHITE, outlineWidth: 2 },
      });
    }

    viewer.scene.requestRender();
  }, [comparedFlights, comparedPaths, altitudeOffset, smoothFlightPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update pilot markers and show/hide segments on playback tick
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const primaryStart = flightData?.points[0]?.timestamp ?? 0;
    const elapsedMs = playbackTime - primaryStart;

    for (let slot = 0; slot < comparedFlights.length; slot++) {
      const flight    = comparedFlights[slot];
      // Use the rendered array (raw or splined) that matches the built segments.
      const pts       = renderedPtsRef.current[slot].length > 0
        ? renderedPtsRef.current[slot]
        : flight.points;
      const segs      = segmentEntitiesRef.current[slot];
      const pilotEnt  = pilotEntitiesRef.current[slot];

      if (segs.length === 0) continue;

      // Derive this flight's effective display time from elapsed ms
      const compareTime = pts[0].timestamp + elapsedMs;
      const clampedTime = Math.min(compareTime, pts[pts.length - 1].timestamp);

      // Find index via binary search
      let currentIdx = 0;
      if (clampedTime > pts[0].timestamp) {
        let lo = 0, hi = pts.length - 1;
        while (lo < hi - 1) {
          const mid = (lo + hi) >> 1;
          if (pts[mid].timestamp <= clampedTime) lo = mid; else hi = mid;
        }
        currentIdx = lo;
      }

      // Show/hide segments
      if (isStopped) {
        segs.forEach((e) => { e.show = true; });
      } else {
        segs.forEach((e, i) => { e.show = i < currentIdx; });
      }

      // Interpolated pilot position
      if (pilotEnt) {
        const hi = Math.min(currentIdx + 1, pts.length - 1);
        const a = pts[currentIdx], b = pts[hi];
        const t = b.timestamp > a.timestamp
          ? (clampedTime - a.timestamp) / (b.timestamp - a.timestamp)
          : 0;
        const lat = a.lat + (b.lat - a.lat) * t;
        const lng = a.lng + (b.lng - a.lng) * t;
        const alt = a.altGPS + (b.altGPS - a.altGPS) * t + altitudeOffset;
        pilotEnt.position = Cartesian3.fromDegrees(lng, lat, alt) as unknown as typeof pilotEnt.position;
        pilotEnt.show = true;
      }
    }

    // Hide pilot markers for unused slots
    for (let slot = comparedFlights.length; slot < 3; slot++) {
      const pilotEnt = pilotEntitiesRef.current[slot];
      if (pilotEnt) pilotEnt.show = false;
    }

    viewer.scene.requestRender();
  }, [flightData, comparedFlights, playbackTime, isStopped, altitudeOffset]); // eslint-disable-line react-hooks/exhaustive-deps
}
