import { invoke } from "@tauri-apps/api/core";
import type { SiteInfo } from "../parsers/types";

/** Parse "S37.12269, E145.41304" or "S37.12269,E145.41304" into decimal lat/lng. */
function parseCoords(title: string): { lat: number; lng: number } | null {
  // Normalise non-breaking spaces and strip whitespace
  const s = title.replace(/\u00a0/g, " ").trim();
  const m = s.match(/([NS])\s*([\d.]+)[,\s]+([EW])\s*([\d.]+)/i);
  if (!m) return null;
  const lat = parseFloat(m[2]) * (m[1].toUpperCase() === "S" ? -1 : 1);
  const lng = parseFloat(m[4]) * (m[3].toUpperCase() === "W" ? -1 : 1);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

/**
 * Fetch a siteguide.org.au page and parse it into a SiteInfo object.
 * Uses the Tauri fetch_url_text command (bypasses CORS) + browser DOMParser.
 */
export async function fetchAndParseSiteInfo(url: string): Promise<Partial<SiteInfo>> {
  const html = await invoke<string>("fetch_url_text", { url });
  const doc = new DOMParser().parseFromString(html, "text/html");

  const result: Partial<SiteInfo> = { siteGuideUrl: url };

  // Official name
  const h1 = doc.querySelector("h1");
  if (h1?.textContent) result.officialName = h1.textContent.trim();

  // Region (h4 just above h1)
  const h4 = doc.querySelector("h4");
  if (h4?.textContent) result.region = h4.textContent.trim();

  // Coordinates + status from launch span
  const launchSpan = doc.querySelector("span.launch");
  if (launchSpan) {
    const title = launchSpan.getAttribute("title");
    if (title) {
      const coords = parseCoords(title);
      if (coords) {
        result.lat = coords.lat;
        result.lng = coords.lng;
      }
    }
    result.status = launchSpan.classList.contains("closed") ? "closed" : "open";
  } else {
    result.status = "unknown";
  }

  // Table rows: Type, Conditions, Height, Rating
  const tableRows = doc.querySelectorAll("table tr");
  tableRows.forEach((row) => {
    const cells = row.querySelectorAll("td, th");
    if (cells.length < 2) return;
    const key = cells[0].textContent?.trim().toLowerCase() ?? "";
    const val = cells[1].textContent?.trim() ?? "";
    if (!val) return;
    if (key.includes("type"))       result.type       = val;
    if (key.includes("condition"))  result.conditions = val;
    if (key.includes("height") || key.includes("altitude")) result.height = val;
    if (key.includes("rating"))     result.rating     = val;
  });

  // Description: paragraphs inside .col-md divs
  const descParagraphs = doc.querySelectorAll(".col-md p");
  if (descParagraphs.length > 0) {
    result.description = Array.from(descParagraphs)
      .map((p) => p.textContent?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n");
  }

  return result;
}
