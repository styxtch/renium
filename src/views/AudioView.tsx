import { AlertTriangle, X } from "lucide-react";
import { DropZone } from "@/components/queue/DropZone";
import { JobList } from "@/components/queue/JobList";
import { AudioSettingsPanel } from "@/components/settings/AudioSettingsPanel";
import { Button } from "@/components/ui/Primitives";
import { useJobStore } from "@/stores/jobStore";
import { useSettingsStore } from "@/stores/settingsStore";

export function AudioView() {
  const {
    audioJobs,
    notice,
    noticeTone,
    mismatchOffer,
    clearNotice,
    switchAndAddMismatch,
  } = useJobStore();
  const { ffmpegStatus, ffmpegChecked, setShowFfmpegModal } = useSettingsStore();
  const hasJobs = audioJobs.length > 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {ffmpegChecked && !ffmpegStatus.installed && (
        <div className="rounded-md bg-warning/10 border border-warning/30 px-3.5 py-2.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              FFmpeg &amp; FFprobe engine is required to compress or convert audio. Image mode works
              without it.
            </span>
          </div>
          <Button size="sm" variant="primary" onClick={() => setShowFfmpegModal(true)}>
            Setup Engine
          </Button>
        </div>
      )}

      {notice && (
        <div
          role={noticeTone === "warning" ? "alert" : "status"}
          className={
            noticeTone === "warning"
              ? "rounded-md bg-warning/10 border border-warning/30 px-3.5 py-2 flex items-center justify-between gap-3 text-xs text-warning shrink-0"
              : "rounded-md bg-info/10 border border-info/30 px-3.5 py-2 flex items-center justify-between gap-3 text-xs text-info shrink-0"
          }
        >
          <div className="flex items-center gap-2 min-w-0">
            {noticeTone === "warning" && (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{notice}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {mismatchOffer && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void switchAndAddMismatch()}
              >
                {mismatchOffer.targetTab === "video"
                  ? "Switch to Video Tab"
                  : mismatchOffer.targetTab === "audio"
                    ? "Switch to Audio Tab"
                    : "Switch to Image Tab"}
              </Button>
            )}
            <button type="button" onClick={clearNotice} aria-label="Dismiss notice">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {!hasJobs ? (
        <DropZone mediaType="audio" fullHeight />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
          <div className="w-full lg:flex-1 min-w-0 min-h-0 flex flex-col gap-3">
            <DropZone mediaType="audio" fullHeight={false} />
            <JobList mediaType="audio" />
          </div>

          <AudioSettingsPanel />
        </div>
      )}
    </div>
  );
}
