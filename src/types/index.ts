export type MediaType = "video" | "image" | "audio";

export type ActiveTab = "video" | "image" | "audio" | "history";

export type ThemeMode = "dark" | "light";
export type ThemeStyle = "default" | "neumorphism";

export type JobStatus =
  | "queued"
  | "processing"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface SubtitleTrack {
  index: number;
  language?: string;
  title?: string;
}

export interface AudioTrack {
  index: number;
  codec?: string;
  language?: string;
  title?: string;
}

export interface MediaProbeInfo {
  durationMs?: number;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  audioTracks?: AudioTrack[];
  subtitleTracks?: SubtitleTrack[];
}

export interface VideoOptions {
  outputFormat: "mp4" | "webm" | "mkv" | "mov" | "gif" | "mp3" | "aac";
  videoCodec: "h264" | "h265" | "vp9" | "av1" | "none";
  rateControl: "crf" | "bitrate" | "two-pass";
  crf: number;
  targetBitrateKbps?: number;
  encoderPreset:
    | "ultrafast"
    | "superfast"
    | "veryfast"
    | "faster"
    | "fast"
    | "medium"
    | "slow"
    | "slower"
    | "veryslow"
    | "placebo";
  hwAccel: boolean;
  resolution: "original" | "1080p" | "720p" | "480p" | "custom";
  customWidth?: number;
  customHeight?: number;
  fps: "original" | 60 | 30 | 24 | "custom";
  customFps?: number;
  rotate: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  flipVertical: boolean;
  trimStartSec?: number;
  trimEndSec?: number;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  extractThumbnailSec?: number;
  subtitleMode: "keep" | "strip" | "burn-in" | "extract-srt";
  subtitleTrackIndex?: number;
  externalSrtPath?: string;
  stripMetadata: boolean;
  audioCodec?: "aac" | "opus" | "mp3" | "copy" | "none";
  audioBitrateKbps?: number;
  audioChannels?: "original" | "stereo" | "mono";
  audioTrackIndex?: number;
  colorSpace?: "auto" | "bt709" | "hdr-to-sdr";
  encoderProfile?: "auto" | "main" | "high" | "main10";
  encoderTune?: "none" | "film" | "animation" | "grain" | "fastdecode";
  pixFmt?: "auto" | "yuv420p" | "yuv420p10le";
  deinterlace?: "none" | "yadif" | "bwdif";
  denoise?: "none" | "light" | "medium" | "strong";
  sharpen?: "none" | "light" | "medium";
  preserveChapters?: boolean;
  fpsMode?: "auto" | "cfr" | "vfr";
  fastStart?: boolean;
  outputDir?: string;
  namingPattern: string;
  overwriteExisting: boolean;
}

export interface ImageOptions {
  outputFormat: "original" | "jpg" | "png" | "webp" | "avif" | "gif" | "tiff";
  quality: number;
  pngOptimizationLevel: number;
  pngZopfli: boolean;
  progressiveJpeg: boolean;
  effort: number;
  lossless: boolean;
  resizeMode: "none" | "dimensions" | "percentage";
  targetWidth?: number;
  targetHeight?: number;
  resizePercentage?: number;
  keepAspectRatio: boolean;
  rotate: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  flipVertical: boolean;
  grayscale: boolean;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  metadataMode: "keep-all" | "strip-all" | "keep-orientation";
  outputDir?: string;
  namingPattern: string;
  overwriteExisting: boolean;
}

export interface AudioOptions {
  outputFormat: "original" | "mp3" | "aac" | "m4a" | "wav" | "flac" | "ogg" | "opus";
  bitrateKbps: number;
  sampleRate: "original" | 44100 | 48000;
  channels: "original" | "mono" | "stereo";
  trimStartSec?: number;
  trimEndSec?: number;
  stripMetadata: boolean;
  volumeGainDb?: number;
  loudnessTargetLufs?: -14 | -16 | -23;
  fadeInSec?: number;
  fadeOutSec?: number;
  outputDir?: string;
  namingPattern: string;
  overwriteExisting: boolean;
}

export interface Job {
  id: string;
  type: MediaType;
  inputPath: string;
  outputPath?: string;
  fileName: string;
  originalSize: number;
  outputSize?: number;
  sizeLargerWarning?: boolean;
  progress: number;
  etaSeconds?: number;
  status: JobStatus;
  error?: string;
  probeInfo?: MediaProbeInfo;
  options: VideoOptions | ImageOptions | AudioOptions;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface HistoryItem {
  id: string;
  type: MediaType;
  fileName: string;
  inputPath: string;
  outputPath: string;
  originalSize: number;
  outputSize: number;
  savedBytes: number;
  status: "completed" | "failed";
  error?: string;
  finishedAt: number;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  type: MediaType;
  builtIn: boolean;
  options: VideoOptions | ImageOptions | AudioOptions;
}

export interface AppSettings {
  defaultOutputDir?: string;
  hwAccel: boolean;
  maxConcurrentVideoJobs: number;
  maxConcurrentImageJobs: number;
  maxConcurrentAudioJobs: number;
  checkUpdates: boolean;
  autoClearCompleted?: boolean;
  customFfmpegPath?: string;
  customFfprobePath?: string;
}

export interface Capabilities {
  platform: string;
  cpuCores: number;
  hwEncoders: string[];
  hasNvenc: boolean;
  hasQsv: boolean;
  hasAmf: boolean;
  hasVideotoolbox: boolean;
  hasVaapi: boolean;
}

export interface FfmpegStatus {
  installed: boolean;
  version?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  source?: string;
}

export interface JobProgressEvent {
  id: string;
  type: MediaType;
  progress: number;
  etaSeconds?: number;
}

export interface JobStatusChangedEvent {
  id: string;
  type: MediaType;
  status: JobStatus;
  outputPath?: string;
  outputSize?: number;
  sizeLargerWarning?: boolean;
  error?: string;
  finishedAt?: number;
}

export interface FfmpegDownloadProgressEvent {
  downloadedBytes: number;
  totalBytes: number;
  stage: "downloading" | "verifying" | "extracting" | "done";
  sha256?: string;
}

export interface FfmpegLogEvent {
  id: string;
  type: MediaType;
  line: string;
}

export interface FfmpegLogEntry {
  id: string;
  jobId: string;
  type: MediaType;
  line: string;
  timestamp: number;
}

export interface MediaPreviewResponse {
  originalDataUrl: string;
  processedDataUrl: string;
  originalWidth: number;
  originalHeight: number;
  processedWidth: number;
  processedHeight: number;
  originalSize: number;
  processedSize: number;
  estimatedOutputSize?: number;
  durationMs?: number;
  previewTimeSec: number;
  processedFormat: string;
}
