use reqwest;
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub extension: Option<String>,
}

#[tauri::command]
pub fn read_directory(path: String) -> Result<Vec<FsEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries: Vec<FsEntry> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let metadata = entry.metadata().ok()?;
            let name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden files/dirs
            if name.starts_with('.') {
                return None;
            }

            let is_dir = metadata.is_dir();
            let extension = if is_dir {
                None
            } else {
                entry
                    .path()
                    .extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
            };

            // Only show directories and flight log files
            if !is_dir {
                match extension.as_deref() {
                    Some("igc" | "kml" | "kmz" | "gpx") => {}
                    _ => return None,
                }
            }

            Some(FsEntry {
                name,
                path: entry.path().to_string_lossy().to_string(),
                is_dir,
                extension,
            })
        })
        .collect();

    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name))
    });

    Ok(entries)
}

#[tauri::command]
pub fn read_file_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub fn write_file_text(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
pub fn get_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

// ── Lightweight flight scanner ────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightFileMeta {
    pub path: String,
    pub name: String,
    pub folder_name: String,
    pub lat: f64,
    pub lng: f64,
}

/// Parse IGC DDMMmmmN/DDDMMmmmE into decimal degrees.
fn parse_igc_b_record(line: &str) -> Option<(f64, f64)> {
    // B HHMMSS DDMMmmmN DDDMMmmmE A PPPPP GGGGG
    // B[1] time[6] lat[8] lon[9] validity[1] ...
    let b = line.as_bytes();
    if b.len() < 35 || b[0] != b'B' {
        return None;
    }
    // Latitude: chars 7–14  →  DDMMmmmN
    let lat_str = &line[7..15];
    let lon_str = &line[15..24];

    let lat_d: f64 = lat_str[0..2].parse().ok()?;
    let lat_m: f64 = lat_str[2..7].parse::<f64>().ok()? / 1000.0;
    let lat = lat_d + lat_m / 60.0;
    let lat = if lat_str.as_bytes()[7] == b'S' { -lat } else { lat };

    let lon_d: f64 = lon_str[0..3].parse().ok()?;
    let lon_m: f64 = lon_str[3..8].parse::<f64>().ok()? / 1000.0;
    let lng = lon_d + lon_m / 60.0;
    let lng = if lon_str.as_bytes()[8] == b'W' { -lng } else { lng };

    Some((lat, lng))
}

/// Extract first GPS fix from an IGC file by reading line-by-line.
fn first_fix_igc(path: &Path) -> Option<(f64, f64)> {
    let file = fs::File::open(path).ok()?;
    for line in BufReader::new(file).lines().flatten() {
        if line.starts_with('B') {
            if let Some(fix) = parse_igc_b_record(&line) {
                return Some(fix);
            }
        }
    }
    None
}

/// Extract first GPS fix from a KML file by scanning for the first coordinate triplet.
fn first_fix_kml(path: &Path) -> Option<(f64, f64)> {
    let text = fs::read_to_string(path).ok()?;
    // Try <gx:coord>lng lat alt</gx:coord> first
    if let Some(start) = text.find("<gx:coord>") {
        let after = &text[start + 10..];
        if let Some(end) = after.find("</gx:coord>") {
            let triplet = after[..end].trim();
            let parts: Vec<&str> = triplet.split_whitespace().collect();
            if parts.len() >= 2 {
                let lng: f64 = parts[0].parse().ok()?;
                let lat: f64 = parts[1].parse().ok()?;
                return Some((lat, lng));
            }
        }
    }
    // Fallback: <coordinates>lng,lat,alt ...</coordinates>
    if let Some(start) = text.find("<coordinates>") {
        let after = &text[start + 13..];
        let triplet = after.split_whitespace().next()?.trim_matches(',');
        let parts: Vec<&str> = triplet.split(',').collect();
        if parts.len() >= 2 {
            let lng: f64 = parts[0].parse().ok()?;
            let lat: f64 = parts[1].parse().ok()?;
            return Some((lat, lng));
        }
    }
    None
}

/// Recursively walk `root` and return metadata + first GPS fix for every flight file found.
#[tauri::command]
pub fn scan_flights(root: String) -> Result<Vec<FlightFileMeta>, String> {
    let mut results = Vec::new();
    scan_dir(Path::new(&root), &mut results);
    Ok(results)
}

fn scan_dir(dir: &Path, out: &mut Vec<FlightFileMeta>) {
    let Ok(read) = fs::read_dir(dir) else { return };
    for entry in read.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            scan_dir(&path, out);
        } else {
            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase());
            let fix = match ext.as_deref() {
                Some("igc") => first_fix_igc(&path),
                Some("kml") => first_fix_kml(&path),
                _ => None,
            };
            if let Some((lat, lng)) = fix {
                let folder_name = path
                    .parent()
                    .and_then(|p| p.file_name())
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                out.push(FlightFileMeta {
                    path: path.to_string_lossy().to_string(),
                    name,
                    folder_name,
                    lat,
                    lng,
                });
            }
        }
    }
}

/// Fetch a URL from the Rust backend, bypassing browser CORS restrictions.
/// Used for downloading airspace files and checking for updates.
#[tauri::command]
pub async fn fetch_url_text(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("IGCStudio/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("fetch failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    response.text().await.map_err(|e| e.to_string())
}
