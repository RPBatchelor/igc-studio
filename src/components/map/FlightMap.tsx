import { useEffect, useRef, useState } from "react";
import {
  Viewer, Cartesian3, Color, Ion,
  UrlTemplateImageryProvider, ImageryLayer,
  BingMapsImageryProvider, BingMapsStyle,
  CesiumTerrainProvider, EllipsoidTerrainProvider,
  PolygonHierarchy, ScreenSpaceEventHandler, ScreenSpaceEventType,
  Math as CesiumMath,
  type ImageryProvider,
  type Entity,
} from "cesium";
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
  const flightTrackEntityRef = useRef<Entity | null>(null);
  const airspaceEntitiesRef = useRef<Entity[]>([]);
  const sgZoneEntitiesRef = useRef<Entity[]>([]);

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

    handler.setInputAction((e: { endPosition: { x: number; y: number } }) => {
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

  // Draw flight track — fly to location only when the site changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flightData || flightData.points.length === 0) return;

    // Remove previous flight track only (not airspace entities)
    if (flightTrackEntityRef.current) {
      viewer.entities.remove(flightTrackEntityRef.current);
      flightTrackEntityRef.current = null;
    }

    const positions = Cartesian3.fromDegreesArrayHeights(
      flightData.points.flatMap((p) => [p.lng, p.lat, p.altGPS])
    );

    flightTrackEntityRef.current = viewer.entities.add({
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
          hierarchy:     new PolygonHierarchy(positions),
          material:      Color.fromCssColorString(style.fill).withAlpha(0.3),
          clampToGround: true,
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
