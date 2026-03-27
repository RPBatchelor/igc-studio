import {
  UrlTemplateImageryProvider,
  BingMapsImageryProvider,
  BingMapsStyle,
  type ImageryProvider,
} from "cesium";
import type { BaseLayerId, OverlayId } from "../../../parsers/types";

// XYZ/TMS tile layers — no API key required
export const XYZ_URLS: Partial<Record<BaseLayerId, string>> = {
  esriSatellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  esriTopo:      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  esriNatGeo:    "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
  openTopo:      "https://tile.opentopomap.org/{z}/{x}/{y}.png",
  osm:           "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  esriLightGrey: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  esriDarkGrey:  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  cartoLight:    "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
  cartoDark:     "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
};

// Tile-based overlays only — entity-based overlays (airspace, sgZones) have no URL entry
export const OVERLAY_URLS: Partial<Record<OverlayId, string>> = {
  esriRoads: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
};

export const AIRSPACE_STYLE: Record<string, { fill: string; outline: string }> = {
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

export async function buildBaseProvider(
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
