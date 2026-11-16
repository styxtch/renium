import { create } from "zustand";
import * as tauri from "@/lib/tauri";
import {
  AUDIO_EXTENSIONS,
  DEFAULT_AUDIO_OPTIONS,
  DEFAULT_IMAGE_OPTIONS,
  DEFAULT_VIDEO_OPTIONS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "@/lib/utils";
import { useHistoryStore } from "@/stores/historyStore";
import type {
  ActiveTab,
  AudioOptions,
  ImageOptions,
  Job,
  MediaType,
  VideoOptions,
} from "@/types";

function jobsKey(mediaType: MediaType): "videoJobs" | "imageJobs" | "audioJobs" {
  if (mediaType === "video") return "videoJobs";
  if (mediaType === "image") return "imageJobs";
  return "audioJobs";
}

function getPathExtension(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export interface MismatchOffer {
  targetTab: MediaType;
  paths: string[];
}

interface JobState {
  activeTab: ActiveTab;
  videoJobs: Job[];
  imageJobs: Job[];
  audioJobs: Job[];
  selectedJobId: string | null;
  previewJobId: string | null;
  videoOptions: VideoOptions;
  imageOptions: ImageOptions;
  audioOptions: AudioOptions;
  activeVideoPresetId: string;
  activeImagePresetId: string;
  activeAudioPresetId: string;
  notice: string | null;
  noticeTone: "info" | "warning";
  mismatchOffer: MismatchOffer | null;
  uncheckedJobIds: Record<string, true>;

  setActiveTab: (tab: ActiveTab) => void;
  setSelectedJobId: (id: string | null) => void;
  setPreviewJobId: (id: string | null) => void;
  toggleJobChecked: (id: string) => void;
  setAllQueuedChecked: (mediaType: MediaType, checked: boolean) => void;
  clearNotice: () => void;
  switchAndAddMismatch: () => Promise<void>;
  initQueuesAndListeners: () => Promise<() => void>;
  updateVideoOptions: (patch: Partial<VideoOptions>, presetId?: string) => Promise<void>;
  updateImageOptions: (patch: Partial<ImageOptions>, presetId?: string) => Promise<void>;
  updateAudioOptions: (patch: Partial<AudioOptions>, presetId?: string) => Promise<void>;
  addFiles: (paths: string[], mediaType: MediaType) => Promise<void>;
  startCompress: (mediaType: MediaType) => Promise<void>;
  pauseJob: (id: string) => Promise<void>;
  resumeJob: (id: string) => Promise<void>;
  cancelJob: (id: string) => Promise<void>;
  pauseAll: (mediaType: MediaType) => Promise<void>;
  resumeAll: (mediaType: MediaType) => Promise<void>;
  cancelAll: (mediaType: MediaType) => Promise<void>;
  removeJob: (id: string, mediaType: MediaType) => Promise<void>;
  clearCompleted: (mediaType: MediaType) => Promise<void>;
  reorderQueue: (mediaType: MediaType, fromIndex: number, toIndex: number) => Promise<void>;
  moveJob: (id: string, direction: "up" | "down", mediaType: MediaType) => Promise<void>;
  retryJob: (id: string) => Promise<void>;
  keepOriginal: (id: string, mediaType: MediaType) => Promise<void>;
}

export const useJobStore = create<JobState>((set, get) => ({
  activeTab: "video",
  videoJobs: [],
  imageJobs: [],
  audioJobs: [],
  selectedJobId: null,
  previewJobId: null,
  videoOptions: { ...DEFAULT_VIDEO_OPTIONS },
  imageOptions: { ...DEFAULT_IMAGE_OPTIONS },
  audioOptions: { ...DEFAULT_AUDIO_OPTIONS },
  activeVideoPresetId: "builtin-video-web-balanced",
  activeImagePresetId: "builtin-image-keep-original",
  activeAudioPresetId: "builtin-audio-mp3-balanced",
  notice: null,
  noticeTone: "info",
  mismatchOffer: null,
  uncheckedJobIds: {},

  setActiveTab: (activeTab) =>
    set({
      activeTab,
      selectedJobId: null,
      previewJobId: null,
      notice: null,
      mismatchOffer: null,
    }),
  setSelectedJobId: (selectedJobId) => set({ selectedJobId }),
  setPreviewJobId: (previewJobId) => set({ previewJobId }),
  toggleJobChecked: (id) =>
    set((state) => {
      const next = { ...state.uncheckedJobIds };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = true;
      }
      return { uncheckedJobIds: next };
    }),
  setAllQueuedChecked: (mediaType, checked) =>
    set((state) => {
      const jobs = state[jobsKey(mediaType)];
      const next = { ...state.uncheckedJobIds };
      for (const job of jobs) {
        if (job.status === "queued") {
          if (checked) {
            delete next[job.id];
          } else {
            next[job.id] = true;
          }
        }
      }
      return { uncheckedJobIds: next };
    }),
  clearNotice: () => set({ notice: null, noticeTone: "info", mismatchOffer: null }),

  switchAndAddMismatch: async () => {
    const offer = get().mismatchOffer;
    if (!offer) return;
    set({
      activeTab: offer.targetTab,
      selectedJobId: null,
      notice: null,
      noticeTone: "info",
      mismatchOffer: null,
    });
    await get().addFiles(offer.paths, offer.targetTab);
  },

  initQueuesAndListeners: async () => {
    const [videoJobs, imageJobs, audioJobs] = await Promise.all([
      tauri.getJobs("video"),
      tauri.getJobs("image"),
      tauri.getJobs("audio"),
    ]);
    set({ videoJobs, imageJobs, audioJobs });

    const unlistenProgress = await tauri.onJobProgress((ev) => {
      const key = jobsKey(ev.type);
      set((state) => ({
        [key]: state[key].map((j) =>
          j.id === ev.id ? { ...j, progress: ev.progress, etaSeconds: ev.etaSeconds } : j
        ),
      }));
    });

    const unlistenStatus = await tauri.onJobStatusChanged((ev) => {
      const key = jobsKey(ev.type);
      set((state) => ({
        [key]: state[key].map((j) =>
          j.id === ev.id
            ? {
                ...j,
                status: ev.status,
                progress: ev.status === "completed" ? 100 : ev.status === "queued" ? 0 : j.progress,
                outputPath: ev.outputPath ?? j.outputPath,
                outputSize: ev.outputSize ?? j.outputSize,
                sizeLargerWarning: ev.sizeLargerWarning ?? j.sizeLargerWarning,
                error: ev.status === "queued" ? undefined : ev.error ?? j.error,
                finishedAt: ev.finishedAt ?? j.finishedAt,
              }
            : j
        ),
      }));

      if (ev.status === "completed" || ev.status === "failed") {
        void useHistoryStore.getState().fetchHistory();
      }
    });

    return () => {
      unlistenProgress();
      unlistenStatus();
    };
  },

  updateVideoOptions: async (patch, presetId) => {
    const next = { ...get().videoOptions, ...patch };
    set({
      videoOptions: next,
      activeVideoPresetId: presetId ?? "custom",
      videoJobs: get().videoJobs.map((j) =>
        j.status === "queued" ? { ...j, options: next } : j
      ),
    });
    await tauri.updateQueuedJobsOptions("video", next);
  },

  updateImageOptions: async (patch, presetId) => {
    const next = { ...get().imageOptions, ...patch };
    set({
      imageOptions: next,
      activeImagePresetId: presetId ?? "custom",
      imageJobs: get().imageJobs.map((j) =>
        j.status === "queued" ? { ...j, options: next } : j
      ),
    });
    await tauri.updateQueuedJobsOptions("image", next);
  },

  updateAudioOptions: async (patch, presetId) => {
    const next = { ...get().audioOptions, ...patch };
    set({
      audioOptions: next,
      activeAudioPresetId: presetId ?? "custom",
      audioJobs: get().audioJobs.map((j) =>
        j.status === "queued" ? { ...j, options: next } : j
      ),
    });
    await tauri.updateQueuedJobsOptions("audio", next);
  },

  addFiles: async (paths, mediaType) => {
    if (paths.length === 0) return;
    const options =
      mediaType === "video"
        ? get().videoOptions
        : mediaType === "image"
          ? get().imageOptions
          : get().audioOptions;

    const videoSet = new Set(VIDEO_EXTENSIONS);
    const imageSet = new Set(IMAGE_EXTENSIONS);
    const audioSet = new Set(AUDIO_EXTENSIONS);
    const otherPaths = paths.filter((p) => {
      const ext = getPathExtension(p);
      if (mediaType === "video") return imageSet.has(ext) || audioSet.has(ext);
      if (mediaType === "image") return videoSet.has(ext) || audioSet.has(ext);
      return videoSet.has(ext) || imageSet.has(ext);
    });
    const detectTargetTab = (sample: string[]): MediaType => {
      const ext = getPathExtension(sample[0] ?? "");
      if (videoSet.has(ext)) return "video";
      if (audioSet.has(ext)) return "audio";
      return "image";
    };

    try {
      const added = await tauri.addJobs(paths, mediaType, options);

      if (added.length === 0) {
        if (otherPaths.length > 0) {
          const targetTab = detectTargetTab(otherPaths);
          const tabLabel =
            targetTab === "video" ? "Video" : targetTab === "image" ? "Image" : "Audio";
          const currentLabel =
            mediaType === "video" ? "Video" : mediaType === "image" ? "Image" : "Audio";
          set({
            noticeTone: "warning",
            mismatchOffer: { targetTab, paths: otherPaths },
            notice: `Peringatan: File tersebut tidak dapat dimasukkan ke tab ${currentLabel}. Gunakan tab ${tabLabel} untuk memproses file ini.`,
          });
          return;
        }
        set({
          noticeTone: "warning",
          mismatchOffer: null,
          notice:
            mediaType === "video"
              ? "Format file tidak didukung di tab Video (mendukung MP4, MKV, MOV, AVI, WebM, FLV, TS, M4V, WMV, 3GP)."
              : mediaType === "image"
                ? "Format file tidak didukung di tab Image (mendukung JPG, PNG, WebP, AVIF, GIF, BMP, TIFF)."
                : "Format file tidak didukung di tab Audio (mendukung MP3, WAV, FLAC, M4A, AAC, OGG, OPUS, WMA, AIFF).",
        });
        return;
      }

      const key = jobsKey(mediaType);
      if (otherPaths.length > 0) {
        const targetTab = detectTargetTab(otherPaths);
        set((state) => ({
          [key]: [...state[key], ...added],
          noticeTone: "warning",
          mismatchOffer: { targetTab, paths: otherPaths },
          notice: `${added.length} file ditambahkan, tetapi ${otherPaths.length} file dilewati karena tipe media berbeda.`,
        }));
      } else {
        set((state) => ({
          [key]: [...state[key], ...added],
          notice: null,
          noticeTone: "info",
          mismatchOffer: null,
        }));
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message: string }).message)
            : String(err);
      set({
        noticeTone: "warning",
        mismatchOffer: null,
        notice: msg,
      });
    }
  },

  startCompress: async (mediaType) => {
    const jobs = get()[jobsKey(mediaType)];
    const queuedJobs = jobs.filter((j) => j.status === "queued");
    const unchecked = get().uncheckedJobIds;
    const selectedIds = queuedJobs
      .filter((j) => !unchecked[j.id])
      .map((j) => j.id);
    if (selectedIds.length === 0) return;

    try {
      if (selectedIds.length === queuedJobs.length) {
        await tauri.startQueue(mediaType);
      } else {
        await tauri.startQueue(mediaType, selectedIds);
      }
      set({ notice: null, noticeTone: "info", mismatchOffer: null });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message: string }).message)
            : String(err);
      set({ notice: msg, noticeTone: "warning", mismatchOffer: null });
    }
  },

  pauseJob: async (id) => {
    await tauri.pauseJob(id);
  },

  resumeJob: async (id) => {
    await tauri.resumeJob(id);
  },

  cancelJob: async (id) => {
    await tauri.cancelJob(id);
  },

  pauseAll: async (mediaType) => {
    await tauri.pauseAllJobs(mediaType);
  },

  resumeAll: async (mediaType) => {
    await tauri.resumeAllJobs(mediaType);
  },

  cancelAll: async (mediaType) => {
    await tauri.cancelAllJobs(mediaType);
  },

  removeJob: async (id, mediaType) => {
    await tauri.removeJob(id);
    const key = jobsKey(mediaType);
    set((state) => ({
      [key]: state[key].filter((j) => j.id !== id),
      selectedJobId: state.selectedJobId === id ? null : state.selectedJobId,
    }));
  },

  clearCompleted: async (mediaType) => {
    await tauri.clearCompletedJobs(mediaType);
    const key = jobsKey(mediaType);
    set((state) => ({
      [key]: state[key].filter(
        (j) => !["completed", "failed", "cancelled"].includes(j.status)
      ),
    }));
  },

  reorderQueue: async (mediaType, fromIndex, toIndex) => {
    const key = jobsKey(mediaType);
    const list = get()[key];
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= list.length ||
      toIndex >= list.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    set({ [key]: next });
    await tauri.reorderJobs(
      mediaType,
      next.map((j) => j.id)
    );
  },

  moveJob: async (id, direction, mediaType) => {
    const key = jobsKey(mediaType);
    const list = get()[key];
    const idx = list.findIndex((j) => j.id === id);
    if (idx === -1) return;
    const isFinished = (status: Job["status"]) =>
      status === "completed" || status === "failed" || status === "cancelled";
    let targetIdx = -1;
    if (direction === "up") {
      for (let i = idx - 1; i >= 0; i -= 1) {
        if (!isFinished(list[i].status)) {
          targetIdx = i;
          break;
        }
      }
    } else {
      for (let i = idx + 1; i < list.length; i += 1) {
        if (!isFinished(list[i].status)) {
          targetIdx = i;
          break;
        }
      }
    }
    if (targetIdx === -1) return;
    await get().reorderQueue(mediaType, idx, targetIdx);
  },

  retryJob: async (id) => {
    await tauri.retryJob(id);
  },

  keepOriginal: async (id, mediaType) => {
    await tauri.keepOriginal(id);
    const key = jobsKey(mediaType);
    set((state) => ({
      [key]: state[key].map((j) =>
        j.id === id
          ? {
              ...j,
              outputPath: undefined,
              outputSize: undefined,
              sizeLargerWarning: false,
            }
          : j
      ),
    }));
  },
}));
