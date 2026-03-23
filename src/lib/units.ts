import type { SpeedUnit, AltUnit } from "../parsers/types";

// ── Speed (base: km/h) ──────────────────────────────────────────────────────

export function convertSpeed(kmh: number, unit: SpeedUnit): number {
  switch (unit) {
    case "m/s": return kmh / 3.6;
    case "kts": return kmh * 0.539957;
    default:    return kmh;
  }
}

export function fmtSpeed(kmh: number, unit: SpeedUnit): string {
  switch (unit) {
    case "m/s": return `${(kmh / 3.6).toFixed(1)} m/s`;
    case "kts": return `${Math.round(kmh * 0.539957)} kts`;
    default:    return `${Math.round(kmh)} km/h`;
  }
}

export function speedUnitLabel(unit: SpeedUnit): string {
  return unit; // "km/h" | "m/s" | "kts"
}

// ── Altitude (base: metres) ─────────────────────────────────────────────────

export function convertAlt(m: number, unit: AltUnit): number {
  return unit === "imperial" ? m * 3.28084 : m;
}

export function fmtAlt(m: number, unit: AltUnit): string {
  return unit === "imperial"
    ? `${Math.round(m * 3.28084)} ft`
    : `${Math.round(m)} m`;
}

export function altUnitLabel(unit: AltUnit): string {
  return unit === "imperial" ? "ft" : "m";
}

// ── Distance (base: km) ─────────────────────────────────────────────────────

export function convertDist(km: number, unit: AltUnit): number {
  return unit === "imperial" ? km * 0.621371 : km;
}

export function fmtDist(km: number, unit: AltUnit): string {
  return unit === "imperial"
    ? `${(km * 0.621371).toFixed(1)} mi`
    : `${km.toFixed(1)} km`;
}

export function distUnitLabel(unit: AltUnit): string {
  return unit === "imperial" ? "mi" : "km";
}
