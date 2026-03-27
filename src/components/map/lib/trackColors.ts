import { Color, type Entity } from "cesium";

export interface FlightPoint {
  lat: number;
  lng: number;
  altGPS: number;
  timestamp: number;
}

export interface ColorSegment {
  startIdx: number;
  endIdx: number;
  color: Color;
  entity: Entity | null;
}

// 7 control points covering −5 to +5 m/s, linear RGB interpolation
const VARIO_RAMP = [
  { v: -5, r:   0, g:  50, b: 200 },  // strong sink   — deep blue
  { v: -3, r:  50, g: 130, b: 255 },  // moderate sink — blue
  { v: -1, r: 140, g: 200, b: 255 },  // weak sink     — sky blue
  { v:  0, r: 180, g: 180, b: 180 },  // neutral       — grey
  { v:  1, r: 255, g: 160, b:   0 },  // weak thermal  — amber
  { v:  3, r: 255, g:  80, b:   0 },  // good thermal  — orange-red
  { v:  5, r: 210, g:  20, b:  20 },  // strong thermal — red
];

export function varioToColor(vMs: number): Color {
  const v = Math.max(-5, Math.min(5, vMs));
  for (let i = 1; i < VARIO_RAMP.length; i++) {
    if (v <= VARIO_RAMP[i].v) {
      const t = (v - VARIO_RAMP[i - 1].v) / (VARIO_RAMP[i].v - VARIO_RAMP[i - 1].v);
      const a = VARIO_RAMP[i - 1], b = VARIO_RAMP[i];
      return Color.fromBytes(
        Math.round(a.r + t * (b.r - a.r)),
        Math.round(a.g + t * (b.g - a.g)),
        Math.round(a.b + t * (b.b - a.b)),
      );
    }
  }
  return Color.fromBytes(210, 20, 20);
}

// Gaussian kernel (half-width 30, sigma 10) — precomputed once
const GAUSS_HALF = 30;
const GAUSS_SIGMA = 10;
export const GAUSS_KERNEL = (() => {
  const k = Array.from({ length: 2 * GAUSS_HALF + 1 }, (_, i) =>
    Math.exp(-0.5 * ((i - GAUSS_HALF) / GAUSS_SIGMA) ** 2)
  );
  const sum = k.reduce((a, b) => a + b, 0);
  return k.map((v) => v / sum);
})();

export function computeTrackColors(pts: FlightPoint[]): Color[] {
  // Raw vario per point
  const raw = pts.map((p, i) => {
    if (i === 0) return 0;
    const dt = (p.timestamp - pts[i - 1].timestamp) / 1000;
    return dt > 0 ? (p.altGPS - pts[i - 1].altGPS) / dt : 0;
  });

  // Gaussian smooth
  const smoothed = raw.map((_, i) => {
    let sum = 0;
    for (let j = 0; j < GAUSS_KERNEL.length; j++) {
      const idx = Math.min(Math.max(0, i - GAUSS_HALF + j), raw.length - 1);
      sum += raw[idx] * GAUSS_KERNEL[j];
    }
    return sum;
  });

  // Map to colours
  const colors = smoothed.map(varioToColor);

  // Light 3-pt colour blend [0.25, 0.5, 0.25] to kill residual jitter
  return colors.map((c, i) => {
    const prev = colors[Math.max(0, i - 1)];
    const next = colors[Math.min(colors.length - 1, i + 1)];
    return Color.fromBytes(
      Math.round(prev.red * 255 * 0.25 + c.red * 255 * 0.5 + next.red * 255 * 0.25),
      Math.round(prev.green * 255 * 0.25 + c.green * 255 * 0.5 + next.green * 255 * 0.25),
      Math.round(prev.blue * 255 * 0.25 + c.blue * 255 * 0.5 + next.blue * 255 * 0.25),
    );
  });
}
