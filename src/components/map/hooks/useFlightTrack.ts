import { useEffect, useRef } from "react";
import {
  Viewer, Cartesian3, Color,
  Cartographic, sampleTerrainMostDetailed,
  ConstantProperty, WallGraphics, ColorMaterialProperty,
  type Entity,
} from "cesium";
import { useFlightStore } from "../../../stores/flightStore";
import { computeTrackColors, type ColorSegment } from "../lib/trackColors";

// Pre-computed base colour for the shadow curtain (#FF5500 warm orange)
const CURTAIN_BASE_COLOR = new Color(1.0, 85 / 255, 0, 1.0);
const MAX_CURTAIN_SEGS = 120; // covers 2 Hz IGC data × 60 s trail

export function useFlightTrack(viewerRef: React.RefObject<Viewer | null>) {
  const colorSegmentsRef   = useRef<ColorSegment[]>([]);
  const partialEntityRef   = useRef<Entity | null>(null);
  const lastRevealedIdxRef = useRef<number>(-1);
  const curtainEntitiesRef = useRef<Entity[]>([]);
  const lastCurtainIdxRef  = useRef<number>(-1);
  const terrainHeightsRef  = useRef<number[]>([]);
  const prevSiteIdRef      = useRef<string | null>(null);
  // Monotonic index hint — avoids full binary search during normal forward playback
  const lastPilotIdxRef    = useRef<number>(0);

  const { flightData, playbackTime, isStopped, showShadowCurtain, zoomAltitude, altitudeOffset } = useFlightStore();

  // Build colour-segmented flight track when flight data changes
  useEffect(() => {
    const viewer = viewerRef.current;

    // Clean up previous track
    colorSegmentsRef.current.forEach((s) => { if (s.entity) viewer?.entities.remove(s.entity); });
    colorSegmentsRef.current = [];
    if (partialEntityRef.current) { viewer?.entities.remove(partialEntityRef.current); partialEntityRef.current = null; }
    curtainEntitiesRef.current.forEach((e) => viewer?.entities.remove(e));
    curtainEntitiesRef.current = [];
    lastCurtainIdxRef.current = -1;

    if (!viewer || !flightData || flightData.points.length < 2) return;

    const pts = flightData.points;
    const colors = computeTrackColors(pts);

    for (let i = 0; i < pts.length - 1; i++) {
      const seg: ColorSegment = { startIdx: i, endIdx: i + 1, color: colors[i], entity: null };
      const positions = [
        Cartesian3.fromDegrees(pts[i].lng,   pts[i].lat,   pts[i].altGPS   + altitudeOffset),
        Cartesian3.fromDegrees(pts[i+1].lng, pts[i+1].lat, pts[i+1].altGPS + altitudeOffset),
      ];
      seg.entity = viewer.entities.add({
        show: false,
        polyline: { positions, width: 4, material: seg.color, clampToGround: false },
      });
      colorSegmentsRef.current.push(seg);
    }
    lastRevealedIdxRef.current = -1;
    lastPilotIdxRef.current = 0;
    terrainHeightsRef.current = [];

    // Sample terrain heights for curtain minimumHeights (async, best-effort)
    const cartographics = pts.map((p) => Cartographic.fromDegrees(p.lng, p.lat));
    const tp = viewerRef.current?.terrainProvider;
    if (tp) {
      sampleTerrainMostDetailed(tp, cartographics)
        .then((sampled) => {
          terrainHeightsRef.current = sampled.map((c) => c.height ?? 0);
          useFlightStore.getState().setLaunchTerrainAlt(sampled[0]?.height ?? 0);
        })
        .catch(() => {
          terrainHeightsRef.current = [];
          useFlightStore.getState().setLaunchTerrainAlt(null);
        });
    }

    // Pre-allocate curtain segment entities — updated in-place during playback
    for (let i = 0; i < MAX_CURTAIN_SEGS; i++) {
      curtainEntitiesRef.current.push(viewer.entities.add({
        show: false,
        wall: new WallGraphics({
          positions:      new ConstantProperty([]),
          minimumHeights: new ConstantProperty([]),
          maximumHeights: new ConstantProperty([]),
          material:       new ColorMaterialProperty(Color.TRANSPARENT),
          outline: false,
        }),
      }));
    }

    // Camera fly-to (only when site changes)
    const { sites, selectedFile } = useFlightStore.getState();
    const currentSiteId = sites.find((s) => s.flights.some((f) => f.path === selectedFile))?.id ?? null;
    const sameLocation = currentSiteId !== null && currentSiteId === prevSiteIdRef.current;
    prevSiteIdRef.current = currentSiteId;
    if (!sameLocation) {
      const lat = (Math.min(...pts.map((p) => p.lat)) + Math.max(...pts.map((p) => p.lat))) / 2;
      const lng = (Math.min(...pts.map((p) => p.lng)) + Math.max(...pts.map((p) => p.lng))) / 2;
      viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(lng, lat, zoomAltitude), duration: 1.5 });
    }

    viewer.scene.requestRender();
  }, [flightData, altitudeOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update pilot marker + progressive coloured trail
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flightData || flightData.points.length === 0) return;

    const existing = viewer.entities.getById("pilot");
    if (existing) viewer.entities.remove(existing);

    const pts = flightData.points;
    let pos = { lat: pts[0].lat, lng: pts[0].lng, alt: pts[0].altGPS + altitudeOffset };

    // Find current index: scan forward from last known position during normal playback;
    // fall back to binary search when scrubbing backward.
    let currentIdx = 0;
    if (playbackTime > pts[0].timestamp) {
      const hint = lastPilotIdxRef.current;
      if (playbackTime >= pts[hint].timestamp) {
        // Forward scan from hint — O(1) amortized during normal playback
        let i = hint;
        while (i < pts.length - 2 && pts[i + 1].timestamp <= playbackTime) i++;
        currentIdx = i;
      } else {
        // Scrubbed backward — binary search
        let lo = 0, hi = pts.length - 1;
        while (lo < hi - 1) {
          const mid = (lo + hi) >> 1;
          if (pts[mid].timestamp <= playbackTime) lo = mid;
          else hi = mid;
        }
        currentIdx = lo;
      }
      lastPilotIdxRef.current = currentIdx;
      const hi = Math.min(currentIdx + 1, pts.length - 1);
      const a = pts[currentIdx], b = pts[hi];
      const t = b.timestamp > a.timestamp
        ? (playbackTime - a.timestamp) / (b.timestamp - a.timestamp)
        : 0;
      pos = {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        alt: a.altGPS + (b.altGPS - a.altGPS) * t + altitudeOffset,
      };
    }

    if (partialEntityRef.current) {
      viewer.entities.remove(partialEntityRef.current);
      partialEntityRef.current = null;
    }

    if (isStopped) {
      for (const seg of colorSegmentsRef.current) {
        if (seg.entity) seg.entity.show = true;
      }
      lastRevealedIdxRef.current = colorSegmentsRef.current.length - 1;
    } else {
      const lastRevealed = lastRevealedIdxRef.current;

      if (currentIdx < lastRevealed) {
        for (const seg of colorSegmentsRef.current) {
          if (seg.entity) seg.entity.show = seg.endIdx <= currentIdx;
        }
      } else {
        for (let i = Math.max(0, lastRevealed); i < colorSegmentsRef.current.length; i++) {
          const seg = colorSegmentsRef.current[i];
          if (!seg.entity) continue;
          if (seg.endIdx <= currentIdx) {
            seg.entity.show = true;
          } else {
            break;
          }
        }
      }
      lastRevealedIdxRef.current = currentIdx;
    }

    viewer.entities.add({
      id: "pilot",
      position: Cartesian3.fromDegrees(pos.lng, pos.lat, pos.alt),
      point: { pixelSize: 12, color: Color.RED, outlineColor: Color.WHITE, outlineWidth: 2 },
    });

    viewer.scene.requestRender();
  }, [flightData, playbackTime, isStopped, altitudeOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shadow curtain — continuous-gradient vertical wall trailing 60 s behind the pilot
  useEffect(() => {
    const segs = curtainEntitiesRef.current;
    if (segs.length === 0) return;

    if (!flightData || flightData.points.length < 2 || isStopped || !showShadowCurtain) {
      for (const e of segs) e.show = false;
      return;
    }

    const pts = flightData.points;
    const TRAIL_MS = 60_000;
    const MAX_ALPHA = 0.65;

    let currentIdx = 0;
    if (playbackTime > pts[0].timestamp) {
      let lo = 0, hi = pts.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].timestamp <= playbackTime) lo = mid;
        else hi = mid;
      }
      currentIdx = lo;
    }

    if (currentIdx === lastCurtainIdxRef.current) return;
    lastCurtainIdxRef.current = currentIdx;

    // Interpolated current position
    let iLat = pts[currentIdx].lat;
    let iLng = pts[currentIdx].lng;
    let iAlt = pts[currentIdx].altGPS;
    if (currentIdx < pts.length - 1) {
      const a = pts[currentIdx], b = pts[currentIdx + 1];
      const dt = b.timestamp - a.timestamp;
      if (dt > 0) {
        const frac = Math.min(1, (playbackTime - a.timestamp) / dt);
        iLat = a.lat    + (b.lat    - a.lat)    * frac;
        iLng = a.lng    + (b.lng    - a.lng)    * frac;
        iAlt = a.altGPS + (b.altGPS - a.altGPS) * frac;
      }
    }
    iAlt += altitudeOffset;

    const trailStartTs = playbackTime - TRAIL_MS;
    let trailStartIdx = 0;
    if (pts[0].timestamp < trailStartTs) {
      let lo = 0, hi = currentIdx;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].timestamp < trailStartTs) lo = mid; else hi = mid;
      }
      trailStartIdx = lo;
    }

    type TPt = { lng: number; lat: number; alt: number; th: number; ts: number };
    const trail: TPt[] = [];
    for (let i = trailStartIdx; i <= currentIdx; i++) {
      trail.push({ lng: pts[i].lng, lat: pts[i].lat, alt: pts[i].altGPS + altitudeOffset,
                   th: terrainHeightsRef.current[i] ?? 0, ts: pts[i].timestamp });
    }
    trail.push({ lng: iLng, lat: iLat, alt: iAlt, // iAlt already has offset applied
                 th: terrainHeightsRef.current[currentIdx] ?? 0, ts: playbackTime });

    const numSegs = trail.length - 1;
    const scratchColor = new Color();

    for (let s = 0; s < segs.length; s++) {
      const entity = segs[s];
      if (s >= numSegs) { entity.show = false; continue; }

      const a = trail[s], b = trail[s + 1];
      const midAge = playbackTime - (a.ts + b.ts) / 2;
      const t      = 1 - Math.min(1, midAge / TRAIL_MS);
      const alpha  = MAX_ALPHA * Math.pow(t, 1.5);

      (entity.wall!.positions      as ConstantProperty).setValue([
        Cartesian3.fromDegrees(a.lng, a.lat, a.alt),
        Cartesian3.fromDegrees(b.lng, b.lat, b.alt),
      ]);
      (entity.wall!.minimumHeights as ConstantProperty).setValue([a.th, b.th]);
      (entity.wall!.maximumHeights as ConstantProperty).setValue([a.alt, b.alt]);

      CURTAIN_BASE_COLOR.clone(scratchColor);
      scratchColor.alpha = alpha;
      ((entity.wall!.material as ColorMaterialProperty).color as ConstantProperty).setValue(scratchColor);

      entity.show = true;
    }

    viewerRef.current?.scene.requestRender();
  }, [flightData, playbackTime, isStopped, showShadowCurtain, altitudeOffset]); // eslint-disable-line react-hooks/exhaustive-deps
}
