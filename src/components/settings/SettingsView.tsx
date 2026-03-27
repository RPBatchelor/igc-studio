import { useState, useEffect } from "react";
import { Moon, Sun, Map, FolderOpen, Ruler, KeyRound, Database } from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import { saveSettings, saveSecrets } from "../../lib/settingsDb";
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
  } = useFlightStore();

  const [ionDraft,         setIonDraft]         = useState(cesiumIonToken);
  const [bingDraft,        setBingDraft]         = useState(bingMapsKey);
  const [airspaceUrlDraft, setAirspaceUrlDraft]  = useState(airspaceUrl);

  useEffect(() => { setIonDraft(cesiumIonToken); },      [cesiumIonToken]);
  useEffect(() => { setBingDraft(bingMapsKey); },        [bingMapsKey]);
  useEffect(() => { setAirspaceUrlDraft(airspaceUrl); }, [airspaceUrl]);

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
      lastFolderPath:     s.rootFolder ?? "",
    });
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--bg-primary)" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px 24px 48px" }}>

        {/* Page title */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-bright)", margin: 0 }}>Settings</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Preferences are saved automatically and persist between sessions.
          </p>
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

      </div>
    </div>
  );
}
