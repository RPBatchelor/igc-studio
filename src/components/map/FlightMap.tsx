import { useEffect, useRef, useState } from "react";
import {
  Viewer, Cartesian2, Cartesian3, Color, Ion, ClassificationType,
  UrlTemplateImageryProvider, ImageryLayer,
  BingMapsImageryProvider, BingMapsStyle,
  CesiumTerrainProvider, EllipsoidTerrainProvider,
  PolygonHierarchy, ScreenSpaceEventHandler, ScreenSpaceEventType,
  Math as CesiumMath,
  Cartographic, sampleTerrainMostDetailed,
  ConstantProperty, WallGraphics, ColorMaterialProperty,
  type ImageryProvider,
  type Entity,
} from "cesium";

// Pre-computed base colour for the shadow curtain (#FF5500 warm orange)
const CURTAIN_BASE_COLOR = new Color(1.0, 85 / 255, 0, 1.0);
const MAX_CURTAIN_SEGS = 120; // covers 2 Hz IGC data × 60 s trail
import { Plus, Minus, Compass, LocateFixed } from "lucide-react";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useFlightStore } from "../../stores/flightStore";
import type { BaseLayerId, OverlayId } from "../../parsers/types";
import { sgZoneStyle, sgZoneDisplayName, ZONE_DISPLAY_NAMES } from "../../lib/sgZonesApi";

// XYZ/TMS tile layers — no API key required
const XYZ_URLS: Partial<Record<BaseLayerId, string>> = {
  // Satellite
  esriSatellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  // Topographic
  esriTopo:      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  esriNatGeo:    "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
  openTopo:      "https://tile.opentopomap.org/{z}/{x}/{y}.png",
  // Street
  osm:           "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  // Minimal / canvas
  esriLightGrey: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  esriDarkGrey:  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  cartoLight:    "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
  cartoDark:     "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
};

// Tile-based overlays only — entity-based overlays (airspace) have no URL entry
const OVERLAY_URLS: Partial<Record<OverlayId, string>> = {
  esriRoads: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
};

const AIRSPACE_STYLE: Record<string, { fill: string; outline: string }> = {
  A:       { fill: "#FF0000", outline: "#CC0000" },
  B:       { fill: "#0044FF", outline: "#0033CC" },
  C:       { fill: "#0066FF", outline: "#0044CC" },
  CTR:     { fill: "#FF2020", outline: "#CC0000" },
  D:       { fill: "#0099FF", outline: "#0077CC" },
  E:       { fill: "#00CCFF", outline: "#0099CC" },
  G:       { fill: "#00DD88", outline: "#00AA66" },
  R:       { fill: "#FF8800", outline: "#CC6600" },
  P:       { fill: "#AA00FF", outline: "#8800CC" },
  Q:       { fill: "#FFCC00", outline: "#CC9900" },
  default: { fill: "#888888", outline: "#555555" },
};

// ---------------------------------------------------------------------------
// Vario colour helpers — continuous gradient, Gaussian-smoothed
// ---------------------------------------------------------------------------

interface FlightPoint { lat: number; lng: number; altGPS: number; timestamp: number; }

// 7 control points covering −5 to +5 m/s, linear RGB interpolation
const VARIO_RAMP = [
  { v: -5, r:   0, g:  50, b: 200 },  // strong sink  — deep blue
  { v: -3, r:  50, g: 130, b: 255 },  // moderate sink — blue
  { v: -1, r: 140, g: 200, b: 255 },  // weak sink    — sky blue
  { v:  0, r: 180, g: 180, b: 180 },  // neutral      — grey
  { v:  1, r: 255, g: 160, b:   0 },  // weak thermal — amber
  { v:  3, r: 255, g:  80, b:   0 },  // good thermal — orange-red
  { v:  5, r: 210, g:  20, b:  20 },  // strong thermal — red
];

function varioToColor(vMs: number): Color {
  const v = Math.max(-5, Math.min(5, vMs));
  for (let i = 1; i < VARIO_RAMP.length; i++) {
    if (v <= VARIO_RAMP[i].v) {
      const t = (v - VARIO_RAMP[i - 1].v) / (VARIO_RAMP[i].v - VARIO_RAMP[i - 1].v);
      const a = VARIO_RAMP[i - 1], b = VARIO_RAMP[i];
      return Color.fromBytes(
        Math.round(a.r + t * (b.r - a.r)),
        Math.round(a.g + t * (b.g - a.g)),
        Math.round(a.b + t * (b.b - a.b)),
      );
    }
  }
  return Color.fromBytes(210, 20, 20);
}

// Gaussian kernel (half-width 30, sigma 10) — precomputed once
const GAUSS_HALF = 30;
const GAUSS_SIGMA = 10;
const GAUSS_KERNEL = (() => {
  const k = Array.from({ length: 2 * GAUSS_HALF + 1 }, (_, i) =>
    Math.exp(-0.5 * ((i - GAUSS_HALF) / GAUSS_SIGMA) ** 2)
  );
  const sum = k.reduce((a, b) => a + b, 0);
  return k.map((v) => v / sum);
})();

function computeTrackColors(pts: FlightPoint[]): Color[] {
  // Raw vario per point
  const raw = pts.map((p, i) => {
    if (i === 0) return 0;
    const dt = (p.timestamp - pts[i - 1].timestamp) / 1000;
    return dt > 0 ? (p.altGPS - pts[i - 1].altGPS) / dt : 0;
  });

  // Gaussian smooth
  const smoothed = raw.map((_, i) => {
    let sum = 0;
    for (let j = 0; j < GAUSS_KERNEL.length; j++) {
      const idx = Math.min(Math.max(0, i - GAUSS_HALF + j), raw.length - 1);
      sum += raw[idx] * GAUSS_KERNEL[j];
    }
    return sum;
  });

  // Map to colours
  const colors = smoothed.map(varioToColor);

  // Light 3-pt colour blend [0.25, 0.5, 0.25] to kill residual jitter
  return colors.map((c, i) => {
    const prev = colors[Math.max(0, i - 1)];
    const next = colors[Math.min(colors.length - 1, i + 1)];
    return Color.fromBytes(
      Math.round(prev.red * 255 * 0.25 + c.red * 255 * 0.5 + next.red * 255 * 0.25),
      Math.round(prev.green * 255 * 0.25 + c.green * 255 * 0.5 + next.green * 255 * 0.25),
      Math.round(prev.blue * 255 * 0.25 + c.blue * 255 * 0.5 + next.blue * 255 * 0.25),
    );
  });
}

interface ColorSegment {
  startIdx: number;  // index of first point
  endIdx: number;    // index of last point (inclusive)
  color: Color;      // midpoint colour of this segment
  entity: Entity | null;
}

async function buildBaseProvider(
  layer: BaseLayerId,
  bingMapsKey: string,
): Promise<ImageryProvider> {
  if (layer === "bingAerial" && bingMapsKey) {
    return BingMapsImageryProvider.fromUrl("https://dev.virtualearth.net", {
      key: bingMapsKey,
      mapStyle: BingMapsStyle.AERIAL,
    });
  }
  if (layer === "bingRoads" && bingMapsKey) {
    return BingMapsImageryProvider.fromUrl("https://dev.virtualearth.net", {
      key: bingMapsKey,
      mapStyle: BingMapsStyle.ROAD,
    });
  }
  const url = XYZ_URLS[layer] ?? XYZ_URLS.esriSatellite!;
  return new UrlTemplateImageryProvider({ url, maximumLevel: 19 });
}

export function FlightMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const baseLayerRef = useRef<ImageryLayer | null>(null);
  const overlayRefs = useRef<Map<OverlayId, ImageryLayer>>(new Map());
  const prevSiteIdRef = useRef<string | null>(null);
  const colorSegmentsRef = useRef<ColorSegment[]>([]);
  const partialEntityRef = useRef<Entity | null>(null);
  const lastRevealedIdxRef = useRef<number>(-1);
  const airspaceEntitiesRef = useRef<Entity[]>([]);
  const sgZoneEntitiesRef = useRef<Entity[]>([]);
  const curtainEntitiesRef = useRef<Entity[]>([]);
  const lastCurtainIdxRef = useRef<number>(-1);
  const terrainHeightsRef = useRef<number[]>([]);

  const [camPos, setCamPos] = useState<{ lat: number; lng: number; alt: number } | null>(null);
  const [zoneTooltip, setZoneTooltip] = useState<{ x: number; y: number; name: string; class: string } | null>(null);

  const {
    flightData, playbackTime,
    baseLayer, overlays,
    terrainEnabled, cesiumIonToken, bingMapsKey,
    zoomAltitude,
    airspaces, sgZones,
    showCameraOverlay, altUnit,
    pendingCameraTarget, setPendingCameraTarget,
    isStopped, showShadowCurtain,
  } = useFlightStore();

  // Create viewer once
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const viewer = new Viewer(containerRef.current, {
      timeline: false,
      animation: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      geocoder: false,
      fullscreenButton: false,
      selectionIndicator: false,
      infoBox: false,
    });

    viewer.imageryLayers.removeAll();
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(134.0, -25.0, 5_000_000),
    });
    viewerRef.current = viewer;

    return () => {
      viewer.destroy();
      viewerRef.current = null;
      baseLayerRef.current = null;
      overlayRefs.current.clear();
    };
  }, []);

  // Hover tooltip for sgZone entities
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((e: { endPosition: Cartesian2 }) => {
      const picked = viewer.scene.pick(e.endPosition);
      if (picked?.id && sgZoneEntitiesRef.current.includes(picked.id as Entity)) {
        const entity = picked.id as Entity;
        const [cls, ...rest] = (entity.name ?? "").split(": ");
        setZoneTooltip({ x: e.endPosition.x, y: e.endPosition.y, name: rest.join(": "), class: cls });
      } else {
        setZoneTooltip(null);
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => { handler.destroy(); };
  }, [sgZones]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track camera position for overlay — throttled to ~10 fps
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !showCameraOverlay) { setCamPos(null); return; }

    let lastUpdate = 0;
    const handler = viewer.scene.postRender.addEventListener(() => {
      const now = Date.now();
      if (now - lastUpdate < 100) return; // ~10 fps
      lastUpdate = now;
      const carto = viewer.camera.positionCartographic;
      setCamPos({
        lat: carto.latitude  * (180 / Math.PI),
        lng: carto.longitude * (180 / Math.PI),
        alt: carto.height,
      });
    });

    return () => { handler(); };
  }, [showCameraOverlay, viewerRef.current]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch base layer (async to support Bing's quadkey provider)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    let cancelled = false;

    // Remove current base + overlays
    if (baseLayerRef.current) {
      viewer.imageryLayers.remove(baseLayerRef.current);
      baseLayerRef.current = null;
    }
    overlayRefs.current.forEach((l) => viewer.imageryLayers.remove(l));
    overlayRefs.current.clear();

    buildBaseProvider(baseLayer, bingMapsKey)
      .then((provider) => {
        if (cancelled || !viewerRef.current) return;
        baseLayerRef.current = viewerRef.current.imageryLayers.addImageryProvider(provider);

        // Re-add active tile overlays on top (skip entity-based overlays)
        useFlightStore.getState().overlays.forEach((id) => {
          if (cancelled || !viewerRef.current) return;
          const url = OVERLAY_URLS[id];
          if (!url) return;
          const ol = viewerRef.current.imageryLayers.addImageryProvider(
            new UrlTemplateImageryProvider({ url, maximumLevel: 19 })
          );
          overlayRefs.current.set(id, ol);
        });
      })
      .catch((e) => console.warn("Failed to load base layer:", e));

    return () => { cancelled = true; };
  }, [baseLayer, bingMapsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync tile overlay layers (entity-based overlays like airspace are handled separately)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    overlayRefs.current.forEach((l) => viewer.imageryLayers.remove(l));
    overlayRefs.current.clear();

    overlays.forEach((id) => {
      const url = OVERLAY_URLS[id];
      if (!url) return; // entity-controlled overlay — skip tile layer creation
      const layer = viewer.imageryLayers.addImageryProvider(
        new UrlTemplateImageryProvider({ url, maximumLevel: 19 })
      );
      overlayRefs.current.set(id, layer);
    });
  }, [overlays]);

  // Switch terrain provider
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    let cancelled = false;

    if (terrainEnabled && cesiumIonToken) {
      Ion.defaultAccessToken = cesiumIonToken;
      CesiumTerrainProvider.fromIonAssetId(1)
        .then((provider) => {
          if (!cancelled && viewerRef.current) viewerRef.current.terrainProvider = provider;
        })
        .catch(() => {
          if (!cancelled && viewerRef.current)
            viewerRef.current.terrainProvider = new EllipsoidTerrainProvider();
        });
    } else {
      viewer.terrainProvider = new EllipsoidTerrainProvider();
    }

    return () => { cancelled = true; };
  }, [terrainEnabled, cesiumIonToken]);

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

    // One entity per consecutive point pair — stride=1 gives per-point reveal
    // granularity so the trail grows smoothly at any playback speed.
    for (let i = 0; i < pts.length - 1; i++) {
      const seg: ColorSegment = { startIdx: i, endIdx: i + 1, color: colors[i], entity: null };
      const positions = [
        Cartesian3.fromDegrees(pts[i].lng,     pts[i].lat,     pts[i].altGPS),
        Cartesian3.fromDegrees(pts[i+1].lng,   pts[i+1].lat,   pts[i+1].altGPS),
      ];
      seg.entity = viewer.entities.add({
        show: false,
        polyline: { positions, width: 4, material: seg.color, clampToGround: false },
      });
      colorSegmentsRef.current.push(seg);
    }
    lastRevealedIdxRef.current = -1;
    terrainHeightsRef.current = [];

    // Sample terrain heights for curtain minimumHeights (async, best-effort)
    const cartographics = pts.map((p) => Cartographic.fromDegrees(p.lng, p.lat));
    const tp = viewerRef.current?.terrainProvider;
    if (tp) {
      sampleTerrainMostDetailed(tp, cartographics)
        .then((sampled) => {
          terrainHeightsRef.current = sampled.map((c) => c.height ?? 0);
        })
        .catch(() => { terrainHeightsRef.current = []; });
    }

    // Pre-allocate per-segment curtain entities (one per consecutive point pair).
    // Updated in-place via ConstantProperty.setValue — no entity destruction during playback.
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
  }, [flightData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update pilot marker + progressive coloured trail
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flightData || flightData.points.length === 0) return;

    const existing = viewer.entities.getById("pilot");
    if (existing) viewer.entities.remove(existing);

    const pts = flightData.points;
    let pos = { lat: pts[0].lat, lng: pts[0].lng, alt: pts[0].altGPS };

    // Binary search for current point index
    let currentIdx = 0;
    if (playbackTime > pts[0].timestamp) {
      let lo = 0, hi = pts.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].timestamp <= playbackTime) lo = mid;
        else hi = mid;
      }
      currentIdx = lo;
      const a = pts[lo], b = pts[hi];
      const t = (playbackTime - a.timestamp) / (b.timestamp - a.timestamp);
      pos = {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        alt: a.altGPS + (b.altGPS - a.altGPS) * t,
      };
    }

    // Update coloured trail
    if (partialEntityRef.current) {
      viewer.entities.remove(partialEntityRef.current);
      partialEntityRef.current = null;
    }

    if (isStopped) {
      // Stopped — show every segment, reset incremental tracker
      for (const seg of colorSegmentsRef.current) {
        if (seg.entity) seg.entity.show = true;
      }
      lastRevealedIdxRef.current = colorSegmentsRef.current.length - 1;
    } else {
      const lastRevealed = lastRevealedIdxRef.current;

      if (currentIdx < lastRevealed) {
        // Scrubbed backward — hide everything beyond currentIdx
        for (const seg of colorSegmentsRef.current) {
          if (seg.entity) seg.entity.show = seg.endIdx <= currentIdx;
        }
      } else {
        // Normal forward advance — only reveal newly-passed segments
        for (let i = Math.max(0, lastRevealed); i < colorSegmentsRef.current.length; i++) {
          const seg = colorSegmentsRef.current[i];
          if (!seg.entity) continue;
          if (seg.endIdx <= currentIdx) {
            seg.entity.show = true;
          } else {
            break; // segments are in order, nothing further is ready yet
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
  }, [flightData, playbackTime, isStopped]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Binary search for current index
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

    // Throttle — Cesium needs time between frames to build WallGraphics geometry.
    // Only rebuild when the track index advances; skipping in-between frames is fine
    // because the positional difference is sub-metre at typical paragliding speeds.
    if (currentIdx === lastCurtainIdxRef.current) return;
    lastCurtainIdxRef.current = currentIdx;

    // Interpolated current position — closes the visual gap between the
    // last GPS fix and where the pilot dot is actually rendered
    let iLat = pts[currentIdx].lat;
    let iLng = pts[currentIdx].lng;
    let iAlt = pts[currentIdx].altGPS;
    if (currentIdx < pts.length - 1) {
      const a = pts[currentIdx], b = pts[currentIdx + 1];
      const dt = b.timestamp - a.timestamp;
      if (dt > 0) {
        const frac = Math.min(1, (playbackTime - a.timestamp) / dt);
        iLat = a.lat  + (b.lat  - a.lat)  * frac;
        iLng = a.lng  + (b.lng  - a.lng)  * frac;
        iAlt = a.altGPS + (b.altGPS - a.altGPS) * frac;
      }
    }

    // Binary search for the start of the trail window
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

    // Build trail point array; append interpolated current position as last point
    type TPt = { lng: number; lat: number; alt: number; th: number; ts: number };
    const trail: TPt[] = [];
    for (let i = trailStartIdx; i <= currentIdx; i++) {
      trail.push({ lng: pts[i].lng, lat: pts[i].lat, alt: pts[i].altGPS,
                   th: terrainHeightsRef.current[i] ?? 0, ts: pts[i].timestamp });
    }
    trail.push({ lng: iLng, lat: iLat, alt: iAlt,
                 th: terrainHeightsRef.current[currentIdx] ?? 0, ts: playbackTime });

    const numSegs = trail.length - 1;
    const scratchColor = new Color();

    for (let s = 0; s < segs.length; s++) {
      const entity = segs[s];
      if (s >= numSegs) { entity.show = false; continue; }

      const a = trail[s], b = trail[s + 1];

      // Continuous alpha — newest segment (s = numSegs-1) gets MAX_ALPHA, oldest gets ~0
      const midAge = playbackTime - (a.ts + b.ts) / 2;
      const t      = 1 - Math.min(1, midAge / TRAIL_MS); // 0 = oldest, 1 = newest
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
  }, [flightData, playbackTime, isStopped, showShadowCurtain]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render 3D airspace polygons
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Remove old airspace entities
    airspaceEntitiesRef.current.forEach((e) => viewer.entities.remove(e));
    airspaceEntitiesRef.current = [];

    if (!overlays.has("airspace") || airspaces.length === 0) return;

    for (const feature of airspaces) {
      if (feature.polygon.length < 3) continue;
      if (feature.ceilM <= feature.floorM) continue;

      const style = AIRSPACE_STYLE[feature.class] ?? AIRSPACE_STYLE.default;
      const positions = feature.polygon.map((p) => Cartesian3.fromDegrees(p.lng, p.lat));

      const entity = viewer.entities.add({
        name: `${feature.class} ${feature.name}`,
        polygon: {
          hierarchy:      new PolygonHierarchy(positions),
          height:         Math.max(0, feature.floorM),
          extrudedHeight: Math.max(1, feature.ceilM),
          material:       Color.fromCssColorString(style.fill).withAlpha(0.2),
          outline:        true,
          outlineColor:   Color.fromCssColorString(style.outline).withAlpha(0.75),
          outlineWidth:   1.5,
        },
      });
      airspaceEntitiesRef.current.push(entity);
    }
  }, [airspaces, overlays]);

  // Consume search-initiated camera targets
  useEffect(() => {
    if (!pendingCameraTarget || !viewerRef.current) return;
    viewerRef.current.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        pendingCameraTarget.lng,
        pendingCameraTarget.lat,
        pendingCameraTarget.altitude,
      ),
      duration: 1.5,
    });
    setPendingCameraTarget(null);
  }, [pendingCameraTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render Site Guide landing/no-landing zones (ground-clamped polygons)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    sgZoneEntitiesRef.current.forEach((e) => viewer.entities.remove(e));
    sgZoneEntitiesRef.current = [];

    if (!overlays.has("sgZones") || sgZones.length === 0) return;

    for (const zone of sgZones) {
      if (zone.polygon.length < 3) continue;

      const style = sgZoneStyle(zone.class);
      const positions = zone.polygon.map((p) => Cartesian3.fromDegrees(p.lng, p.lat));

      const entity = viewer.entities.add({
        name: `${zone.class}: ${zone.name}`,
        polygon: {
          hierarchy:          new PolygonHierarchy(positions),
          material:           Color.fromCssColorString(style.fill).withAlpha(0.3),
          classificationType: ClassificationType.TERRAIN,
        },
      });
      sgZoneEntitiesRef.current.push(entity);
    }
  }, [sgZones, overlays]);

  const handleZoomIn = () => {
    const cam = viewerRef.current?.camera;
    if (!cam) return;
    cam.zoomIn(cam.positionCartographic.height * 0.4);
  };

  const handleZoomOut = () => {
    const cam = viewerRef.current?.camera;
    if (!cam) return;
    cam.zoomOut(cam.positionCartographic.height * 0.4);
  };

  const handleNorthUp = () => {
    const cam = viewerRef.current?.camera;
    if (!cam) return;
    cam.flyTo({
      destination: cam.position.clone(),
      orientation: { heading: CesiumMath.toRadians(0), pitch: cam.pitch, roll: 0 },
      duration: 0.5,
    });
  };

  const handleFlyToFlight = () => {
    const viewer = viewerRef.current;
    if (!viewer || !flightData || flightData.points.length === 0) return;
    const pts = flightData.points;
    const lat = (Math.min(...pts.map((p) => p.lat)) + Math.max(...pts.map((p) => p.lat))) / 2;
    const lng = (Math.min(...pts.map((p) => p.lng)) + Math.max(...pts.map((p) => p.lng))) / 2;
    viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(lng, lat, zoomAltitude), duration: 1.2 });
  };

  const btnStyle: React.CSSProperties = {
    width: 32, height: 32,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    cursor: "pointer",
    color: "var(--text-secondary)",
    transition: "background 0.15s, color 0.15s",
  };

  const onBtnEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-tertiary)";
    (e.currentTarget as HTMLButtonElement).style.color = "var(--text-bright)";
  };
  const onBtnLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-secondary)";
    (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Map controls overlay */}
      <div style={{
        position: "absolute", top: 12, right: 12,
        display: "flex", flexDirection: "column", gap: 4,
        zIndex: 10,
      }}>
        <button style={btnStyle} title="Zoom in"       onClick={handleZoomIn}     onMouseEnter={onBtnEnter} onMouseLeave={onBtnLeave}><Plus size={16} /></button>
        <button style={btnStyle} title="Zoom out"      onClick={handleZoomOut}    onMouseEnter={onBtnEnter} onMouseLeave={onBtnLeave}><Minus size={16} /></button>
        <button style={{ ...btnStyle, marginTop: 4 }} title="Reset to north" onClick={handleNorthUp}    onMouseEnter={onBtnEnter} onMouseLeave={onBtnLeave}><Compass size={16} /></button>
        {flightData && (
          <button style={btnStyle} title="Fly to flight" onClick={handleFlyToFlight} onMouseEnter={onBtnEnter} onMouseLeave={onBtnLeave}><LocateFixed size={16} /></button>
        )}
      </div>

      {/* Site Guide Zones legend */}
      {overlays.has("sgZones") && sgZones.length > 0 && (() => {
        const presentClasses = [...new Set(sgZones.map((z) => z.class))].filter((c) => ZONE_DISPLAY_NAMES[c]);
        if (presentClasses.length === 0) return null;
        return (
          <div style={{
            position: "absolute", bottom: showCameraOverlay ? 90 : 12, left: 12,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5,
            padding: "7px 10px", zIndex: 10, pointerEvents: "none", userSelect: "none",
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", color: "rgba(255,255,255,0.45)", marginBottom: 5 }}>
              Zone Types
            </div>
            {presentClasses.map((cls) => {
              const style = sgZoneStyle(cls);
              return (
                <div key={cls} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: 2, flexShrink: 0,
                    background: style.fill, opacity: 0.85,
                    border: `1px solid ${style.outline}`,
                  }} />
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>{sgZoneDisplayName(cls)}</span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Zone hover tooltip */}
      {zoneTooltip && (
        <div style={{
          position: "absolute",
          left: zoneTooltip.x + 14,
          top: zoneTooltip.y - 10,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
          border: "1px solid rgba(255,255,255,0.15)", borderRadius: 5,
          padding: "5px 10px", zIndex: 20, pointerEvents: "none", userSelect: "none",
          maxWidth: 220,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: zoneTooltip.name ? 3 : 0 }}>
            <div style={{
              width: 10, height: 10, borderRadius: 2, flexShrink: 0,
              background: sgZoneStyle(zoneTooltip.class).fill,
              border: `1px solid ${sgZoneStyle(zoneTooltip.class).outline}`,
            }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.95)" }}>
              {sgZoneDisplayName(zoneTooltip.class)}
            </span>
          </div>
          {zoneTooltip.name && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", paddingLeft: 16 }}>
              {zoneTooltip.name}
            </div>
          )}
        </div>
      )}

      {/* Camera position overlay */}
      {showCameraOverlay && camPos && (
        <div style={{
          position: "absolute", bottom: 12, right: 12,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 5,
          padding: "5px 10px",
          fontSize: 11,
          fontFamily: "monospace",
          color: "rgba(255,255,255,0.85)",
          lineHeight: 1.7,
          zIndex: 10,
          pointerEvents: "none",
          userSelect: "none",
        }}>
          <div><span style={{ opacity: 0.6 }}>Lat </span>{camPos.lat.toFixed(5)}°</div>
          <div><span style={{ opacity: 0.6 }}>Lng </span>{camPos.lng.toFixed(5)}°</div>
          <div><span style={{ opacity: 0.6 }}>Alt </span>{
            altUnit === "imperial"
              ? `${(camPos.alt * 3.28084).toLocaleString(undefined, { maximumFractionDigits: 0 })} ft`
              : camPos.alt >= 1000
                ? `${(camPos.alt / 1000).toFixed(1)} km`
                : `${camPos.alt.toFixed(0)} m`
          }</div>
        </div>
      )}
    </div>
  );
}
