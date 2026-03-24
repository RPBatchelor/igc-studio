import type { AirspaceFeature } from "../parsers/types";

// ---------------------------------------------------------------------------
// OpenAir format parser
// Handles: AC, AN, AH, AL, DP, V X=, DC
// Skips:   DA, DB, DY, SP, SB, AT, AY, V D=, V Z=, V W=
// ---------------------------------------------------------------------------

export function parseOpenAir(text: string): AirspaceFeature[] {
  const features: AirspaceFeature[] = [];
  let featureIndex = 0;

  type Partial_ = {
    class: string;
    name?: string;
    ceilM?: number;
    floorM?: number;
    ceilIsAGL: boolean;
    floorIsAGL: boolean;
    polygon: Array<{ lat: number; lng: number }>;
  };

  let current: Partial_ | null = null;
  let circleCenter: { lat: number; lng: number } | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const f = current;
    if (
      f.name &&
      f.polygon.length >= 3 &&
      f.ceilM !== undefined &&
      f.floorM !== undefined &&
      f.ceilM > f.floorM
    ) {
      features.push({
        id: `${f.class}-${f.name.replace(/\s+/g, "")}-${featureIndex++}`,
        name: f.name,
        class: f.class,
        floorM: f.floorM,
        ceilM: f.ceilM,
        floorIsAGL: f.floorIsAGL,
        ceilIsAGL: f.ceilIsAGL,
        polygon: f.polygon,
      });
    }
    current = null;
    circleCenter = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("*")) continue;

    if (line.startsWith("AC ")) {
      pushCurrent();
      current = {
        class: line.slice(3).trim(),
        ceilIsAGL: false,
        floorIsAGL: false,
        polygon: [],
      };
    } else if (current) {
      if (line.startsWith("AN ")) {
        current.name = line.slice(3).trim();
      } else if (line.startsWith("AH ")) {
        const a = parseAltitude(line.slice(3).trim());
        current.ceilM = a.metres;
        current.ceilIsAGL = a.isAGL;
      } else if (line.startsWith("AL ")) {
        const a = parseAltitude(line.slice(3).trim());
        current.floorM = a.metres;
        current.floorIsAGL = a.isAGL;
      } else if (line.startsWith("DP ")) {
        try {
          current.polygon.push(parseDMS(line.slice(3).trim()));
        } catch {
          // Skip malformed coordinate
        }
      } else if (/^V\s+X=/i.test(line)) {
        // "V X=37:39:36 S 144:50:32 E"
        try {
          circleCenter = parseDMS(line.replace(/^V\s+X=/i, "").trim());
        } catch {
          // Skip
        }
      } else if (line.startsWith("DC ")) {
        if (circleCenter) {
          const radiusNM = parseFloat(line.slice(3).trim());
          if (!isNaN(radiusNM) && radiusNM > 0) {
            current.polygon = circleToPolygon(circleCenter.lat, circleCenter.lng, radiusNM * 1852, 72);
          }
        }
      }
      // DA, DB, DY, SP, SB, AT, AY, V D=, V Z=, V W= — silently skipped
    }
  }
  pushCurrent();

  return features;
}

// ---------------------------------------------------------------------------
// Altitude string → metres AMSL
// ---------------------------------------------------------------------------

function parseAltitude(str: string): { metres: number; isAGL: boolean } {
  const s = str.trim().toUpperCase().replace(/\s+/g, " ");

  if (s === "SFC" || s === "GND") return { metres: 0, isAGL: false };
  if (s === "UNL" || s === "UNLIMITED") return { metres: 18000, isAGL: false };

  // FL55 → 55 * 30.48 m
  const flMatch = s.match(/^FL\s*(\d+)/);
  if (flMatch) return { metres: parseInt(flMatch[1]) * 30.48, isAGL: false };

  // e.g. "8000 AMSL", "8000 MSL", "8000 FT", "2000 AGL", "305 M"
  const numMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:(FT|M|FEET))?\s*(AMSL|MSL|AGL|GND|SFC)?/);
  if (numMatch) {
    const value = parseFloat(numMatch[1]);
    const unit = numMatch[2] ?? "FT"; // default to feet
    const ref  = numMatch[3] ?? "MSL";
    const metres = unit === "M" ? value : value * 0.3048;
    const isAGL = ref === "AGL";
    return { metres, isAGL };
  }

  return { metres: 0, isAGL: false };
}

// ---------------------------------------------------------------------------
// DMS coordinate string → decimal degrees
// Handles: "37:39:36 S 144:50:32 E"  and  "37:39.6 S 144:50.5 E"
// ---------------------------------------------------------------------------

function parseDMS(str: string): { lat: number; lng: number } {
  const m = str.match(
    /(\d{1,3}):(\d{2}(?:\.\d+)?)(?::(\d{2}(?:\.\d+)?))?\s*([NS])\s+(\d{1,3}):(\d{2}(?:\.\d+)?)(?::(\d{2}(?:\.\d+)?))?\s*([EW])/i,
  );
  if (!m) throw new Error(`Cannot parse DMS: ${str}`);

  const lat =
    (parseInt(m[1]) + parseFloat(m[2]) / 60 + (m[3] ? parseFloat(m[3]) : 0) / 3600) *
    (m[4].toUpperCase() === "S" ? -1 : 1);
  const lng =
    (parseInt(m[5]) + parseFloat(m[6]) / 60 + (m[7] ? parseFloat(m[7]) : 0) / 3600) *
    (m[8].toUpperCase() === "W" ? -1 : 1);

  return { lat, lng };
}

// ---------------------------------------------------------------------------
// Circle → 72-point polygon approximation
// ---------------------------------------------------------------------------

function circleToPolygon(
  lat: number,
  lng: number,
  radiusM: number,
  n = 72,
): Array<{ lat: number; lng: number }> {
  const latR = (lat * Math.PI) / 180;
  const points: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < n; i++) {
    const angle = (i * 2 * Math.PI) / n;
    const dLat = (radiusM / 111320) * Math.cos(angle);
    const dLng = (radiusM / (111320 * Math.cos(latR))) * Math.sin(angle);
    points.push({ lat: lat + dLat, lng: lng + dLng });
  }
  points.push(points[0]); // close the ring
  return points;
}

// ---------------------------------------------------------------------------
// Extract validity date from OpenAir file header comment
// e.g. "* Australian Airspace valid 27-November-2025" → "27-November-2025"
// ---------------------------------------------------------------------------

export function parseValidityDate(text: string): string | null {
  const m = text.match(/valid\s+(\d{1,2}-\w+-\d{4})/i);
  return m ? m[1] : null;
}
