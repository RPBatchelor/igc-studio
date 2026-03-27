/**
 * Formats a flight filename for display.
 * When showFull=true, returns the full filename.
 * When showFull=false, attempts to extract a readable date:
 *   - "YYYY-MM-DD..." → "1 Jan 2024"
 *   - "YYMMDD_..." or "YYMMDD.igc" → "1 Jan 2024"
 *   - fallback: full filename
 */
export function formatFlightFilename(filename: string, showFull: boolean): string {
  if (showFull) return filename;

  // Strip .bak suffix for date parsing, but keep it for display
  const isBak = filename.toLowerCase().endsWith(".bak");
  const base = isBak ? filename.slice(0, -4) : filename;
  const suffix = isBak ? ".bak" : "";

  // Classic format: YYYY-MM-DD at start
  const classic = base.match(/^(\d{4}-\d{2}-\d{2})/);
  if (classic) {
    const d = new Date(classic[1]);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) + suffix;
    }
  }

  // Newer format: YYMMDD at start (followed by _ or .)
  const newer = base.match(/^(\d{2})(\d{2})(\d{2})[_\.]/);
  if (newer) {
    const yy = parseInt(newer[1], 10);
    const mm = parseInt(newer[2], 10) - 1;
    const dd = parseInt(newer[3], 10);
    const yyyy = yy >= 80 ? 1900 + yy : 2000 + yy;
    const d = new Date(Date.UTC(yyyy, mm, dd));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) + suffix;
    }
  }

  return filename;
}
