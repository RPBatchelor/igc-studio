import type { FlightMeta, LocationSite } from "../parsers/types";
import { haversineKm } from "./stats";

const CLUSTER_RADIUS_KM = 3;

function siteId(lat: number, lng: number): string {
  return `${lat.toFixed(3)}_${lng.toFixed(3)}`;
}

/** Extract site name from a folder name like "26-02-07 - Southside" → "Southside" */
function extractSiteName(folderName: string): string | null {
  const match = folderName.match(/^\d{2}-\d{2}-\d{2}\s+-\s+(.+)$/);
  return match ? match[1].trim() : null;
}

/** Most common value in an array */
function mostCommon(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/** Group flights into geographic clusters */
export function clusterIntoSites(flights: FlightMeta[]): LocationSite[] {
  const sites: LocationSite[] = [];

  for (const flight of flights) {
    let nearest: LocationSite | null = null;
    let nearestDist = Infinity;

    for (const site of sites) {
      const d = haversineKm(flight.lat, flight.lng, site.lat, site.lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = site;
      }
    }

    if (nearest && nearestDist <= CLUSTER_RADIUS_KM) {
      nearest.flights.push(flight);
      // Update centroid (rolling average)
      const n = nearest.flights.length;
      nearest.lat = (nearest.lat * (n - 1) + flight.lat) / n;
      nearest.lng = (nearest.lng * (n - 1) + flight.lng) / n;
    } else {
      // Derive initial name from folder pattern, fallback to coordinates
      const extracted = extractSiteName(flight.folderName);
      const name = extracted ?? `${flight.lat.toFixed(3)}°, ${flight.lng.toFixed(3)}°`;

      sites.push({
        id: siteId(flight.lat, flight.lng),
        name,
        lat: flight.lat,
        lng: flight.lng,
        flights: [flight],
        geocoded: false,
      });
    }
  }

  // Refine names: for each site, pick the most common extracted folder name across all flights
  for (const site of sites) {
    if (!site.geocoded) {
      const extracted = site.flights
        .map((f) => extractSiteName(f.folderName))
        .filter((n): n is string => n !== null);
      const best = mostCommon(extracted);
      if (best) site.name = best;
    }
    // Sort by full path — folders are named YY-MM-DD so path sorts chronologically
    site.flights.sort((a, b) => a.path.localeCompare(b.path));
  }

  return sites.sort((a, b) => a.name.localeCompare(b.name));
}

/** Reverse-geocode each site's centroid via OSM Nominatim (rate-limited to 1 req/sec).
 *  Calls `onSiteGeocoded` progressively as results arrive. */
export async function geocodeSites(
  sites: LocationSite[],
  overrides: Record<string, string>,
  onSiteGeocoded: (siteId: string, name: string) => void
): Promise<boolean> {
  let anyGeocoded = false;

  for (const site of sites) {
    // Skip if user has already named this site
    if (overrides[site.id]) continue;

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${site.lat}&lon=${site.lng}&format=json&zoom=10`;
      const res = await fetch(url, {
        headers: { "Accept-Language": "en", "User-Agent": "IGCStudio/1.0" },
      });
      if (!res.ok) throw new Error(res.statusText);

      const data = await res.json();
      const addr = data.address ?? {};
      // Build a concise name: suburb/village/town, state
      const place =
        addr.suburb ??
        addr.village ??
        addr.town ??
        addr.city ??
        addr.county ??
        data.display_name?.split(",")[0];
      const state = addr.state ?? addr.region;
      const name = state ? `${place}, ${state}` : place;

      if (name) {
        onSiteGeocoded(site.id, name);
        anyGeocoded = true;
      }
    } catch {
      // Network unavailable or rate-limited — leave existing name
    }

    // Nominatim rate limit: 1 req/sec
    await new Promise((r) => setTimeout(r, 1100));
  }

  return anyGeocoded;
}
