import { useEffect } from "react";
import * as tauri from "@/lib/tauri";
import { useJobStore } from "@/stores/jobStore";
import { useSettingsStore } from "@/stores/settingsStore";

export function useGlobalShortcuts() {
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingText =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      const mod = e.ctrlKey || e.metaKey;
      const store = useJobStore.getState();
      const settingsStore = useSettingsStore.getState();

      if (e.key === "Escape") {
        if (settingsStore.showShortcutsModal) {
          e.preventDefault();
          settingsStore.setShowShortcutsModal(false);
          return;
        }
      }

      if ((!isEditingText && !mod && e.key === "?") || e.key === "F1") {
        e.preventDefault();
        settingsStore.setShowShortcutsModal(!settingsStore.showShortcutsModal);
        return;
      }

      if (mod && e.key === "1") {
        e.preventDefault();
        store.setActiveTab("video");
        return;
      }
      if (mod && e.key === "2") {
        e.preventDefault();
        store.setActiveTab("image");
        return;
      }
      if (mod && e.key === "3") {
        e.preventDefault();
        store.setActiveTab("audio");
        return;
      }
      if (mod && e.key === "4") {
        e.preventDefault();
        store.setActiveTab("history");
        return;
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        settingsStore.setShowPreferencesModal(true);
        return;
      }

      if (store.activeTab === "history") return;
      const mediaType = store.activeTab;

      if (mod && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        const folder = await tauri.pickFolder();
        if (folder) await store.addFiles([folder], mediaType);
        return;
      }

      if (mod && !e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        const files = await tauri.pickMediaFiles(mediaType);
        if (files.length > 0) await store.addFiles(files, mediaType);
        return;
      }

      if (mod && e.key === "Enter") {
        e.preventDefault();
        await store.startCompress(mediaType);
        return;
      }

      if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        const jobs =
          mediaType === "video"
            ? store.videoJobs
            : mediaType === "image"
              ? store.imageJobs
              : store.audioJobs;
        const hasProcessing = jobs.some((j) => j.status === "processing");
        if (hasProcessing) {
          await store.pauseAll(mediaType);
        } else if (jobs.some((j) => j.status === "paused")) {
          await store.resumeAll(mediaType);
        }
        return;
      }

      if (!isEditingText && (e.key === "Delete" || e.key === "Backspace")) {
        if (store.selectedJobId) {
          const jobs =
          mediaType === "video"
            ? store.videoJobs
            : mediaType === "image"
              ? store.imageJobs
              : store.audioJobs;
          const selected = jobs.find((j) => j.id === store.selectedJobId);
          if (selected && selected.status !== "processing") {
            e.preventDefault();
            await store.removeJob(selected.id, mediaType);
          }
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
