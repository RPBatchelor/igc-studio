import { invoke } from "@tauri-apps/api/core";
import type { SpeedUnit, AltUnit } from "../parsers/types";

// Non-sensitive settings → {appDataDir}/igc-studio/settings.json
// API keys / tokens     → {appDataDir}/igc-studio/.secrets  (JSON, never in git)

export interface AppSecrets {
  cesiumIonToken: string;
  bingMapsKey: string;
}

export interface AppSettings {
  zoomAltitude: number;
  theme: "dark" | "light";
  speedUnit: SpeedUnit;
  altUnit: AltUnit;
  airspaceUrl: string;
  rememberLastFolder: boolean;
  lastFolderPath: string;
  showCameraOverlay: boolean;
  activeOverlays: string[]; // serialised Set<OverlayId>
}

const DEFAULT_SECRETS: AppSecrets = { cesiumIonToken: "", bingMapsKey: "" };
const DEFAULT_SETTINGS: AppSettings = {
  zoomAltitude: 8000,
  theme: "dark",
  speedUnit: "km/h",
  altUnit: "metric",
  airspaceUrl: "https://xcaustralia.org/download/class_all.php",
  rememberLastFolder: true,
  lastFolderPath: "",
  showCameraOverlay: false,
  activeOverlays: [],
};

let baseDir: string | null = null;

async function getBaseDir(): Promise<string> {
  if (!baseDir) {
    const dir = await invoke<string>("get_data_dir");
    baseDir = dir.replace(/\\/g, "/") + "/igc-studio";
  }
  return baseDir;
}

async function getSettingsPath(): Promise<string> {
  return (await getBaseDir()) + "/settings.json";
}

async function getSecretsPath(): Promise<string> {
  return (await getBaseDir()) + "/.secrets";
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const text = await invoke<string>("read_file_text", { path: await getSettingsPath() });
    return { ...DEFAULT_SETTINGS, ...JSON.parse(text) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await invoke("write_file_text", {
      path: await getSettingsPath(),
      content: JSON.stringify(settings, null, 2),
    });
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

export async function loadSecrets(): Promise<AppSecrets> {
  try {
    const raw = await invoke<string>("read_file_text", { path: await getSecretsPath() });
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SECRETS, ...parsed };
  } catch {
    // File doesn't exist yet or old plain-text format — start fresh
    return { ...DEFAULT_SECRETS };
  }
}

export async function saveSecrets(secrets: AppSecrets): Promise<void> {
  try {
    await invoke("write_file_text", {
      path: await getSecretsPath(),
      content: JSON.stringify(secrets, null, 2),
    });
  } catch (e) {
    console.error("Failed to save .secrets:", e);
  }
}
