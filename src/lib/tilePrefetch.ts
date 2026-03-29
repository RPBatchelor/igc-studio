import type { LocationSite } from "../parsers/types";
import type { BaseLayerId } from "../parsers/types";
import { XYZ_URLS } from "../components/map/lib/imageryProviders";

/**
 * Convert a WGS-84 lat/lng + zoom level to Web Mercator tile indices.
 * Standard slippy-map formula: https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
 */
function latLngToTile(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = Math.pow(2, z);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

/**
 * Return all tile {x, y, z} within a square bounding box centred on lat/lng.
 */
function tilesForBbox(
  lat: number,
  lng: number,
  radiusDeg: number,
  zoom: number,
): Array<{ x: number; y: number; z: number }> {
  const topLeft = latLngToTile(lat + radiusDeg, lng - radiusDeg, zoom);
  const botRight = latLngToTile(lat - radiusDeg, lng + radiusDeg, zoom);
  const tiles: Array<{ x: number; y: number; z: number }> = [];
  for (let x = topLeft.x; x <= botRight.x; x++) {
    for (let y = topLeft.y; y <= botRight.y; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
}

/**
 * Expand a URL template string (same format as imageryProviders.ts XYZ_URLS)
 * into a concrete tile URL for the given x/y/z coordinates.
 *
 * ESRI templates use {z}/{y}/{x} (y before x).
 * OSM/Carto/OpenTopo templates use {z}/{x}/{y} (x before y).
 * Both are handled by simple string replacement.
 */
function expandUrl(template: string, x: number, y: number, z: number): string {
  return template
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

/**
 * Proactively download and cache tiles for all known flying sites.
 *
 * Called after a flight folder is scanned and sites are available.
 * Dispatches a PREFETCH_TILES message to the service worker, which
 * handles the actual fetch + cache.put in the background.
 *
 * Only runs if a SW controller is active — silently no-ops otherwise.
 *
 * @param sites   Site centroids from the flight store
 * @param baseLayer  Currently active base imagery layer
 */
export function prefetchSiteTiles(sites: LocationSite[], baseLayer: BaseLayerId): void {
  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker.controller;
  if (!sw) return;

  // Bing layers use quadkey tiles — no XYZ template available, skip.
  const template = XYZ_URLS[baseLayer];
  if (!template) return;

  // Collect URLs for z12–z15 around each site centroid (±0.08°)
  const ZOOM_LEVELS = [12, 13, 14, 15];
  const RADIUS_DEG = 0.08;

  const urls: string[] = [];
  for (const site of sites) {
    for (const z of ZOOM_LEVELS) {
      const tiles = tilesForBbox(site.lat, site.lng, RADIUS_DEG, z);
      for (const { x, y } of tiles) {
        urls.push(expandUrl(template, x, y, z));
      }
    }
  }

  if (urls.length === 0) return;

  sw.postMessage({ type: "PREFETCH_TILES", urls });
}
