import { useState, useEffect, useRef } from "react";
import { Moon, Sun, Map, FolderOpen, Ruler, KeyRound, Database, RefreshCw } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useFlightStore } from "../../stores/flightStore";
import { saveSettings, saveSecrets } from "../../lib/settingsDb";
import { buildBundle, applyBundle, serializeBundle, parseBundle } from "../../lib/portableSettings";
import { loadFlightNotesDb, saveFlightNotesDb } from "../../lib/flightNotesDb";
import { loadSiteDb, saveSiteDb } from "../../lib/siteDb";
import type { SpeedUnit, AltUnit } from "../../parsers/types";

// ── shared input style ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  color: "var(--text-bright)",
  padding: "6px 10px",
  borderRadius: 4,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "6px 12px",
  fontSize: 12,
  color: "var(--text-secondary)",
  cursor: "pointer",
  textAlign: "center",
};

// ── Toggle switch ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, flexShrink: 0,
        background: checked ? "var(--accent)" : "var(--bg-tertiary)",
        border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 10,
        position: "relative",
        cursor: "pointer",
        transition: "background 0.2s, border-color 0.2s",
      }}
    >
      <div style={{
        position: "absolute",
        top: 2, left: checked ? 16 : 2,
        width: 14, height: 14,
        borderRadius: "50%",
        background: checked ? "#fff" : "var(--text-muted)",
        transition: "left 0.18s ease",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }} />
    </div>
  );
}

// ── Section card ────────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--bg-secondary)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      marginBottom: 16,
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 20px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-sidebar)",
      }}>
        <span style={{ color: "var(--text-muted)", display: "flex" }}>{icon}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", color: "var(--text-muted)",
        }}>{title}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

// ── Setting row (label + description left, control right) ───────────────────

function Row({ label, description, children, last }: {
  label: string; description?: string; children: React.ReactNode; last?: boolean;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "12px 20px",
      borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.04)",
      gap: 24,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--text-bright)" }}>{label}</div>
        {description && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

// ── Full-width row (label above, control below) ─────────────────────────────

function BlockRow({ label, description, children, last }: {
  label: string; description?: string; children: React.ReactNode; last?: boolean;
}) {
  return (
    <div style={{
      padding: "12px 20px",
      borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.04)",
    }}>
      <div style={{ fontSize: 13, color: "var(--text-bright)", marginBottom: description ? 2 : 8 }}>{label}</div>
      {description && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{description}</div>
      )}
      {children}
    </div>
  );
}

// ── Button group ─────────────────────────────────────────────────────────────

function BtnGroup<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map(({ value: v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          style={{
            flex: 1, padding: "5px 0", borderRadius: 4, fontSize: 12, fontWeight: 600,
            cursor: "pointer",
            border: `1px solid ${value === v ? "var(--accent)" : "var(--border)"}`,
            background: value === v ? "var(--accent)" : "var(--bg-tertiary)",
            color: value === v ? "#fff" : "var(--text-secondary)",
            transition: "all 0.12s",
          }}
        >{label}</button>
      ))}
    </div>
  );
}

// ── Main SettingsView ────────────────────────────────────────────────────────

export function SettingsView() {
  const {
    zoomAltitude,      setZoomAltitude,
    cesiumIonToken,    setCesiumIonToken,
    bingMapsKey,       setBingMapsKey,
    theme,             setTheme,
    speedUnit,         setSpeedUnit,
    altUnit,           setAltUnit,
    airspaceUrl,       setAirspaceUrl,
    rememberLastFolder, setRememberLastFolder,
    showCameraOverlay, setShowCameraOverlay,
    showFullFilename,  setShowFullFilename,
    showBakFiles,      setShowBakFiles,
    groupSitesByType,  setGroupSitesByType,
    showShadowCurtain, setShowShadowCurtain,
    smoothFlightPath,  setSmoothFlightPath,
    syncFilePath,      setSyncFilePath,
    rootFolder,        flightNotesDb,       siteDb,
  } = useFlightStore();

  const [ionDraft,         setIonDraft]         = useState(cesiumIonToken);
  const [bingDraft,        setBingDraft]         = useState(bingMapsKey);
  const [airspaceUrlDraft, setAirspaceUrlDraft]  = useState(airspaceUrl);
  const [syncStatus,       setSyncStatus]        = useState<string>("");
  const syncStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setIonDraft(cesiumIonToken); },      [cesiumIonToken]);
  useEffect(() => { setBingDraft(bingMapsKey); },        [bingMapsKey]);
  useEffect(() => { setAirspaceUrlDraft(airspaceUrl); }, [airspaceUrl]);

  const showSyncStatus = (msg: string) => {
    setSyncStatus(msg);
    if (syncStatusTimer.current) clearTimeout(syncStatusTimer.current);
    syncStatusTimer.current = setTimeout(() => setSyncStatus(""), 3000);
  };

  const handleBrowseSyncFile = async () => {
    // Try to open an existing file first
    const selected = await open({
      title: "Select portable settings file",
      filters: [{ name: "IGC Studio Settings", extensions: ["json"] }],
    }) as string | null;
    if (!selected) return;
    const path = selected.replace(/\\/g, "/");
    setSyncFilePath(path);
    persistSettings({ syncFilePath: path });
    showSyncStatus("Sync file set");
  };

  const handleCreateSyncFile = async () => {
    const selected = await save({
      title: "Create portable settings file",
      defaultPath: "igc-studio-settings.json",
      filters: [{ name: "IGC Studio Settings", extensions: ["json"] }],
    }) as string | null;
    if (!selected) return;
    const path = selected.replace(/\\/g, "/");
    // Write bundle immediately
    const s = useFlightStore.getState();
    const notesDb = await loadFlightNotesDb();
    const siteDbData = await loadSiteDb();
    const bundle = buildBundle(s.rootFolder, {
      theme: s.theme, zoomAltitude: s.zoomAltitude, speedUnit: s.speedUnit, altUnit: s.altUnit,
      airspaceUrl: s.airspaceUrl, rememberLastFolder: s.rememberLastFolder, lastFolderPath: s.rootFolder ?? "",
      showCameraOverlay: s.showCameraOverlay, showFullFilename: s.showFullFilename,
      showBakFiles: s.showBakFiles, groupSitesByType: s.groupSitesByType,
      showShadowCurtain: s.showShadowCurtain, smoothFlightPath: s.smoothFlightPath,
      syncFilePath: path, activeOverlays: Array.from(s.overlays),
    }, notesDb, siteDbData, __APP_VERSION__);
    await invoke("write_file_text", { path, content: serializeBundle(bundle) });
    setSyncFilePath(path);
    persistSettings({ syncFilePath: path });
    showSyncStatus("Settings exported");
  };

  const handleImportNow = async () => {
    if (!syncFilePath) return;
    try {
      const text = await invoke<string>("read_file_text", { path: syncFilePath });
      const bundle = parseBundle(text);
      if (!bundle) { showSyncStatus("Invalid settings file"); return; }
      const s = useFlightStore.getState();
      const localNotes = await loadFlightNotesDb();
      const localSiteDb = await loadSiteDb();
      const result = applyBundle(bundle, s.rootFolder, localNotes, localSiteDb);
      // Apply settings to store
      const { setTheme, setSpeedUnit, setAltUnit, setZoomAltitude, setShowCameraOverlay,
              setRememberLastFolder, setShowFullFilename, setShowBakFiles, setGroupSitesByType,
              setShowShadowCurtain, setSmoothFlightPath } = useFlightStore.getState();
      setTheme(result.settings.theme ?? s.theme);
      setSpeedUnit(result.settings.speedUnit ?? s.speedUnit);
      setAltUnit(result.settings.altUnit ?? s.altUnit);
      setZoomAltitude(result.settings.zoomAltitude ?? s.zoomAltitude);
      setShowCameraOverlay(result.settings.showCameraOverlay ?? s.showCameraOverlay);
      setRememberLastFolder(result.settings.rememberLastFolder ?? s.rememberLastFolder);
      setShowFullFilename(result.settings.showFullFilename ?? s.showFullFilename);
      setShowBakFiles(result.settings.showBakFiles ?? s.showBakFiles);
      setGroupSitesByType(result.settings.groupSitesByType ?? s.groupSitesByType);
      setShowShadowCurtain(result.settings.showShadowCurtain ?? s.showShadowCurtain);
      setSmoothFlightPath(result.settings.smoothFlightPath ?? s.smoothFlightPath);
      // Persist merged notes and full site DB
      await saveFlightNotesDb(result.notesDb);
      await saveSiteDb(result.siteDb);
      persistSettings({ ...result.settings, syncFilePath });
      showSyncStatus("Settings imported");
    } catch {
      showSyncStatus("Failed to read file");
    }
  };

  const handleClearSyncFile = () => {
    setSyncFilePath("");
    persistSettings({ syncFilePath: "" });
    showSyncStatus("Sync file cleared");
  };

  const persistSecrets = (patch: { cesiumIonToken?: string; bingMapsKey?: string }) => {
    const s = useFlightStore.getState();
    saveSecrets({
      cesiumIonToken: patch.cesiumIonToken ?? s.cesiumIonToken,
      bingMapsKey:    patch.bingMapsKey    ?? s.bingMapsKey,
    });
  };

  const persistSettings = (patch: Partial<{
    theme: "dark" | "light"; zoomAltitude: number; speedUnit: SpeedUnit; altUnit: AltUnit;
    airspaceUrl: string; rememberLastFolder: boolean; showCameraOverlay: boolean;
    showFullFilename: boolean; showBakFiles: boolean; groupSitesByType: boolean;
    showShadowCurtain: boolean; smoothFlightPath: boolean; syncFilePath: string;
  }>) => {
    const s = useFlightStore.getState();
    saveSettings({
      theme:              patch.theme              ?? s.theme,
      zoomAltitude:       patch.zoomAltitude       ?? s.zoomAltitude,
      speedUnit:          patch.speedUnit          ?? s.speedUnit,
      altUnit:            patch.altUnit            ?? s.altUnit,
      airspaceUrl:        patch.airspaceUrl        ?? s.airspaceUrl,
      rememberLastFolder: patch.rememberLastFolder ?? s.rememberLastFolder,
      showCameraOverlay:  patch.showCameraOverlay  ?? s.showCameraOverlay,
      showFullFilename:   patch.showFullFilename   ?? s.showFullFilename,
      showBakFiles:       patch.showBakFiles       ?? s.showBakFiles,
      groupSitesByType:   patch.groupSitesByType   ?? s.groupSitesByType,
      showShadowCurtain:  patch.showShadowCurtain  ?? s.showShadowCurtain,
      smoothFlightPath:   patch.smoothFlightPath   ?? s.smoothFlightPath,
      syncFilePath:       patch.syncFilePath       ?? s.syncFilePath,
      lastFolderPath:     s.rootFolder ?? "",
      activeOverlays:     Array.from(s.overlays),
    });
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--bg-primary)" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px 24px 48px" }}>

        {/* ── About ────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid var(--border)",
        }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-bright)", margin: 0 }}>
              IGC Studio
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
              Version {__APP_VERSION__} &middot; A desktop flight log viewer for paraglider pilots
            </p>
          </div>
          <a
            href="https://github.com/RPBatchelor/igc-studio"
            target="_blank"
            rel="noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, color: "var(--text-secondary)",
              textDecoration: "none", padding: "6px 12px",
              border: "1px solid var(--border)", borderRadius: 6,
              background: "var(--bg-tertiary)", flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-bright)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            GitHub
          </a>
        </div>

        {/* ── Appearance ───────────────────────────────────────────────── */}
        <Section title="Appearance" icon={<Moon size={14} />}>
          <BlockRow label="Theme" last>
            <div style={{ display: "flex", gap: 8 }}>
              {([["dark", "Dark", Moon], ["light", "Light", Sun]] as const).map(([t, label, Icon]) => (
                <button
                  key={t}
                  onClick={() => { setTheme(t); persistSettings({ theme: t }); }}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "7px 0", borderRadius: 4, fontSize: 12, fontWeight: 600,
                    cursor: "pointer",
                    border: `1px solid ${theme === t ? "var(--accent)" : "var(--border)"}`,
                    background: theme === t ? "var(--accent)" : "var(--bg-tertiary)",
                    color: theme === t ? "#fff" : "var(--text-secondary)",
                    transition: "all 0.12s",
                  }}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
          </BlockRow>
        </Section>

        {/* ── Map & 3D View ─────────────────────────────────────────────── */}
        <Section title="Map & 3D View" icon={<Map size={14} />}>
          <BlockRow
            label="Default zoom altitude"
            description="Camera altitude when a flight is first opened"
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="range" min={500} max={50000} step={500}
                value={zoomAltitude}
                onChange={(e) => {
                  const alt = Number(e.target.value);
                  setZoomAltitude(alt);
                  persistSettings({ zoomAltitude: alt });
                }}
                style={{ flex: 1, accentColor: "var(--accent)" }}
              />
              <span style={{ minWidth: 64, textAlign: "right", fontSize: 13, fontVariantNumeric: "tabular-nums", color: "var(--text-bright)" }}>
                {zoomAltitude >= 1000 ? `${(zoomAltitude / 1000).toFixed(1)} km` : `${zoomAltitude} m`}
              </span>
            </div>
          </BlockRow>
          <Row label="Show camera position overlay" description="Lat/lng/altitude readout on the map">
            <Toggle checked={showCameraOverlay} onChange={(v) => { setShowCameraOverlay(v); persistSettings({ showCameraOverlay: v }); }} />
          </Row>
          <Row label="Reopen last folder on startup" last>
            <Toggle checked={rememberLastFolder} onChange={(v) => { setRememberLastFolder(v); persistSettings({ rememberLastFolder: v }); }} />
          </Row>
        </Section>

        {/* ── Playback ─────────────────────────────────────────────────── */}
        <Section title="Playback" icon={<Map size={14} />}>
          <Row label="Shadow Curtain" description="Fading vertical wall below the flight path during playback">
            <Toggle checked={showShadowCurtain} onChange={(v) => { setShowShadowCurtain(v); persistSettings({ showShadowCurtain: v }); }} />
          </Row>
          <Row label="Smooth Flight Path" description="Catmull-Rom spline between GPS fixes — most noticeable on 1 Hz or slower loggers" last>
            <Toggle checked={smoothFlightPath} onChange={(v) => { setSmoothFlightPath(v); persistSettings({ smoothFlightPath: v }); }} />
          </Row>
        </Section>

        {/* ── Explorer & Files ─────────────────────────────────────────── */}
        <Section title="Explorer & Files" icon={<FolderOpen size={14} />}>
          <Row label="Show full filename" description="Show complete filename instead of parsed date">
            <Toggle checked={showFullFilename} onChange={(v) => { setShowFullFilename(v); persistSettings({ showFullFilename: v }); }} />
          </Row>
          <Row label="Show backup (.bak) files" description="Display trimmed originals in Explorer and Locations">
            <Toggle checked={showBakFiles} onChange={(v) => { setShowBakFiles(v); persistSettings({ showBakFiles: v }); }} />
          </Row>
          <Row label="Group locations by type" description="Segment sites into Inland / Coastal / Mountain sections" last>
            <Toggle checked={groupSitesByType} onChange={(v) => { setGroupSitesByType(v); persistSettings({ groupSitesByType: v }); }} />
          </Row>
        </Section>

        {/* ── Units ───────────────────────────────────────────────────── */}
        <Section title="Units" icon={<Ruler size={14} />}>
          <BlockRow label="Speed">
            <BtnGroup<SpeedUnit>
              options={[{ value: "km/h", label: "km/h" }, { value: "m/s", label: "m/s" }, { value: "kts", label: "kts" }]}
              value={speedUnit}
              onChange={(u) => { setSpeedUnit(u); persistSettings({ speedUnit: u }); }}
            />
          </BlockRow>
          <BlockRow label="Altitude & Distance" last>
            <BtnGroup<AltUnit>
              options={[{ value: "metric", label: "Metric  (m / km)" }, { value: "imperial", label: "Imperial  (ft / mi)" }]}
              value={altUnit}
              onChange={(u) => { setAltUnit(u); persistSettings({ altUnit: u }); }}
            />
          </BlockRow>
        </Section>

        {/* ── API Keys ────────────────────────────────────────────────── */}
        <Section title="API Keys" icon={<KeyRound size={14} />}>
          <div style={{ padding: "10px 20px 0", fontSize: 11, color: "var(--text-muted)" }}>
            Keys are stored in a local <code style={{ background: "var(--bg-tertiary)", padding: "1px 4px", borderRadius: 3 }}>.secrets</code> file and never committed to source control.
          </div>
          <BlockRow label="Cesium Ion Token" description="Required for 3D terrain. Free at cesium.com/ion">
            <input
              type="password"
              value={ionDraft}
              onChange={(e) => setIonDraft(e.target.value)}
              onBlur={() => { const t = ionDraft.trim(); setCesiumIonToken(t); persistSecrets({ cesiumIonToken: t }); }}
              placeholder="Paste token here…"
              style={inputStyle}
            />
          </BlockRow>
          <BlockRow label="Bing Maps API Key" description="Required for Bing Aerial &amp; Roads layers. Free at bingmapsportal.com" last>
            <input
              type="password"
              value={bingDraft}
              onChange={(e) => setBingDraft(e.target.value)}
              onBlur={() => { const k = bingDraft.trim(); setBingMapsKey(k); persistSecrets({ bingMapsKey: k }); }}
              placeholder="Paste key here…"
              style={inputStyle}
            />
          </BlockRow>
        </Section>

        {/* ── Data Sources ─────────────────────────────────────────────── */}
        <Section title="Data Sources" icon={<Database size={14} />}>
          <BlockRow
            label="Airspace file URL"
            description="OpenAir .txt file — updated periodically. Check soaringweb.org/Airspace/AU for the latest."
            last
          >
            <input
              type="text"
              value={airspaceUrlDraft}
              onChange={(e) => setAirspaceUrlDraft(e.target.value)}
              onBlur={() => {
                const url = airspaceUrlDraft.trim() || "https://xcaustralia.org/download/class_all.php";
                setAirspaceUrl(url);
                persistSettings({ airspaceUrl: url });
              }}
              style={inputStyle}
            />
          </BlockRow>
        </Section>

        {/* ── Portable Settings ─────────────────────────────────────────── */}
        <Section title="Portable Settings" icon={<RefreshCw size={14} />}>
          <div style={{ padding: "4px 0 10px", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Point to a file on OneDrive, Dropbox, or any shared folder. Settings, site renames,
            and flight adjustments sync automatically between your devices — no account required.
          </div>

          <BlockRow label="Sync file" description="Loaded on startup and updated on every change" last>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
              {syncFilePath ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    flex: 1, fontSize: 11, fontFamily: "monospace",
                    color: "var(--text-bright)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 8px",
                  }} title={syncFilePath}>
                    {syncFilePath.split("/").pop()}
                  </span>
                  <button
                    onClick={handleClearSyncFile}
                    style={{ background: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>No sync file configured</span>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={handleBrowseSyncFile}
                  style={{ ...btnStyle, flex: 1 }}
                >
                  {syncFilePath ? "Change file…" : "Open existing…"}
                </button>
                <button
                  onClick={handleCreateSyncFile}
                  style={{ ...btnStyle, flex: 1 }}
                >
                  Create new…
                </button>
                {syncFilePath && (
                  <button
                    onClick={handleImportNow}
                    style={{ ...btnStyle, flex: 1, borderColor: "var(--accent)", color: "var(--accent)" }}
                  >
                    Import now
                  </button>
                )}
              </div>

              {syncStatus && (
                <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 500 }}>
                  ✓ {syncStatus}
                </div>
              )}
            </div>
          </BlockRow>
        </Section>

      </div>
    </div>
  );
}
