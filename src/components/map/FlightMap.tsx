import { useRef } from "react";
import { Plus, Minus, Compass, LocateFixed } from "lucide-react";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useFlightStore } from "../../stores/flightStore";
import { sgZoneStyle, sgZoneDisplayName, ZONE_DISPLAY_NAMES } from "../../lib/sgZonesApi";
import { useCesiumViewer } from "./hooks/useCesiumViewer";
import { useImageryLayers } from "./hooks/useImageryLayers";
import { useFlightTrack } from "./hooks/useFlightTrack";
import { useMapOverlays } from "./hooks/useMapOverlays";

export function FlightMap() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { viewerRef, camPos, handleZoomIn, handleZoomOut, handleNorthUp, handleFlyToFlight } =
    useCesiumViewer(containerRef);

  useImageryLayers(viewerRef);
  useFlightTrack(viewerRef);
  const { zoneTooltip } = useMapOverlays(viewerRef);

  const { flightData, overlays, sgZones, showCameraOverlay, altUnit } = useFlightStore();

  const btnStyle: React.CSSProperties = {
    width: 32, height: 32,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    cursor: "pointer",
    color: "var(--text-secondary)",
    transition: "background 0.15s, color 0.15s",
  };

  const onBtnEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-tertiary)";
    (e.currentTarget as HTMLButtonElement).style.color = "var(--text-bright)";
  };
  const onBtnLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-secondary)";
    (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Map controls overlay */}
      <div style={{
        position: "absolute", top: 12, right: 12,
        display: "flex", flexDirection: "column", gap: 4,
        zIndex: 10,
      }}>
        <button style={btnStyle} title="Zoom in"       onClick={handleZoomIn}     onMouseEnter={onBtnEnter} onMouseLeave={onBtnLeave}><Plus size={16} /></button>
        <button style={btnStyle} title="Zoom out"      onClick={handleZoomOut}    onMouseEnter={onBtnEnter} onMouseLeave={onBtnLeave}><Minus size={16} /></button>
        <button style={{ ...btnStyle, marginTop: 4 }} title="Reset to north" onClick={handleNorthUp}    onMouseEnter={onBtnEnter} onMouseLeave={onBtnLeave}><Compass size={16} /></button>
        {flightData && (
          <button style={btnStyle} title="Fly to flight" onClick={handleFlyToFlight} onMouseEnter={onBtnEnter} onMouseLeave={onBtnLeave}><LocateFixed size={16} /></button>
        )}
      </div>

      {/* Site Guide Zones legend */}
      {overlays.has("sgZones") && sgZones.length > 0 && (() => {
        const presentClasses = [...new Set(sgZones.map((z) => z.class))].filter((c) => ZONE_DISPLAY_NAMES[c]);
        if (presentClasses.length === 0) return null;
        return (
          <div style={{
            position: "absolute", bottom: showCameraOverlay ? 90 : 12, left: 12,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5,
            padding: "7px 10px", zIndex: 10, pointerEvents: "none", userSelect: "none",
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", color: "rgba(255,255,255,0.45)", marginBottom: 5 }}>
              Zone Types
            </div>
            {presentClasses.map((cls) => {
              const style = sgZoneStyle(cls);
              return (
                <div key={cls} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: 2, flexShrink: 0,
                    background: style.fill, opacity: 0.85,
                    border: `1px solid ${style.outline}`,
                  }} />
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>{sgZoneDisplayName(cls)}</span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Zone hover tooltip */}
      {zoneTooltip && (
        <div style={{
          position: "absolute",
          left: zoneTooltip.x + 14,
          top: zoneTooltip.y - 10,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
          border: "1px solid rgba(255,255,255,0.15)", borderRadius: 5,
          padding: "5px 10px", zIndex: 20, pointerEvents: "none", userSelect: "none",
          maxWidth: 220,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: zoneTooltip.name ? 3 : 0 }}>
            <div style={{
              width: 10, height: 10, borderRadius: 2, flexShrink: 0,
              background: sgZoneStyle(zoneTooltip.class).fill,
              border: `1px solid ${sgZoneStyle(zoneTooltip.class).outline}`,
            }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.95)" }}>
              {sgZoneDisplayName(zoneTooltip.class)}
            </span>
          </div>
          {zoneTooltip.name && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", paddingLeft: 16 }}>
              {zoneTooltip.name}
            </div>
          )}
        </div>
      )}

      {/* Camera position overlay */}
      {showCameraOverlay && camPos && (
        <div style={{
          position: "absolute", bottom: 12, right: 12,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 5,
          padding: "5px 10px",
          fontSize: 11,
          fontFamily: "monospace",
          color: "rgba(255,255,255,0.85)",
          lineHeight: 1.7,
          zIndex: 10,
          pointerEvents: "none",
          userSelect: "none",
        }}>
          <div><span style={{ opacity: 0.6 }}>Lat </span>{camPos.lat.toFixed(5)}°</div>
          <div><span style={{ opacity: 0.6 }}>Lng </span>{camPos.lng.toFixed(5)}°</div>
          <div><span style={{ opacity: 0.6 }}>Alt </span>{
            altUnit === "imperial"
              ? `${(camPos.alt * 3.28084).toLocaleString(undefined, { maximumFractionDigits: 0 })} ft`
              : camPos.alt >= 1000
                ? `${(camPos.alt / 1000).toFixed(1)} km`
                : `${camPos.alt.toFixed(0)} m`
          }</div>
        </div>
      )}
    </div>
  );
}
