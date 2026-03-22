declare module "igc-parser" {
  interface IGCFix {
    timestamp: number;
    time: string;
    latitude: number;
    longitude: number;
    valid: boolean;
    pressureAltitude: number | null;
    gpsAltitude: number | null;
    extensions: Record<string, string>;
    fixAccuracy: number | null;
    enl?: number | null;
  }

  interface IGCResult {
    date: string;
    pilot: string | null;
    copilot: string | null;
    gliderType: string | null;
    registration: string | null;
    callsign: string | null;
    competitionClass: string | null;
    site: string | null;
    numFlight: number | null;
    fixes: IGCFix[];
    task: unknown;
    security: string | null;
  }

  interface ParseOptions {
    lenient?: boolean;
  }

  function parse(content: string, options?: ParseOptions): IGCResult;

  export default { parse };
}
