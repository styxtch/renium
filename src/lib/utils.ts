import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AudioOptions, ImageOptions, Preset, VideoOptions } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, idx);
  return `${val >= 100 || idx === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[idx]}`;
}

export function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatEta(seconds?: number): string {
  if (seconds == null || seconds < 0) return "";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function calcSavingsPercent(originalSize: number, outputSize?: number): number {
  if (!originalSize || outputSize == null) return 0;
  return Math.round(((originalSize - outputSize) / originalSize) * 1000) / 10;
}

export const DEFAULT_VIDEO_OPTIONS: VideoOptions = {
  outputFormat: "mp4",
  videoCodec: "h264",
  rateControl: "crf",
  crf: 23,
  targetBitrateKbps: 2500,
  encoderPreset: "medium",
  hwAccel: true,
  resolution: "original",
  fps: "original",
  rotate: 0,
  flipHorizontal: false,
  flipVertical: false,
  subtitleMode: "keep",
  subtitleTrackIndex: 0,
  stripMetadata: false,
  namingPattern: "{name}_compressed.{ext}",
  overwriteExisting: false,
};

export const DEFAULT_IMAGE_OPTIONS: ImageOptions = {
  outputFormat: "original",
  quality: 82,
  pngOptimizationLevel: 3,
  pngZopfli: false,
  progressiveJpeg: true,
  effort: 6,
  lossless: false,
  resizeMode: "none",
  resizePercentage: 50,
  keepAspectRatio: true,
  rotate: 0,
  flipHorizontal: false,
  flipVertical: false,
  grayscale: false,
  metadataMode: "keep-orientation",
  namingPattern: "{name}_compressed.{ext}",
  overwriteExisting: false,
};

export const DEFAULT_AUDIO_OPTIONS: AudioOptions = {
  outputFormat: "original",
  bitrateKbps: 192,
  sampleRate: "original",
  channels: "original",
  stripMetadata: false,
  namingPattern: "{name}_compressed.{ext}",
  overwriteExisting: false,
};

export const BUILT_IN_PRESETS: Preset[] = [
  {
    id: "builtin-video-web-balanced",
    name: "Web Balanced (MP4 H.264)",
    description: "High compatibility MP4 with CRF 23 and balanced compression",
    type: "video",
    builtIn: true,
    options: { ...DEFAULT_VIDEO_OPTIONS },
  },
  {
    id: "builtin-video-youtube-1080p",
    name: "YouTube 1080p High Quality",
    description: "Crisp 1080p H.264 CRF 19 ready for upload",
    type: "video",
    builtIn: true,
    options: {
      ...DEFAULT_VIDEO_OPTIONS,
      crf: 19,
      resolution: "1080p",
      encoderPreset: "slow",
    },
  },
  {
    id: "builtin-video-hevc-compact",
    name: "Compact Archive (H.265)",
    description: "Maximum space savings using HEVC CRF 26",
    type: "video",
    builtIn: true,
    options: {
      ...DEFAULT_VIDEO_OPTIONS,
      videoCodec: "h265",
      crf: 26,
    },
  },
  {
    id: "builtin-video-gif",
    name: "Animated GIF (15fps)",
    description: "High-quality palette GIF scaled to 720p",
    type: "video",
    builtIn: true,
    options: {
      ...DEFAULT_VIDEO_OPTIONS,
      outputFormat: "gif",
      videoCodec: "none",
      resolution: "720p",
      fps: "custom",
      customFps: 15,
    },
  },
  {
    id: "builtin-image-keep-original",
    name: "Smart Compress (Keep Format)",
    description: "Compress JPG, PNG, WebP, or AVIF while keeping original format",
    type: "image",
    builtIn: true,
    options: { ...DEFAULT_IMAGE_OPTIONS },
  },
  {
    id: "builtin-image-web-webp",
    name: "Web Optimized (WebP)",
    description: "Modern WebP format at quality 80 with stripped EXIF",
    type: "image",
    builtIn: true,
    options: {
      ...DEFAULT_IMAGE_OPTIONS,
      outputFormat: "webp",
      quality: 80,
      metadataMode: "keep-orientation",
    },
  },
  {
    id: "builtin-image-tiny-png",
    name: "Lossless PNG (OxiPNG)",
    description: "Maximum lossless PNG compression at level 4",
    type: "image",
    builtIn: true,
    options: {
      ...DEFAULT_IMAGE_OPTIONS,
      outputFormat: "png",
      pngOptimizationLevel: 4,
      lossless: true,
    },
  },
  {
    id: "builtin-image-avif-ultra",
    name: "Next-Gen AVIF",
    description: "Ultra-small AVIF images for modern web delivery",
    type: "image",
    builtIn: true,
    options: {
      ...DEFAULT_IMAGE_OPTIONS,
      outputFormat: "avif",
      quality: 72,
      effort: 6,
    },
  },
  {
    id: "builtin-audio-mp3-balanced",
    name: "MP3 Balanced (192 kbps)",
    description: "High compatibility MP3 at 192 kbps stereo",
    type: "audio",
    builtIn: true,
    options: {
      outputFormat: "mp3",
      bitrateKbps: 192,
      sampleRate: "original",
      channels: "original",
      stripMetadata: false,
      namingPattern: "{name}_compressed.{ext}",
      overwriteExisting: false,
    },
  },
  {
    id: "builtin-audio-aac-compact",
    name: "AAC Compact (128 kbps)",
    description: "Small M4A/AAC audio ideal for voice and mobile",
    type: "audio",
    builtIn: true,
    options: {
      outputFormat: "m4a",
      bitrateKbps: 128,
      sampleRate: "original",
      channels: "original",
      stripMetadata: false,
      namingPattern: "{name}_compressed.{ext}",
      overwriteExisting: false,
    },
  },
  {
    id: "builtin-audio-flac-lossless",
    name: "Lossless Archive (FLAC)",
    description: "Bit-exact lossless FLAC audio compression",
    type: "audio",
    builtIn: true,
    options: {
      outputFormat: "flac",
      bitrateKbps: 192,
      sampleRate: "original",
      channels: "original",
      stripMetadata: false,
      namingPattern: "{name}_compressed.{ext}",
      overwriteExisting: false,
    },
  },
];

export const VIDEO_EXTENSIONS = [
  "mp4",
  "mkv",
  "mov",
  "avi",
  "webm",
  "flv",
  "ts",
  "m4v",
  "wmv",
  "3gp",
];

export const IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "gif",
  "bmp",
  "tiff",
  "tif",
];

export const AUDIO_EXTENSIONS = [
  "mp3",
  "wav",
  "flac",
  "m4a",
  "aac",
  "ogg",
  "opus",
  "wma",
  "aiff",
];

const AUTO_NAMING_PATTERNS = new Set([
  "{name}_compressed.{ext}",
  "{name}_converted.{ext}",
  "{name}_trimmed.{ext}",
  "{name}_resized.{ext}",
]);

/** Returns the mode-specific naming pattern if the current pattern is one of the auto-managed defaults. */
export function nextAutoNamingPattern(
  currentPattern: string,
  mode: "compress" | "convert" | "trim" | "resize"
): string | undefined {
  if (!AUTO_NAMING_PATTERNS.has(currentPattern)) return undefined;
  switch (mode) {
    case "convert":
      return "{name}_converted.{ext}";
    case "trim":
      return "{name}_trimmed.{ext}";
    case "resize":
      return "{name}_resized.{ext}";
    default:
      return "{name}_compressed.{ext}";
  }
}
