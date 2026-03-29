import { useEffect, useRef, useState } from "react";
import {
  Viewer, Cartesian3, Math as CesiumMath,
} from "cesium";
import { useFlightStore } from "../../../stores/flightStore";

export function useCesiumViewer(containerRef: React.RefObject<HTMLDivElement | null>) {
  const viewerRef = useRef<Viewer | null>(null);
  const [camPos, setCamPos] = useState<{ lat: number; lng: number; alt: number } | null>(null);

  const { showCameraOverlay, pendingCameraTarget, setPendingCameraTarget } = useFlightStore();

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
    viewer.scene.screenSpaceCameraController.zoomFactor = 2.5; // default 5.0 — halved
    viewer.scene.globe.tileCacheSize = 500;          // default ~100; keeps more tiles in GPU memory
    viewer.scene.requestRenderMode = true;            // only render on scene changes, not every 16ms
    viewer.scene.maximumRenderTimeChange = Infinity;  // never force re-render for time alone
    viewer.scene.globe.maximumScreenSpaceError = 4;   // default 2; halves aggressive tile fetching

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track camera position for overlay — throttled to ~10 fps
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !showCameraOverlay) { setCamPos(null); return; }

    let lastUpdate = 0;
    const handler = viewer.scene.postRender.addEventListener(() => {
      const now = Date.now();
      if (now - lastUpdate < 100) return;
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

  // Camera control callbacks
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
    const { flightData, zoomAltitude } = useFlightStore.getState();
    const viewer = viewerRef.current;
    if (!viewer || !flightData || flightData.points.length === 0) return;
    const pts = flightData.points;
    const lat = (Math.min(...pts.map((p) => p.lat)) + Math.max(...pts.map((p) => p.lat))) / 2;
    const lng = (Math.min(...pts.map((p) => p.lng)) + Math.max(...pts.map((p) => p.lng))) / 2;
    viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(lng, lat, zoomAltitude), duration: 1.2 });
  };

  return { viewerRef, camPos, handleZoomIn, handleZoomOut, handleNorthUp, handleFlyToFlight };
}
