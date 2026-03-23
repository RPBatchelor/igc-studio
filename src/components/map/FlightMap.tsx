import { useEffect, useRef } from "react";
import {
  Viewer, Cartesian3, Color, Ion,
  UrlTemplateImageryProvider, ImageryLayer,
  BingMapsImageryProvider, BingMapsStyle,
  CesiumTerrainProvider, EllipsoidTerrainProvider,
  Math as CesiumMath,
  type ImageryProvider,
} from "cesium";
import { Plus, Minus, Compass, LocateFixed } from "lucide-react";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useFlightStore } from "../../stores/flightStore";
import type { BaseLayerId, OverlayId } from "../../parsers/types";

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

const OVERLAY_URLS: Record<OverlayId, string> = {
  esriRoads: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
};

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

  const {
    flightData, playbackTime,
    baseLayer, overlays,
    terrainEnabled, cesiumIonToken, bingMapsKey,
    zoomAltitude,
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
    viewerRef.current = viewer;

    return () => {
      viewer.destroy();
      viewerRef.current = null;
      baseLayerRef.current = null;
      overlayRefs.current.clear();
    };
  }, []);

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

        // Re-add active overlays on top
        useFlightStore.getState().overlays.forEach((id) => {
          if (cancelled || !viewerRef.current) return;
          const ol = viewerRef.current.imageryLayers.addImageryProvider(
            new UrlTemplateImageryProvider({ url: OVERLAY_URLS[id], maximumLevel: 19 })
          );
          overlayRefs.current.set(id, ol);
        });
      })
      .catch((e) => console.warn("Failed to load base layer:", e));

    return () => { cancelled = true; };
  }, [baseLayer, bingMapsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync overlay layers
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    overlayRefs.current.forEach((l) => viewer.imageryLayers.remove(l));
    overlayRefs.current.clear();

    overlays.forEach((id) => {
      const layer = viewer.imageryLayers.addImageryProvider(
        new UrlTemplateImageryProvider({ url: OVERLAY_URLS[id], maximumLevel: 19 })
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

  // Draw flight track — fly to location only when the site changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flightData || flightData.points.length === 0) return;

    viewer.entities.removeAll();

    const positions = Cartesian3.fromDegreesArrayHeights(
      flightData.points.flatMap((p) => [p.lng, p.lat, p.altGPS])
    );

    viewer.entities.add({
      polyline: { positions, width: 3, material: Color.DODGERBLUE, clampToGround: false },
    });

    // Determine which site this flight belongs to (null if sites not loaded / opened from Explorer)
    const { sites, selectedFile } = useFlightStore.getState();
    const currentSiteId = sites.find((s) => s.flights.some((f) => f.path === selectedFile))?.id ?? null;

    // Only fly if we moved to a different site (or first load, or site unknown)
    const sameLocation = currentSiteId !== null && currentSiteId === prevSiteIdRef.current;
    prevSiteIdRef.current = currentSiteId;

    if (!sameLocation) {
      const pts = flightData.points;
      const lat = (Math.min(...pts.map((p) => p.lat)) + Math.max(...pts.map((p) => p.lat))) / 2;
      const lng = (Math.min(...pts.map((p) => p.lng)) + Math.max(...pts.map((p) => p.lng))) / 2;
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lng, lat, zoomAltitude),
        duration: 1.5,
      });
    }
  }, [flightData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update pilot marker
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flightData || flightData.points.length === 0) return;

    const existing = viewer.entities.getById("pilot");
    if (existing) viewer.entities.remove(existing);

    const pts = flightData.points;
    let pos = { lat: pts[0].lat, lng: pts[0].lng, alt: pts[0].altGPS };

    if (playbackTime > pts[0].timestamp) {
      let lo = 0, hi = pts.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].timestamp <= playbackTime) lo = mid;
        else hi = mid;
      }
      const a = pts[lo], b = pts[hi];
      const t = (playbackTime - a.timestamp) / (b.timestamp - a.timestamp);
      pos = {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        alt: a.altGPS + (b.altGPS - a.altGPS) * t,
      };
    }

    viewer.entities.add({
      id: "pilot",
      position: Cartesian3.fromDegrees(pos.lng, pos.lat, pos.alt),
      point: { pixelSize: 12, color: Color.RED, outlineColor: Color.WHITE, outlineWidth: 2 },
    });
  }, [flightData, playbackTime]);

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
    </div>
  );
}
