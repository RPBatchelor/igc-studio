import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useFlightStore } from "../stores/flightStore";
import { parseIGC } from "../parsers/igc";
import { parseKML } from "../parsers/kml";
import type { FsEntry } from "../parsers/types";

export function useFileSystem() {
  const store = useFlightStore();

  async function openFolder() {
    const selected = await open({ directory: true });
    if (selected) {
      store.setRootFolder(selected as string);
      const entries = await invoke<FsEntry[]>("read_directory", {
        path: selected,
      });
      store.setEntries(entries);
    }
  }

  async function loadDirectory(path: string) {
    const entries = await invoke<FsEntry[]>("read_directory", { path });
    return entries;
  }

  async function loadFile(path: string, filename: string) {
    store.setSelectedFile(path);
    const content = await invoke<string>("read_file_text", { path });
    const ext = filename.split(".").pop()?.toLowerCase();

    let data;
    if (ext === "igc") {
      data = parseIGC(content, filename);
    } else if (ext === "kml") {
      data = parseKML(content, filename);
    } else {
      return; // unsupported
    }

    store.setFlightData(data);
  }

  return { openFolder, loadDirectory, loadFile };
}
