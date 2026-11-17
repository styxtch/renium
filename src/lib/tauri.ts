import { invoke } from "@tauri-apps/api/core";
import { listen, TauriEvent, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { AUDIO_EXTENSIONS, BUILT_IN_PRESETS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "@/lib/utils";
import type {
  AppSettings,
  AudioOptions,
  Capabilities,
  FfmpegDownloadProgressEvent,
  FfmpegLogEvent,
  FfmpegStatus,
  HistoryItem,
  ImageOptions,
  Job,
  JobProgressEvent,
  JobStatusChangedEvent,
  MediaPreviewResponse,
  MediaType,
  Preset,
  VideoOptions,
} from "@/types";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const DEFAULT_CAPABILITIES: Capabilities = {
  platform: "web",
  cpuCores: 4,
  hwEncoders: [],
  hasNvenc: false,
  hasQsv: false,
  hasAmf: false,
  hasVideotoolbox: false,
  hasVaapi: false,
};

const DEFAULT_SETTINGS: AppSettings = {
  hwAccel: true,
  maxConcurrentVideoJobs: 1,
  maxConcurrentImageJobs: 4,
  maxConcurrentAudioJobs: 2,
  checkUpdates: false,
  autoClearCompleted: false,
};

// --- Queue & Jobs ---
export async function getJobs(mediaType: MediaType): Promise<Job[]> {
  if (!isTauriRuntime()) return [];
  return invoke<Job[]>("get_jobs", { mediaType });
}

export async function addJobs(
  paths: string[],
  mediaType: MediaType,
  options: VideoOptions | ImageOptions | AudioOptions
): Promise<Job[]> {
  if (!isTauriRuntime()) return [];
  return invoke<Job[]>("add_jobs", { paths, mediaType, options });
}

export async function updateQueuedJobsOptions(
  mediaType: MediaType,
  options: VideoOptions | ImageOptions | AudioOptions
): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("update_queued_jobs_options", { mediaType, options });
}

export async function startQueue(
  mediaType: MediaType,
  jobIds?: string[]
): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("start_queue", { mediaType, jobIds });
}

export async function pauseJob(id: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("pause_job", { id });
}

export async function resumeJob(id: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("resume_job", { id });
}

export async function cancelJob(id: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("cancel_job", { id });
}

export async function pauseAllJobs(mediaType: MediaType): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("pause_all_jobs", { mediaType });
}

export async function resumeAllJobs(mediaType: MediaType): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("resume_all_jobs", { mediaType });
}

export async function cancelAllJobs(mediaType: MediaType): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("cancel_all_jobs", { mediaType });
}

export async function removeJob(id: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("remove_job", { id });
}

export async function clearCompletedJobs(mediaType: MediaType): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("clear_completed_jobs", { mediaType });
}

export async function reorderJobs(
  mediaType: MediaType,
  jobIds: string[]
): Promise<Job[]> {
  if (!isTauriRuntime()) return [];
  return invoke<Job[]>("reorder_jobs", { mediaType, jobIds });
}

export async function retryJob(id: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("retry_job", { id });
}

export async function keepOriginal(id: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("keep_original", { id });
}

export async function openOutputFolder(path: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("open_output_folder", { path });
}

export async function openOutputFile(path: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("open_output_file", { path });
}

function buildFallbackSvgDataUrl(label: string, w: number, h: number, accent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="${accent}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#f8fafc" font-family="sans-serif" font-size="24">${label} (${w}x${h})</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function generatePreview(
  inputPath: string,
  mediaType: MediaType,
  options: VideoOptions | ImageOptions | AudioOptions,
  previewTimeSec?: number,
  outputPath?: string
): Promise<MediaPreviewResponse> {
  if (!isTauriRuntime()) {
    const origW = 1920;
    const origH = 1080;
    const cw = "cropWidth" in options ? (options.cropWidth ?? origW) : origW;
    const ch = "cropHeight" in options ? (options.cropHeight ?? origH) : origH;
    const outW = Math.max(2, cw);
    const outH = Math.max(2, ch);
    const areaRatio = (outW * outH) / (origW * origH);
    const origSize = 2_400_000;
    const estSize = Math.max(64_000, Math.round(origSize * areaRatio * 0.55));
    const outExt = outputPath?.split(".").pop()?.toLowerCase();
    const fmt =
      outExt ||
      (options.outputFormat === "original"
        ? mediaType === "video"
          ? "mp4"
          : "webp"
        : options.outputFormat);

    return {
      originalDataUrl: buildFallbackSvgDataUrl("Original", origW, origH, "#334155"),
      processedDataUrl: buildFallbackSvgDataUrl(
        outputPath ? "Output" : "Preview",
        outW,
        outH,
        "#2563eb"
      ),
      originalWidth: origW,
      originalHeight: origH,
      processedWidth: outW,
      processedHeight: outH,
      originalSize: origSize,
      processedSize: estSize,
      estimatedOutputSize: estSize,
      durationMs: mediaType === "video" ? 30_000 : undefined,
      previewTimeSec: previewTimeSec ?? 0,
      processedFormat: fmt,
    };
  }
  return invoke("generate_preview", {
    inputPath,
    mediaType,
    options,
    previewTimeSec,
    outputPath,
  });
}

// --- FFmpeg Setup & Capabilities ---
export async function checkFfmpegStatus(): Promise<FfmpegStatus> {
  if (!isTauriRuntime()) return { installed: false };
  return invoke<FfmpegStatus>("check_ffmpeg");
}

export async function downloadFfmpeg(): Promise<FfmpegStatus> {
  if (!isTauriRuntime()) return { installed: false };
  return invoke<FfmpegStatus>("download_ffmpeg");
}

export async function locateLocalFfmpeg(
  ffmpegPath: string,
  ffprobePath: string
): Promise<FfmpegStatus> {
  if (!isTauriRuntime()) return { installed: false };
  return invoke<FfmpegStatus>("locate_ffmpeg", { ffmpegPath, ffprobePath });
}

export async function getCapabilities(): Promise<Capabilities> {
  if (!isTauriRuntime()) return DEFAULT_CAPABILITIES;
  return invoke<Capabilities>("get_capabilities");
}

// --- History ---
export async function getHistory(): Promise<HistoryItem[]> {
  if (!isTauriRuntime()) return [];
  return invoke<HistoryItem[]>("get_history");
}

export async function removeHistoryItem(id: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("remove_history_item", { id });
}

export async function clearHistory(): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("clear_history");
}

// --- Settings & Presets ---
export async function getSettings(): Promise<AppSettings> {
  if (!isTauriRuntime()) return DEFAULT_SETTINGS;
  return invoke<AppSettings>("get_settings");
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("save_settings", { settings });
}

export async function getPresets(): Promise<Preset[]> {
  if (!isTauriRuntime()) return BUILT_IN_PRESETS;
  return invoke<Preset[]>("get_presets");
}

export async function savePreset(preset: Preset): Promise<Preset[]> {
  if (!isTauriRuntime()) return [...BUILT_IN_PRESETS, preset];
  return invoke<Preset[]>("save_preset", { preset });
}

export async function deletePreset(id: string): Promise<Preset[]> {
  if (!isTauriRuntime()) return BUILT_IN_PRESETS;
  return invoke<Preset[]>("delete_preset", { id });
}

export async function exportPresetsJson(): Promise<string> {
  if (!isTauriRuntime()) return JSON.stringify(BUILT_IN_PRESETS, null, 2);
  return invoke<string>("export_presets_json");
}

export async function importPresetsJson(json: string): Promise<Preset[]> {
  if (!isTauriRuntime()) {
    const raw = JSON.parse(json) as Preset | Preset[];
    const list = Array.isArray(raw) ? raw : [raw];
    return [
      ...BUILT_IN_PRESETS,
      ...list.map((p, idx) => ({
        ...p,
        id: p.id || `custom-${Date.now()}-${idx}`,
        builtIn: false,
      })),
    ];
  }
  return invoke<Preset[]>("import_presets_json", { json });
}

// --- Native Dialogs ---
export async function pickMediaFiles(mediaType: MediaType): Promise<string[]> {
  if (!isTauriRuntime()) return [];
  const selected = await openDialog({
    multiple: true,
    directory: false,
    filters: [
      {
        name:
          mediaType === "video"
            ? "Video Files"
            : mediaType === "image"
              ? "Image Files"
              : "Audio Files",
        extensions:
          mediaType === "video"
            ? VIDEO_EXTENSIONS
            : mediaType === "image"
              ? IMAGE_EXTENSIONS
              : AUDIO_EXTENSIONS,
      },
    ],
  });
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export async function pickFolder(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const selected = await openDialog({
    multiple: false,
    directory: true,
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickSingleFile(title: string, extensions?: string[]): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const selected = await openDialog({
    title,
    multiple: false,
    directory: false,
    filters: extensions ? [{ name: title, extensions }] : undefined,
  });
  return typeof selected === "string" ? selected : null;
}

export async function saveJsonFileDialog(defaultName: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  return saveDialog({
    defaultPath: defaultName,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
}

// --- Event Listeners ---
export async function onJobProgress(
  cb: (payload: JobProgressEvent) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<JobProgressEvent>("job-progress", (e) => cb(e.payload));
}

export async function onJobStatusChanged(
  cb: (payload: JobStatusChangedEvent) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<JobStatusChangedEvent>("job-status-changed", (e) => cb(e.payload));
}

export async function onFfmpegDownloadProgress(
  cb: (payload: FfmpegDownloadProgressEvent) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<FfmpegDownloadProgressEvent>("ffmpeg-download-progress", (e) => cb(e.payload));
}

export async function onFfmpegLog(
  cb: (payload: FfmpegLogEvent) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<FfmpegLogEvent>("ffmpeg-log", (e) => cb(e.payload));
}

export async function onNativeDragDrop(
  onEnter: () => void,
  onLeave: () => void,
  onDrop: (paths: string[]) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  const [unlistenEnter, unlistenOver, unlistenDrop, unlistenLeave] = await Promise.all([
    listen(TauriEvent.DRAG_ENTER, () => onEnter()),
    listen(TauriEvent.DRAG_OVER, () => onEnter()),
    listen<{ paths?: string[] }>(TauriEvent.DRAG_DROP, (event) => {
      onLeave();
      const paths = event.payload?.paths;
      if (Array.isArray(paths) && paths.length > 0) {
        onDrop(paths);
      }
    }),
    listen(TauriEvent.DRAG_LEAVE, () => onLeave()),
  ]);

  return () => {
    unlistenEnter();
    unlistenOver();
    unlistenDrop();
    unlistenLeave();
  };
}
