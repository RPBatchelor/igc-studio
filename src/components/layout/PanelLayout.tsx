import { useState } from "react";
import { FolderOpen, Layers, Settings } from "lucide-react";
import { FileExplorer } from "../explorer/FileExplorer";
import { MapLayers } from "../explorer/MapLayers";
import { FlightMap } from "../map/FlightMap";
import { FlightStatsPanel } from "../stats/FlightStats";
import { FlightCharts } from "../stats/FlightCharts";
import { TimelineScrubber } from "../timeline/TimelineScrubber";

type View = "explorer" | "layers" | "settings";

const VIEWS: { id: View; icon: typeof FolderOpen; title: string }[] = [
  { id: "explorer", icon: FolderOpen, title: "Explorer" },
  { id: "layers",   icon: Layers,     title: "Map Layers" },
  { id: "settings", icon: Settings,   title: "Settings" },
];

export function PanelLayout() {
  const [activeView, setActiveView] = useState<View | null>("explorer");

  const toggleView = (id: View) =>
    setActiveView((prev) => (prev === id ? null : id));

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#1e1e1e", color: "#ccc" }}>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* Activity bar */}
        <div style={{ width: 48, flexShrink: 0, background: "#333333", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
          {VIEWS.map(({ id, icon: Icon, title }) => (
            <button
              key={id}
              title={title}
              onClick={() => toggleView(id)}
              style={{
                width: 48,
                height: 48,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: activeView === id ? "#fff" : "#858585",
                borderLeft: activeView === id ? "2px solid #fff" : "2px solid transparent",
                position: "relative",
              }}
            >
              <Icon size={22} />
            </button>
          ))}
        </div>

        {/* Side panel */}
        {activeView && (
          <div style={{ width: 240, flexShrink: 0, background: "#252526", borderRight: "1px solid #3e3e3e", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", color: "#bbb", borderBottom: "1px solid #3e3e3e", flexShrink: 0 }}>
              {VIEWS.find((v) => v.id === activeView)?.title}
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              {activeView === "explorer" && <FileExplorer />}
              {activeView === "layers"   && <MapLayers />}
              {activeView === "settings" && (
                <div style={{ padding: 16, color: "#858585", fontSize: 13 }}>
                  Settings coming soon.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Map */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <FlightMap />
        </div>

        {/* Right panel */}
        <div style={{ width: 300, flexShrink: 0, overflow: "auto", background: "#252526", borderLeft: "1px solid #3e3e3e" }}>
          <FlightStatsPanel />
          <FlightCharts />
        </div>

      </div>

      <TimelineScrubber />
    </div>
  );
}
