import { Navigation, Globe } from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";

const FILE_TYPE_META = {
  igc: { icon: Navigation, color: "#4fc3f7", label: "IGC" },
  kml: { icon: Globe,      color: "#81c784", label: "KML" },
} as const;

export function LogbookPanel() {
  const { visibleFileTypes, toggleFileType } = useFlightStore();

  return (
    <div style={{ padding: "12px 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--text-muted)", marginBottom: 8 }}>
        Show file types
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {(Object.entries(FILE_TYPE_META) as [keyof typeof FILE_TYPE_META, typeof FILE_TYPE_META[keyof typeof FILE_TYPE_META]][]).map(([type, { icon: Icon, color, label }]) => {
          const active = visibleFileTypes.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleFileType(type)}
              title={active ? `Hide ${label} flights` : `Show ${label} flights`}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${active ? color : "var(--border)"}`,
                background: active ? `${color}22` : "var(--bg-tertiary)",
                color: active ? color : "var(--text-muted)",
                transition: "all 0.15s",
              }}
            >
              <Icon size={11} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
