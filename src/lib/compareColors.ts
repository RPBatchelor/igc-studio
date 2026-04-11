import { Color } from "cesium";

/** Cesium Color instances for each comparison track slot (0–2). */
export const COMPARE_CESIUM_COLORS: Color[] = [
  new Color(0.220, 0.741, 0.973, 1.0), // sky blue   #38bdf8
  new Color(0.290, 0.855, 0.502, 1.0), // mint green #4ade80
  new Color(0.984, 0.573, 0.188, 1.0), // amber      #fb923c
];

/** Matching hex strings for Recharts and UI colour accents. */
export const COMPARE_HEX_COLORS = ["#38bdf8", "#4ade80", "#fb923c"] as const;
