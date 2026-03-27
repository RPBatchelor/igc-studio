import { useEffect, useRef } from "react";
import {
  Viewer, Ion, ImageryLayer,
  UrlTemplateImageryProvider,
  CesiumTerrainProvider, EllipsoidTerrainProvider,
} from "cesium";
import { useFlightStore } from "../../../stores/flightStore";
import type { OverlayId } from "../../../parsers/types";
import { buildBaseProvider, OVERLAY_URLS } from "../lib/imageryProviders";

export function useImageryLayers(viewerRef: React.RefObject<Viewer | null>) {
  const baseLayerRef = useRef<ImageryLayer | null>(null);
  const overlayRefs = useRef<Map<OverlayId, ImageryLayer>>(new Map());

  const { baseLayer, overlays, terrainEnabled, cesiumIonToken, bingMapsKey } = useFlightStore();

  // Switch base layer (async to support Bing's quadkey provider)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    let cancelled = false;

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

  // Sync tile overlay layers (entity-based overlays handled separately)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    overlayRefs.current.forEach((l) => viewer.imageryLayers.remove(l));
    overlayRefs.current.clear();

    overlays.forEach((id) => {
      const url = OVERLAY_URLS[id];
      if (!url) return;
      const layer = viewer.imageryLayers.addImageryProvider(
        new UrlTemplateImageryProvider({ url, maximumLevel: 19 })
      );
      overlayRefs.current.set(id, layer);
    });
  }, [overlays]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [terrainEnabled, cesiumIonToken]); // eslint-disable-line react-hooks/exhaustive-deps
}
