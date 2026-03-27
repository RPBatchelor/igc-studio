import { useState, useEffect } from "react";
import {
  FolderOpen,
  Folder,
  Navigation,
  Globe,
  Archive,
  ChevronRight,
  ChevronDown,
  FolderSearch,
} from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import { formatFlightFilename } from "../../lib/formatFilename";
import type { FsEntry } from "../../parsers/types";

const FILE_TYPES = {
  igc: { icon: Navigation, color: "#4fc3f7", label: "IGC" },
  kml: { icon: Globe,      color: "#81c784", label: "KML" },
  bak: { icon: Archive,    color: "#9e9e9e", label: "BAK" },
} as const;

type FileTypeKey = keyof typeof FILE_TYPES;

function getFileType(name: string): FileTypeKey | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "igc") return "igc";
  if (ext === "kml") return "kml";
  if (ext === "bak") return "bak";
  return null;
}

export function FileExplorer() {
  const { rootFolder, entries, selectedFile, expandedDirs, visibleFileTypes, toggleFileType, showFullFilename, showBakFiles } = useFlightStore();
  const { openFolder, loadFile, loadDirectory } = useFileSystem();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
      {/* Open folder button */}
      <div style={{ padding: "6px 8px", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
        <button
          onClick={openFolder}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px", display: "flex" }}
          title="Open Folder"
        >
          <FolderSearch size={15} />
        </button>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 4px" }}>
        {!rootFolder ? (
          <div style={{ padding: "20px 12px", color: "var(--text-muted)", textAlign: "center" }}>
            <p style={{ marginBottom: 8 }}>No folder opened</p>
            <button
              onClick={openFolder}
              style={{ background: "var(--accent)", color: "#fff", border: "none", padding: "6px 16px", borderRadius: 4, cursor: "pointer", fontSize: 13 }}
            >
              Open Folder
            </button>
          </div>
        ) : (
          entries.map((entry) => (
            <TreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              selectedFile={selectedFile}
              expandedDirs={expandedDirs}
              visibleFileTypes={visibleFileTypes}
              showFullFilename={showFullFilename}
              showBakFiles={showBakFiles}
              onFileClick={loadFile}
              onLoadDir={loadDirectory}
            />
          ))
        )}
      </div>

      {/* File type filter */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "8px 12px", flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--text-muted)", marginBottom: 6 }}>
          Show file types
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(Object.entries(FILE_TYPES) as [FileTypeKey, typeof FILE_TYPES[FileTypeKey]][]).filter(([type]) => type !== "bak").map(([type, { icon: Icon, color, label }]) => {
            const active = visibleFileTypes.has(type as "igc" | "kml");
            return (
              <button
                key={type}
                onClick={() => toggleFileType(type as "igc" | "kml")}
                title={`Toggle ${label} files`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: `1px solid ${active ? color : "var(--border)"}`,
                  background: active ? `${color}18` : "transparent",
                  color: active ? color : "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  transition: "all 0.15s",
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TreeNode({
  entry,
  depth,
  selectedFile,
  expandedDirs,
  visibleFileTypes,
  showFullFilename,
  showBakFiles,
  onFileClick,
  onLoadDir,
}: {
  entry: FsEntry;
  depth: number;
  selectedFile: string | null;
  expandedDirs: Set<string>;
  visibleFileTypes: Set<FileTypeKey>;
  showFullFilename: boolean;
  showBakFiles: boolean;
  onFileClick: (path: string, name: string) => void;
  onLoadDir: (path: string) => Promise<FsEntry[]>;
}) {
  const { toggleDir } = useFlightStore();
  const expanded = expandedDirs.has(entry.path);
  const [children, setChildren] = useState<FsEntry[]>([]);
  const isSelected = entry.path === selectedFile;

  useEffect(() => {
    if (expanded && entry.isDir && children.length === 0) {
      onLoadDir(entry.path).then(setChildren);
    }
  }, [expanded, entry.isDir, entry.path]);

  // Filter out files whose type is toggled off
  if (!entry.isDir) {
    const type = getFileType(entry.name);
    if (!type) return null;
    if (type === "bak") {
      if (!showBakFiles) return null;
    } else if (!visibleFileTypes.has(type)) {
      return null;
    }
  }

  const fileType = !entry.isDir ? getFileType(entry.name) : null;
  const FileIcon = fileType ? FILE_TYPES[fileType].icon : null;
  const fileColor = fileType ? FILE_TYPES[fileType].color : "#858585";

  const handleClick = () => {
    if (entry.isDir) toggleDir(entry.path);
    else onFileClick(entry.path, entry.name);
  };

  return (
    <>
      <div
        onClick={handleClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 6px",
          paddingLeft: depth * 16 + 6,
          cursor: "pointer",
          borderRadius: 3,
          background: isSelected ? "var(--bg-selected)" : "transparent",
          color: isSelected ? "var(--text-bright)" : "var(--text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)"; }}
        onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      >
        {entry.isDir ? (
          <>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {expanded
              ? <FolderOpen size={14} color="#dcb67a" />
              : <Folder size={14} color="#dcb67a" />}
          </>
        ) : (
          <>
            <span style={{ width: 14 }} />
            {FileIcon && <FileIcon size={14} color={fileColor} />}
          </>
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", fontSize: 13 }}>
          {fileType ? formatFlightFilename(entry.name, showFullFilename) : entry.name}
        </span>
      </div>

      {expanded &&
        children.map((child) => (
          <TreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            expandedDirs={expandedDirs}
            visibleFileTypes={visibleFileTypes}
            showFullFilename={showFullFilename}
            showBakFiles={showBakFiles}
            onFileClick={onFileClick}
            onLoadDir={onLoadDir}
          />
        ))}
    </>
  );
}
