import { useEffect, useRef } from "react";
import { Viewer, Cartesian3, Color, Ion, UrlTemplateImageryProvider, ImageryLayer } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useFlightStore } from "../../stores/flightStore";
import type { MapLayerId } from "../../parsers/types";

Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkNjMzZWE2Yi01ZDVhLTQ0MmEtOWMyNy1mMjMwMzI3NjYxMTgiLCJpZCI6MjU5LCJpYXQiOjE3MzI2MjI4NjN9.RWpUBz9ZzO0clDeRkX3CSVQG-1MiFBXjuqfFGLHjeZA";

const LAYER_URLS: Partial<Record<MapLayerId, string>> = {
  osm:          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  bingAerial:   "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  esriSatellite:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  bingRoad:     "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
};

export function FlightMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const layerRefs = useRef<Map<MapLayerId, ImageryLayer>>(new Map());
  const { flightData, playbackTime, activeLayers } = useFlightStore();

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
      layerRefs.current.clear();
    };
  }, []);

  // Sync imagery layers with activeLayers store
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    for (const [id, url] of Object.entries(LAYER_URLS) as [MapLayerId, string][]) {
      const isActive = activeLayers.has(id);
      const existing = layerRefs.current.get(id);

      if (isActive && !existing) {
        const layer = viewer.imageryLayers.addImageryProvider(
          new UrlTemplateImageryProvider({ url, maximumLevel: 19 })
        );
        layerRefs.current.set(id, layer);
      } else if (!isActive && existing) {
        viewer.imageryLayers.remove(existing);
        layerRefs.current.delete(id);
      }
    }
  }, [activeLayers]);

  // Draw flight track
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

    const pts = flightData.points;
    const lat = (Math.min(...pts.map((p) => p.lat)) + Math.max(...pts.map((p) => p.lat))) / 2;
    const lng = (Math.min(...pts.map((p) => p.lng)) + Math.max(...pts.map((p) => p.lng))) / 2;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(lng, lat, 15000),
      duration: 1.5,
    });
  }, [flightData]);

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

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
