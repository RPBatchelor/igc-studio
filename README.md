# IGC Studio

<p align="center">
  <img src="src/assets/igc_studio_logo.png" alt="IGC Studio" width="160" />
</p>

A desktop application for visualising paragliding flight logs, built by a pilot who thought every existing tool was terrible.

## Screenshots

<table>
  <tr>
    <td align="center"><b>VS Code-style folder browser</b></td>
    <td align="center"><b>Location grouping</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/folder-structure.png" alt="VS Code-style folder browser" /></td>
    <td><img src="docs/screenshots/location-grouping.png" alt="Flights grouped by launch site" /></td>
  </tr>
</table>

### 3D Terrain Flight View

![3D terrain flight track](docs/screenshots/3d-terrain.png)

## Features

- **Flight log browser** — navigate your local flight library organised by year and site
- **3D map visualisation** — flight tracks rendered on an interactive CesiumJS globe with OpenStreetMap base layer
- **Pilot marker** — animated position indicator that moves along the track as you scrub through the timeline
- **Flight statistics** — duration, max/min altitude, altitude gain, max/avg speed, total distance
- **Live charts** — altitude, speed and distance profiles with a synced playback cursor
- **Timeline scrubber** — play, pause, jump to start/end, and control playback speed (1x–50x)
- **Map layer switcher** — toggle between OpenStreetMap, satellite imagery, road overlays and 3D terrain
- **VSCode-style UI** — activity bar, collapsible side panels, dark theme

## Supported Formats

| Format | Extension | Notes |
|--------|-----------|-------|
| IGC    | `.igc`    | Standard FAI flight recorder format |
| KML    | `.kml`    | Google Earth format |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Tauri v2](https://tauri.app) + Rust |
| UI framework | [React 19](https://react.dev) + TypeScript |
| Build tool | [Vite 8](https://vitejs.dev) |
| 3D map | [CesiumJS 1.139](https://cesium.com) |
| Charts | [Recharts](https://recharts.org) |
| State | [Zustand](https://zustand-demo.pmnd.rs) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| Icons | [Lucide React](https://lucide.dev) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (for the Tauri desktop shell)

```bash
# Install Rust via rustup (Windows)
winget install Rustlang.Rustup
```

### Install & Run

```bash
# Clone the repo
git clone https://github.com/RPBatchelor/igc-studio.git
cd igc-studio

# Install dependencies
npm install

# Run in the browser (no Rust required)
npm run dev

# Run as a desktop app (requires Rust)
npx tauri dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser, or wait for the Tauri window to appear.

### Build

```bash
# Web build
npm run build

# Desktop installer
npx tauri build
```

## Usage

1. Click the **folder icon** in the activity bar to open the Explorer panel
2. Click **Open Folder** and select your flight log directory
3. Browse folders and click any `.igc` or `.kml` file to load it
4. Use the **timeline** at the bottom to play back the flight or scrub to any point
5. Click the **layers icon** in the activity bar to switch map base layers
6. View flight stats and altitude/speed/distance charts in the right panel

## Project Structure

```
igc-studio/
├── src/                        # React frontend
│   ├── components/
│   │   ├── explorer/           # File browser & map layer controls
│   │   ├── layout/             # App shell & panel layout
│   │   ├── map/                # CesiumJS flight map
│   │   ├── stats/              # Stats cards & charts
│   │   └── timeline/           # Playback controls
│   ├── hooks/                  # useFileSystem, useFlightAnimation
│   ├── parsers/                # IGC & KML parsers, shared types
│   ├── stores/                 # Zustand store
│   └── lib/                    # Flight stats calculator
└── src-tauri/                  # Tauri Rust backend
    └── src/commands/           # File system commands
```

## Roadmap

- [ ] 3D terrain elevation (requires Cesium Ion token)
- [ ] Colour-coded track by altitude / speed / vario
- [ ] XC scoring and triangle detection
- [ ] Flight comparison (overlay multiple tracks)
- [ ] Thermal map overlay
- [ ] Export to GPX / KMZ
- [ ] Weather data integration

## License

MIT
