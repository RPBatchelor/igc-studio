import { useState, useEffect } from "react";
import {
  FolderOpen,
  Folder,
  FileText,
  ChevronRight,
  ChevronDown,
  FolderSearch,
} from "lucide-react";
import { useFlightStore } from "../../stores/flightStore";
import { useFileSystem } from "../../hooks/useFileSystem";
import type { FsEntry } from "../../parsers/types";

export function FileExplorer() {
  const { rootFolder, entries, selectedFile, expandedDirs } = useFlightStore();
  const { openFolder, loadFile, loadDirectory } = useFileSystem();

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-secondary)",
      }}
    >
      <div style={{ padding: "6px 8px", display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={openFolder}
          style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "2px", display: "flex" }}
          title="Open Folder"
        >
          <FolderSearch size={15} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "0 4px" }}>
        {!rootFolder ? (
          <div
            style={{
              padding: "20px 12px",
              color: "var(--text-secondary)",
              textAlign: "center",
            }}
          >
            <p style={{ marginBottom: 8 }}>No folder opened</p>
            <button
              onClick={openFolder}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                padding: "6px 16px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 13,
              }}
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
              onFileClick={loadFile}
              onLoadDir={loadDirectory}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TreeNode({
  entry,
  depth,
  selectedFile,
  expandedDirs,
  onFileClick,
  onLoadDir,
}: {
  entry: FsEntry;
  depth: number;
  selectedFile: string | null;
  expandedDirs: Set<string>;
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

  const handleClick = () => {
    if (entry.isDir) {
      toggleDir(entry.path);
    } else {
      onFileClick(entry.path, entry.name);
    }
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
          background: isSelected ? "rgba(255,255,255,0.08)" : "transparent",
          color: isSelected ? "#fff" : "var(--text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => {
          if (!isSelected)
            (e.currentTarget as HTMLDivElement).style.background =
              "rgba(255,255,255,0.04)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected)
            (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      >
        {entry.isDir ? (
          <>
            {expanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
            {expanded ? (
              <FolderOpen size={14} color="#dcb67a" />
            ) : (
              <Folder size={14} color="#dcb67a" />
            )}
          </>
        ) : (
          <>
            <span style={{ width: 14 }} />
            <FileText size={14} color="#6997d5" />
          </>
        )}
        <span
          style={{ overflow: "hidden", textOverflow: "ellipsis", fontSize: 13 }}
        >
          {entry.name}
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
            onFileClick={onFileClick}
            onLoadDir={onLoadDir}
          />
        ))}
    </>
  );
}
