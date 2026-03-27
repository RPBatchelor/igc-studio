import { useEffect, useRef, useState } from "react";
import {
  Viewer, Cartesian2, Cartesian3, Color, ClassificationType,
  PolygonHierarchy, ScreenSpaceEventHandler, ScreenSpaceEventType,
  type Entity,
} from "cesium";
import { useFlightStore } from "../../../stores/flightStore";
import { sgZoneStyle } from "../../../lib/sgZonesApi";
import { AIRSPACE_STYLE } from "../lib/imageryProviders";

export interface ZoneTooltip {
  x: number;
  y: number;
  name: string;
  class: string;
}

export function useMapOverlays(viewerRef: React.RefObject<Viewer | null>) {
  const airspaceEntitiesRef = useRef<Entity[]>([]);
  const sgZoneEntitiesRef   = useRef<Entity[]>([]);
  const [zoneTooltip, setZoneTooltip] = useState<ZoneTooltip | null>(null);

  const { airspaces, sgZones, overlays } = useFlightStore();

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

  // Render 3D airspace polygons
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    airspaceEntitiesRef.current.forEach((e) => viewer.entities.remove(e));
    airspaceEntitiesRef.current = [];

    if (!overlays.has("airspace") || airspaces.length === 0) return;

    for (const feature of airspaces) {
      if (feature.polygon.length < 3 || feature.ceilM <= feature.floorM) continue;

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
  }, [airspaces, overlays]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [sgZones, overlays]); // eslint-disable-line react-hooks/exhaustive-deps

  return { zoneTooltip };
}
