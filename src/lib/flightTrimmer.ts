/**
 * Pure string-manipulation functions for trimming IGC and KML flight files.
 * No Tauri, no React — these can be tested in isolation.
 */

/** Returns the path where the original backup is stored. */
export function bakPath(filePath: string): string {
  return filePath + ".bak";
}

// ---------------------------------------------------------------------------
// IGC trimming
// ---------------------------------------------------------------------------

function parseIGCDate(lines: string[], fallbackDateISO?: string): Date | null {
  // Prefer the date supplied by igc-parser — it uses the same HFDTE regex so the
  // resulting midnight-UTC base date is guaranteed to match fix.timestamp values.
  if (fallbackDateISO) {
    const d = new Date(fallbackDateISO + "T00:00:00Z");
    if (!isNaN(d.getTime())) return d;
  }
  // Last resort: scan the raw lines using igc-parser's exact HFDTE regex
  // (always 2-digit year — HFDTEDATE:DDMMYYYY files would otherwise produce a
  // different base date here vs. igc-parser, causing a multi-year timestamp mismatch).
  for (const line of lines) {
    const upper = line.toUpperCase();
    const match = upper.match(/^HFDTE(?:DATE:)?(\d{2})(\d{2})(\d{2})/);
    if (match) {
      const dd = parseInt(match[1], 10);
      const mm = parseInt(match[2], 10) - 1; // 0-indexed
      const yy = parseInt(match[3], 10);
      const yyyy = yy >= 80 ? 1900 + yy : 2000 + yy; // match igc-parser century logic
      return new Date(Date.UTC(yyyy, mm, dd));
    }
  }
  return null;
}

function bRecordMs(line: string, baseDateMs: number, prevMs: number): number {
  // B HHMMSS ... (chars 1-6 after record type)
  const hh = parseInt(line.substring(1, 3), 10);
  const mm = parseInt(line.substring(3, 5), 10);
  const ss = parseInt(line.substring(5, 7), 10);
  let ms = baseDateMs + hh * 3_600_000 + mm * 60_000 + ss * 1_000;
  // Midnight crossover: mirror igc-parser's logic — only advance the day when the
  // fix appears more than 1 hour before the previous fix, so minor out-of-order
  // GPS glitches don't falsely trigger a day-advance.
  while (prevMs > 0 && ms < prevMs - 3_600_000) ms += 86_400_000;
  return ms;
}

export function trimIGC(
  raw: string,
  startMs: number,
  endMs: number,
  fallbackDateISO?: string,
): string {
  // Preserve original line endings
  const lineEnding = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);

  const flightDate = parseIGCDate(lines, fallbackDateISO);
  if (!flightDate) {
    throw new Error("Could not determine flight date from IGC file.");
  }
  const baseDateMs = flightDate.getTime();

  const kept: string[] = [];
  let prevMs = 0;
  let bCount = 0;

  for (const line of lines) {
    if (line.startsWith("B") && line.length >= 7) {
      const fixMs = bRecordMs(line, baseDateMs, prevMs);
      prevMs = fixMs;
      if (fixMs >= startMs && fixMs <= endMs) {
        kept.push(line);
        bCount++;
      }
    } else {
      kept.push(line);
    }
  }

  if (bCount === 0) {
    throw new Error("No GPS fixes in selected range — adjust the trim handles.");
  }

  return kept.join(lineEnding);
}

// ---------------------------------------------------------------------------
// KML trimming
// ---------------------------------------------------------------------------

function trimGxTrack(raw: string, startMs: number, endMs: number): string {
  // Collect all <when> timestamps and their string positions
  const whenRe = /<when>(.*?)<\/when>/gs;
  const coordRe = /<gx:coord>(.*?)<\/gx:coord>/gs;

  const whens: { ms: number; full: string }[] = [];
  const coords: string[] = [];

  let m: RegExpExecArray | null;
  while ((m = whenRe.exec(raw)) !== null) {
    whens.push({ ms: new Date(m[1]).getTime(), full: m[0] });
  }
  while ((m = coordRe.exec(raw)) !== null) {
    coords.push(m[0]);
  }

  if (whens.length === 0 || whens.length !== coords.length) {
    // Malformed — return as-is rather than corrupt
    return raw;
  }

  const keepWhens: string[] = [];
  const keepCoords: string[] = [];
  for (let i = 0; i < whens.length; i++) {
    if (whens[i].ms >= startMs && whens[i].ms <= endMs) {
      keepWhens.push(whens[i].full);
      keepCoords.push(coords[i]);
    }
  }

  if (keepWhens.length === 0) {
    throw new Error("No GPS fixes in selected range — adjust the trim handles.");
  }

  // Reconstruct: replace the original interleaved when/coord block
  // Strategy: find the first <when> and last </gx:coord> in the first <gx:Track> block,
  // replace that slice with the filtered content.
  const trackStart = raw.indexOf("<gx:Track");
  const trackEnd   = raw.indexOf("</gx:Track>", trackStart);
  if (trackStart === -1 || trackEnd === -1) return raw;

  const firstWhen = raw.indexOf("<when>", trackStart);
  const lastCoord = raw.lastIndexOf("</gx:coord>", trackEnd) + "</gx:coord>".length;
  if (firstWhen === -1 || lastCoord <= firstWhen) return raw;

  // Build the replacement block: interleave when+coord pairs
  const indent = "      "; // match typical KML indentation
  const pairs = keepWhens.map((w, i) => `${indent}${w}\n${indent}${keepCoords[i]}`).join("\n");

  return raw.slice(0, firstWhen) + pairs.trimStart() + raw.slice(lastCoord);
}

function trimLineString(raw: string, startMs: number, endMs: number, domainMinMs: number, domainMaxMs: number, totalPoints: number): string {
  const coordsMatch = raw.match(/<coordinates>([\s\S]*?)<\/coordinates>/);
  if (!coordsMatch) return raw;

  const triplets = coordsMatch[1].trim().split(/\s+/).filter(Boolean);
  const domainSpan = domainMaxMs - domainMinMs || 1;

  const startIdx = Math.max(0, Math.floor(((startMs - domainMinMs) / domainSpan) * (totalPoints - 1)));
  const endIdx   = Math.min(totalPoints - 1, Math.ceil(((endMs - domainMinMs) / domainSpan) * (totalPoints - 1)));

  if (endIdx <= startIdx) {
    throw new Error("No GPS fixes in selected range — adjust the trim handles.");
  }

  const kept = triplets.slice(startIdx, endIdx + 1).join("\n          ");
  return raw.replace(coordsMatch[0], `<coordinates>\n          ${kept}\n        </coordinates>`);
}

export function trimKML(
  raw: string,
  startMs: number,
  endMs: number,
  domainMinMs?: number,
  domainMaxMs?: number,
  totalPoints?: number,
): string {
  if (raw.includes("<gx:Track") || raw.includes("<gx:track")) {
    return trimGxTrack(raw, startMs, endMs);
  }
  // LineString fallback — no real timestamps, trim by index
  return trimLineString(
    raw,
    startMs,
    endMs,
    domainMinMs ?? startMs,
    domainMaxMs ?? endMs,
    totalPoints ?? 100,
  );
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function trimFileContent(
  raw: string,
  filePath: string,
  startMs: number,
  endMs: number,
  fallbackDateISO?: string,
  domainMinMs?: number,
  domainMaxMs?: number,
  totalPoints?: number,
): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "igc") {
    return trimIGC(raw, startMs, endMs, fallbackDateISO);
  }
  if (ext === "kml") {
    return trimKML(raw, startMs, endMs, domainMinMs, domainMaxMs, totalPoints);
  }
  throw new Error(`Unsupported file type: .${ext}`);
}
