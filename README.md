# Renium

Desktop **offline-first** media compressor and converter for **Video**, **Image**, and **Audio**, built with **Tauri 2**, **Rust**, **React**, **TypeScript**, and **Tailwind CSS**.

All media processing runs 100% locally on your machine — no cloud uploads, no telemetry.

---

## Features

- **Video Compression & Conversion**: H.264, H.265 (HEVC), VP9, AV1; output to MP4, MKV, MOV, WebM, animated GIF, or audio extraction (MP3 / AAC); CRF / Target Bitrate / Two-Pass rate control; hardware acceleration auto-detection (NVENC, QSV, AMF, VideoToolbox, VAAPI); subtitles (`keep`, `strip`, `burn-in`, `extract-srt`).
- **Image Compression & Conversion**: Smart compression and conversion between JPG, PNG (OxiPNG + optional Zopfli), WebP, AVIF, GIF, and TIFF; resize by dimensions or percentage; rotate & flip; EXIF metadata control.
- **Audio Compression, Conversion & Trimming**: Compress or convert MP3, WAV, FLAC, M4A, AAC, OGG, Opus, WMA, and AIFF with configurable bitrate (64–320 kbps), sample rate (`44.1 kHz` / `48 kHz`), stereo/mono channels, loudness normalization (`loudnorm`), metadata stripping, and start/end trimming.
- **Selective Batch Queue & Output List**:
  - Dedicated **Queue** (active/queued items) and **Output List** (finished items) with drag-and-drop or button reordering.
  - Per-file checkboxes & **Select All** toggle to process only chosen files while keeping others staged.
  - Process-level **Pause / Resume / Cancel** (`NtSuspendProcess` on Windows, `SIGSTOP`/`SIGCONT` on macOS/Linux).
  - Atomic `.part` writes, auto-rename collision handling, and **Keep Original** warning when compressed output exceeds original size.
- **Visual Preview & Editor**:
  - Interactive **Before / After** split slider directly over the image/frame or side-by-side comparison.
  - **Visual Crop** with aspect ratio presets (`Free`, `16:9`, `9:16`, `1:1`, `4:3`) and **Video Trim Timeline**.
  - **Compare Output** mode on finished items comparing original vs saved output file on disk.
- **Presets & History**: Built-in and custom presets with JSON import/export, plus persistent cross-session **History** with total space saved statistics.
- **Themes**: Separate **Color Mode** (`Light` / `Dark`) and **Theme Style** (`Modern Card` / `Neumorphism Soft UI`), plus collapsible icon-only sidebar.

---

## Tech Stack & Architecture

```text
Renium/
├── src/                        # React + TypeScript + Tailwind frontend
│   ├── components/             # Layout, Queue, Preview, Settings, UI Primitives
│   ├── lib/                    # Tauri IPC wrappers, keyboard shortcuts, formatting
│   ├── stores/                 # Zustand stores (jobStore, settingsStore, historyStore, themeStore)
│   ├── styles/                 # Design tokens & Neumorphism CSS rules (globals.css)
│   └── views/                  # VideoView, ImageView, AudioView, HistoryView
└── src-tauri/                  # Rust backend (Tauri 2 + Tokio)
    ├── src/commands/           # Tauri IPC command handlers
    ├── src/ffmpeg/             # First-run FFmpeg/FFprobe downloader (SHA-256) & probe
    ├── src/processors/         # Video & Audio (FFmpeg) + Image (image-rs/oxipng/ravif) pipelines
    ├── src/queue/              # QueueManager, bounded concurrency, OS pause/resume
    └── src/storage/            # JSON persistence in AppData (settings, presets, history, recovery)
```

---

## Development & Build Setup

### Prerequisites
- **Node.js** 20+
- **Rust** (stable toolchain via `rustup`)
- **Tauri 2 OS Prerequisites**:
  - **Windows**: WebView2 + Microsoft C++ Build Tools
  - **macOS**: Xcode Command Line Tools
  - **Linux (Ubuntu/Debian)**: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`

### Commands

```bash
# Install dependencies
npm install

# Run in development mode (launches Vite + Tauri window)
npm run tauri dev

# Run frontend unit tests (Vitest)
npm test

# Type-check & build frontend bundle
npm run build

# Run Rust library unit tests
cargo test --manifest-path src-tauri/Cargo.toml --lib

# Build production installer (.msi / .exe / .dmg / .AppImage / .deb)
npm run tauri build
```

> **Windows PowerShell note**: If PowerShell script execution policy blocks `npm`, use `npm.cmd` (e.g. `npm.cmd test`, `npm.cmd run build`).

---

## Keyboard Shortcuts

Press `?` or `F1` anywhere in the app (or click the keyboard icon in the sidebar) to view the in-app cheat sheet:

| Shortcut | Action |
|---|---|
| `Ctrl + 1` / `Cmd + 1` | Switch to Video workspace |
| `Ctrl + 2` / `Cmd + 2` | Switch to Image workspace |
| `Ctrl + 3` / `Cmd + 3` | Switch to Audio workspace |
| `Ctrl + 4` / `Cmd + 4` | Switch to History view |
| `Ctrl + ,` / `Cmd + ,` | Open App Preferences |
| `?` or `F1` | Toggle Keyboard Shortcuts dialog |
| `Esc` | Close Keyboard Shortcuts dialog |
| `Ctrl + O` / `Cmd + O` | Add files to current queue |
| `Ctrl + Shift + O` / `Cmd + Shift + O` | Add folder to current queue |
| `Ctrl + Enter` / `Cmd + Enter` | Start or resume current queue |
| `Ctrl + P` / `Cmd + P` | Pause or resume active processing |
| `Delete` / `Backspace` | Remove selected job from queue |

---

## Custom Presets (JSON)

You can save, export, or import custom presets via **Preset → Manage / JSON** in any workspace (**Video**, **Image**, or **Audio**). Imported JSON supports either a **single preset object** or an **array of presets**, and partial `options` fields automatically fall back to defaults.

<details>
<summary>Example JSON templates (Video, Image, Audio)</summary>

```json
[
  {
    "id": "custom-video-whatsapp-720p",
    "name": "WhatsApp Share 720p",
    "description": "Compact 720p MP4 H.264 CRF 26",
    "type": "video",
    "builtIn": false,
    "options": {
      "outputFormat": "mp4",
      "videoCodec": "h264",
      "crf": 26,
      "resolution": "720p",
      "encoderPreset": "fast",
      "namingPattern": "{name}_compressed.{ext}"
    }
  },
  {
    "id": "custom-image-social-webp",
    "name": "Social Media WebP 1200px",
    "description": "Resize width to 1200px and convert to WebP quality 80",
    "type": "image",
    "builtIn": false,
    "options": {
      "outputFormat": "webp",
      "quality": 80,
      "resizeMode": "dimensions",
      "targetWidth": 1200,
      "metadataMode": "keep-orientation",
      "namingPattern": "{name}_converted.{ext}"
    }
  },
  {
    "id": "custom-audio-podcast-mp3",
    "name": "Podcast MP3 128k",
    "description": "Compact MP3 128 kbps 44.1kHz",
    "type": "audio",
    "builtIn": false,
    "options": {
      "outputFormat": "mp3",
      "bitrateKbps": 128,
      "sampleRate": 44100,
      "namingPattern": "{name}_converted.{ext}"
    }
  }
]
```

</details>

<details>
<summary>Supported <code>options</code> fields reference</summary>

- **Video (`type: "video"`)**:
  - `outputFormat`: `"mp4" | "webm" | "mkv" | "mov" | "gif" | "mp3" | "aac"`
  - `videoCodec`: `"h264" | "h265" | "vp9" | "av1" | "none"`
  - `rateControl`: `"crf" | "bitrate" | "two-pass"`, `crf` (number), `targetBitrateKbps` (number)
  - `encoderPreset`: `"ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow" | "placebo"`
  - `hwAccel` (boolean)
  - `resolution`: `"original" | "1080p" | "720p" | "480p" | "custom"`, `customWidth`, `customHeight`
  - `fps`: `"original" | 60 | 30 | 24 | "custom"`, `customFps`
  - `rotate`: `0 | 90 | 180 | 270`, `flipHorizontal`, `flipVertical`
  - `trimStartSec`, `trimEndSec`, `cropX`, `cropY`, `cropWidth`, `cropHeight`, `extractThumbnailSec`
  - `subtitleMode`: `"keep" | "strip" | "burn-in" | "extract-srt"`, `subtitleTrackIndex`, `externalSrtPath`
  - `stripMetadata` (boolean), `outputDir`, `namingPattern`, `overwriteExisting` (boolean)
- **Image (`type: "image"`)**:
  - `outputFormat`: `"original" | "jpg" | "png" | "webp" | "avif" | "gif" | "tiff"`
  - `quality` (1–100), `pngOptimizationLevel` (1–6), `pngZopfli`, `progressiveJpeg`, `effort`, `lossless`
  - `resizeMode`: `"none" | "dimensions" | "percentage"`, `targetWidth`, `targetHeight`, `resizePercentage`, `keepAspectRatio`
  - `rotate`: `0 | 90 | 180 | 270`, `flipHorizontal`, `flipVertical`, `grayscale`
  - `cropX`, `cropY`, `cropWidth`, `cropHeight`
  - `metadataMode`: `"keep-all" | "strip-all" | "keep-orientation"`, `outputDir`, `namingPattern`, `overwriteExisting`
- **Audio (`type: "audio"`)**:
  - `outputFormat`: `"original" | "mp3" | "aac" | "m4a" | "wav" | "flac" | "ogg"`
  - `bitrateKbps` (number), `sampleRate`: `"original" | 44100 | 48000`, `channels`: `"original" | "mono" | "stereo"`
  - `trimStartSec`, `trimEndSec`, `stripMetadata` (boolean), `outputDir`, `namingPattern`, `overwriteExisting`

</details>

---

## Attribution & Licenses

- **FFmpeg & FFprobe**: Downloaded externally on first run into the application's `AppData` directory (verified via SHA-256 checksum) or imported from a local binary. FFmpeg is licensed under the LGPL/GPL depending on build configuration.
- **Core Rust Crates**: `tauri`, `tokio`, `image`, `oxipng`, `ravif`, `jpeg-encoder`, `kamadak-exif`, `reqwest`, `serde`.
- **Core Frontend Libraries**: `react`, `zustand`, `tailwindcss`, `lucide-react`, `@tanstack/react-virtual`.
