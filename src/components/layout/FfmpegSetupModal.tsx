import { useState } from "react";
import { Download, FolderSearch, ShieldCheck, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button, FieldLabel, Input } from "@/components/ui/Primitives";
import * as tauri from "@/lib/tauri";
import { formatBytes } from "@/lib/utils";
import { useJobStore } from "@/stores/jobStore";
import { useSettingsStore } from "@/stores/settingsStore";

export function FfmpegSetupModal() {
  const {
    showFfmpegModal,
    setShowFfmpegModal,
    ffmpegStatus,
    ffmpegDownloading,
    ffmpegDownloadProgress,
    ffmpegError,
    startDownloadFfmpeg,
    locateFfmpegBinaries,
  } = useSettingsStore();

  const { setActiveTab } = useJobStore();
  const [showManual, setShowManual] = useState(false);
  const [ffmpegPath, setFfmpegPath] = useState(ffmpegStatus.ffmpegPath ?? "");
  const [ffprobePath, setFfprobePath] = useState(ffmpegStatus.ffprobePath ?? "");

  if (!showFfmpegModal) return null;

  const progressPct =
    ffmpegDownloadProgress && ffmpegDownloadProgress.totalBytes > 0
      ? Math.min(
          100,
          Math.round(
            (ffmpegDownloadProgress.downloadedBytes /
              ffmpegDownloadProgress.totalBytes) *
              100
          )
        )
      : 0;

  const handleBrowseBinary = async (kind: "ffmpeg" | "ffprobe") => {
    const picked = await tauri.pickSingleFile(
      kind === "ffmpeg" ? "Select ffmpeg executable" : "Select ffprobe executable"
    );
    if (!picked) return;
    if (kind === "ffmpeg") setFfmpegPath(picked);
    else setFfprobePath(picked);
  };

  const handleUseImageOnly = () => {
    setShowFfmpegModal(false);
    setActiveTab("image");
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ffmpeg-setup-title"
    >
      <div className="w-full max-w-lg rounded-lg bg-surface border border-border-strong shadow-soft p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 id="ffmpeg-setup-title" className="text-lg font-semibold text-primary">
              {ffmpegStatus.installed ? "Video Engine Configured" : "Video Engine Required"}
            </h2>
            <p className="text-sm text-secondary">
              Renium keeps its installer under 20 MB by downloading official FFmpeg &amp; FFprobe
              binaries once. After setup, all media processing runs 100% locally offline.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowFfmpegModal(false)}
            aria-label="Close setup modal"
            className="text-muted hover:text-primary p-1 rounded-sm"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {ffmpegStatus.installed && (
          <div className="rounded-md bg-success/10 border border-success/30 p-3 text-sm text-success flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <div className="font-medium">FFmpeg &amp; FFprobe Ready ({ffmpegStatus.source})</div>
              <div className="text-xs font-mono opacity-90 break-all">
                {ffmpegStatus.version}
              </div>
            </div>
          </div>
        )}

        {ffmpegError && (
          <div className="rounded-md bg-error/10 border border-error/30 p-3 text-xs text-error flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{ffmpegError}</span>
          </div>
        )}

        {ffmpegDownloading && (
          <div className="rounded-md bg-elevated border border-border p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-primary capitalize">
                {ffmpegDownloadProgress?.stage ?? "Starting download"}…
              </span>
              <span className="font-mono text-secondary">
                {ffmpegDownloadProgress && ffmpegDownloadProgress.totalBytes > 0
                  ? `${formatBytes(ffmpegDownloadProgress.downloadedBytes)} / ${formatBytes(
                      ffmpegDownloadProgress.totalBytes
                    )} (${progressPct}%)`
                  : ffmpegDownloadProgress?.downloadedBytes
                    ? formatBytes(ffmpegDownloadProgress.downloadedBytes)
                    : "Connecting…"}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-input overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-150"
                style={{ width: `${progressPct || 15}%` }}
              />
            </div>
            {ffmpegDownloadProgress?.sha256 && (
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted break-all">
                <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
                <span>SHA-256: {ffmpegDownloadProgress.sha256}</span>
              </div>
            )}
          </div>
        )}

        {showManual && (
          <div className="rounded-md bg-elevated/60 border border-border p-4 space-y-3">
            <div>
              <FieldLabel htmlFor="manual-ffmpeg">FFmpeg Executable Path</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="manual-ffmpeg"
                  value={ffmpegPath}
                  onChange={(e) => setFfmpegPath(e.target.value)}
                  placeholder="C:\ffmpeg\bin\ffmpeg.exe"
                  className="font-mono text-xs"
                />
                <Button size="sm" onClick={() => void handleBrowseBinary("ffmpeg")}>
                  Browse
                </Button>
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="manual-ffprobe">FFprobe Executable Path</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="manual-ffprobe"
                  value={ffprobePath}
                  onChange={(e) => setFfprobePath(e.target.value)}
                  placeholder="C:\ffmpeg\bin\ffprobe.exe"
                  className="font-mono text-xs"
                />
                <Button size="sm" onClick={() => void handleBrowseBinary("ffprobe")}>
                  Browse
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                disabled={!ffmpegPath.trim() || !ffprobePath.trim()}
                onClick={() => void locateFfmpegBinaries(ffmpegPath, ffprobePath)}
              >
                Verify &amp; Save Binaries
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowManual((v) => !v)}
              disabled={ffmpegDownloading}
            >
              <FolderSearch className="h-4 w-4" />
              <span>Locate Local FFmpeg Binary</span>
            </Button>
            {!ffmpegStatus.installed && (
              <Button variant="ghost" size="sm" onClick={handleUseImageOnly}>
                Use Image Mode Only
              </Button>
            )}
          </div>

          <Button
            variant="primary"
            onClick={() => void startDownloadFfmpeg()}
            disabled={ffmpegDownloading}
          >
            <Download className="h-4 w-4" />
            <span>
              {ffmpegDownloading
                ? "Downloading…"
                : ffmpegStatus.installed
                  ? "Re-download Engine"
                  : "Download Video Engine"}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
