import { create } from "zustand";
import { BUILT_IN_PRESETS } from "@/lib/utils";
import * as tauri from "@/lib/tauri";
import type {
  AppSettings,
  Capabilities,
  FfmpegDownloadProgressEvent,
  FfmpegStatus,
  Preset,
} from "@/types";

interface SettingsState {
  settings: AppSettings;
  presets: Preset[];
  capabilities: Capabilities;
  ffmpegStatus: FfmpegStatus;
  ffmpegChecked: boolean;
  ffmpegDownloading: boolean;
  ffmpegDownloadProgress: FfmpegDownloadProgressEvent | null;
  ffmpegError: string | null;
  showFfmpegModal: boolean;
  showPreferencesModal: boolean;
  showPresetModal: boolean;
  showShortcutsModal: boolean;

  setShowFfmpegModal: (open: boolean) => void;
  setShowPreferencesModal: (open: boolean) => void;
  setShowPresetModal: (open: boolean) => void;
  setShowShortcutsModal: (open: boolean) => void;
  initSettingsAndFfmpeg: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  startDownloadFfmpeg: () => Promise<void>;
  locateFfmpegBinaries: (ffmpegPath: string, ffprobePath: string) => Promise<void>;
  saveCustomPreset: (preset: Preset) => Promise<void>;
  removeCustomPreset: (id: string) => Promise<void>;
  importPresets: (json: string) => Promise<void>;
  exportPresets: () => Promise<string>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    hwAccel: true,
    maxConcurrentVideoJobs: 1,
    maxConcurrentImageJobs: 4,
    maxConcurrentAudioJobs: 2,
    checkUpdates: false,
    autoClearCompleted: false,
  },
  presets: BUILT_IN_PRESETS,
  capabilities: {
    platform: "desktop",
    cpuCores: 4,
    hwEncoders: [],
    hasNvenc: false,
    hasQsv: false,
    hasAmf: false,
    hasVideotoolbox: false,
    hasVaapi: false,
  },
  ffmpegStatus: { installed: false },
  ffmpegChecked: false,
  ffmpegDownloading: false,
  ffmpegDownloadProgress: null,
  ffmpegError: null,
  showFfmpegModal: false,
  showPreferencesModal: false,
  showPresetModal: false,
  showShortcutsModal: false,

  setShowFfmpegModal: (open) => set({ showFfmpegModal: open }),
  setShowPreferencesModal: (open) => set({ showPreferencesModal: open }),
  setShowPresetModal: (open) => set({ showPresetModal: open }),
  setShowShortcutsModal: (open) => set({ showShortcutsModal: open }),

  initSettingsAndFfmpeg: async () => {
    const [settings, presets, ffmpegStatus, capabilities] = await Promise.all([
      tauri.getSettings(),
      tauri.getPresets(),
      tauri.checkFfmpegStatus(),
      tauri.getCapabilities(),
    ]);

    set({
      settings,
      presets,
      ffmpegStatus,
      capabilities,
      ffmpegChecked: true,
      showFfmpegModal: !ffmpegStatus.installed,
    });
  },

  updateSettings: async (partial) => {
    const updated = { ...get().settings, ...partial };
    set({ settings: updated });
    await tauri.saveSettings(updated);
  },

  startDownloadFfmpeg: async () => {
    set({ ffmpegDownloading: true, ffmpegError: null, ffmpegDownloadProgress: null });
    const unlisten = await tauri.onFfmpegDownloadProgress((ev) => {
      set({ ffmpegDownloadProgress: ev });
    });
    try {
      const status = await tauri.downloadFfmpeg();
      const capabilities = await tauri.getCapabilities();
      set({
        ffmpegStatus: status,
        capabilities,
        ffmpegDownloading: false,
        showFfmpegModal: !status.installed,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: string }).message) : String(err);
      set({ ffmpegDownloading: false, ffmpegError: msg });
    } finally {
      unlisten();
    }
  },

  locateFfmpegBinaries: async (ffmpegPath, ffprobePath) => {
    set({ ffmpegError: null });
    try {
      const status = await tauri.locateLocalFfmpeg(ffmpegPath, ffprobePath);
      const capabilities = await tauri.getCapabilities();
      set({
        ffmpegStatus: status,
        capabilities,
        showFfmpegModal: !status.installed,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: string }).message) : String(err);
      set({ ffmpegError: msg });
    }
  },

  saveCustomPreset: async (preset) => {
    const updated = await tauri.savePreset(preset);
    set({ presets: updated });
  },

  removeCustomPreset: async (id) => {
    const updated = await tauri.deletePreset(id);
    set({ presets: updated });
  },

  importPresets: async (json) => {
    const updated = await tauri.importPresetsJson(json);
    set({ presets: updated });
  },

  exportPresets: async () => {
    return tauri.exportPresetsJson();
  },
}));
