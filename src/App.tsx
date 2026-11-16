import { useEffect } from "react";
import { FfmpegSetupModal } from "@/components/layout/FfmpegSetupModal";
import { ShortcutsModal } from "@/components/layout/ShortcutsModal";
import { TopNav } from "@/components/layout/TopNav";
import { MediaPreviewModal } from "@/components/preview/MediaPreviewModal";
import { AppPreferencesModal } from "@/components/settings/AppPreferencesModal";
import { PresetManagerModal } from "@/components/settings/PresetManagerModal";
import { useGlobalShortcuts } from "@/lib/shortcuts";
import { useHistoryStore } from "@/stores/historyStore";
import { useJobStore } from "@/stores/jobStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { applyThemeToDom, useThemeStore } from "@/stores/themeStore";
import { AudioView } from "@/views/AudioView";
import { HistoryView } from "@/views/HistoryView";
import { ImageView } from "@/views/ImageView";
import { VideoView } from "@/views/VideoView";

export function App() {
  const { activeTab } = useJobStore();
  const { theme, themeStyle } = useThemeStore();

  useGlobalShortcuts();

  useEffect(() => {
    applyThemeToDom(theme, themeStyle);
  }, [theme, themeStyle]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    void useSettingsStore.getState().initSettingsAndFfmpeg();
    void useHistoryStore.getState().fetchHistory();
    void useJobStore
      .getState()
      .initQueuesAndListeners()
      .then((fn) => {
        cleanup = fn;
      });

    return () => {
      cleanup?.();
    };
  }, []);

  return (
    <div className="h-screen w-screen flex bg-app text-primary overflow-hidden p-3 gap-3">
      <TopNav />

      <main className="flex-1 min-w-0 min-h-0 flex flex-col p-3 -m-3 overflow-hidden">
        {activeTab === "video" && <VideoView />}
        {activeTab === "image" && <ImageView />}
        {activeTab === "audio" && <AudioView />}
        {activeTab === "history" && <HistoryView />}
      </main>

      <FfmpegSetupModal />
      <PresetManagerModal />
      <AppPreferencesModal />
      <ShortcutsModal />
      <MediaPreviewModal />
    </div>
  );
}

export default App;
