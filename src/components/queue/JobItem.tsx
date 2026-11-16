import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Film,
  FolderOpen,
  GripVertical,
  Image as ImageIcon,
  Music,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { ProgressBar } from "@/components/queue/ProgressBar";
import { Badge, Button } from "@/components/ui/Primitives";
import * as tauri from "@/lib/tauri";
import {
  calcSavingsPercent,
  cn,
  formatBytes,
  formatDuration,
} from "@/lib/utils";
import { useJobStore } from "@/stores/jobStore";
import type { Job } from "@/types";

export interface JobItemProps {
  job: Job;
  index: number;
  total: number;
  isDragging?: boolean;
  onDragStartHandle?: (index: number) => void;
  onDragEnterRow?: (index: number) => void;
}

export function JobItem({
  job,
  index,
  total,
  isDragging,
  onDragStartHandle,
  onDragEnterRow,
}: JobItemProps) {
  const {
    selectedJobId,
    setSelectedJobId,
    setPreviewJobId,
    pauseJob,
    resumeJob,
    cancelJob,
    removeJob,
    retryJob,
    keepOriginal,
    moveJob,
    uncheckedJobIds,
    toggleJobChecked,
  } = useJobStore();

  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  const isSelected = selectedJobId === job.id;
  const isChecked = job.status !== "queued" || !uncheckedJobIds[job.id];
  const savings = calcSavingsPercent(job.originalSize, job.outputSize);
  const isLarger =
    job.status === "completed" &&
    job.outputSize != null &&
    (job.sizeLargerWarning || job.outputSize >= job.originalSize);

  const thumbSrc =
    job.type === "image" && tauri.isTauriRuntime()
      ? convertFileSrc(
          job.status === "completed" && job.outputPath ? job.outputPath : job.inputPath
        )
      : null;

  const isAudioOutput =
    job.type === "audio" ||
    (job.type === "video" &&
      "outputFormat" in job.options &&
      (job.options.outputFormat === "mp3" || job.options.outputFormat === "aac"));

  const fileIcon =
    isAudioOutput ? (
      <Music className="h-3.5 w-3.5" />
    ) : job.type === "video" ? (
      <Film className="h-3.5 w-3.5" />
    ) : (
      <ImageIcon className="h-3.5 w-3.5" />
    );

  const rawExt = (job.fileName.split(".").pop() ?? "").toLowerCase();
  const extLabel = (rawExt || job.type).slice(0, 4).toUpperCase();
  const extTone = (() => {
    if (isAudioOutput) return "bg-info/10 border-info/30 text-info";
    if (job.type === "video") return "bg-accent/10 border-accent/30 text-accent";
    if (rawExt === "png") return "bg-warning/10 border-warning/30 text-warning";
    if (rawExt === "webp" || rawExt === "avif") return "bg-success/10 border-success/30 text-success";
    return "bg-accent/10 border-accent/30 text-accent";
  })();

  const statusBadge = () => {
    switch (job.status) {
      case "queued":
        return <Badge tone="info">Queued</Badge>;
      case "processing":
        return (
          <Badge tone="accent" className="animate-pulse">
            Processing…
          </Badge>
        );
      case "paused":
        return <Badge tone="warning">Paused</Badge>;
      case "completed":
        return (
          <Badge tone="success">
            <CheckCircle2 className="h-3 w-3" />
            Done
          </Badge>
        );
      case "failed":
        return (
          <Badge tone="error">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      case "cancelled":
        return <Badge tone="neutral">Cancelled</Badge>;
    }
  };

  const handleCopyPath = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!job.outputPath) return;
    try {
      await navigator.clipboard.writeText(job.outputPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard fallback ignored if restricted
    }
  };

  const targetSummary = (() => {
    const extras: string[] = [];
    if (
      "cropWidth" in job.options &&
      job.options.cropWidth != null &&
      job.options.cropHeight != null
    ) {
      extras.push(`Crop ${job.options.cropWidth}×${job.options.cropHeight}`);
    }
    if (
      job.type === "video" &&
      "videoCodec" in job.options &&
      (job.options.trimStartSec != null || job.options.trimEndSec != null)
    ) {
      const start = Number(job.options.trimStartSec ?? 0).toFixed(1);
      const end =
        job.options.trimEndSec != null
          ? `${Number(job.options.trimEndSec).toFixed(1)}s`
          : "end";
      extras.push(`Trim ${start}s–${end}`);
    }
    const extraSuffix = extras.length > 0 ? ` • ${extras.join(" • ")}` : "";

    if (job.type === "image" && "outputFormat" in job.options) {
      const fmt = job.options.outputFormat;
      if (fmt === "original") {
        const ext = job.fileName.split(".").pop()?.toUpperCase();
        return `${ext ? `→ ${ext} (Compress)` : "→ Keep Original"}${extraSuffix}`;
      }
      return `→ ${fmt.toUpperCase()}${extraSuffix}`;
    }
    if (job.type === "video" && "videoCodec" in job.options) {
      if (job.options.subtitleMode === "extract-srt") return `→ Extract SRT${extraSuffix}`;
      const fmt = job.options.outputFormat.toUpperCase();
      if (fmt === "MP3" || fmt === "AAC") return `→ ${fmt} Audio${extraSuffix}`;
      if (fmt === "GIF") return `→ GIF${extraSuffix}`;
      return `→ ${fmt} (${job.options.videoCodec.toUpperCase()})${extraSuffix}`;
    }
    if (job.type === "audio" && "bitrateKbps" in job.options) {
      const fmt =
        job.options.outputFormat === "original"
          ? rawExt
            ? `${rawExt.toUpperCase()} (Compress)`
            : "Keep Original"
          : job.options.outputFormat.toUpperCase();
      return `→ ${fmt} • ${job.options.bitrateKbps} kbps${extraSuffix}`;
    }
    return extras.length > 0 ? extras.join(" • ") : null;
  })();

  const metaParts: string[] = [];
  if (job.probeInfo?.width && job.probeInfo?.height) {
    metaParts.push(`${job.probeInfo.width}×${job.probeInfo.height}`);
  }
  if (job.probeInfo?.durationMs) {
    metaParts.push(formatDuration(job.probeInfo.durationMs));
  }
  const sourceFormatLabel = rawExt ? rawExt.toUpperCase() : "";
  metaParts.push(
    sourceFormatLabel
      ? `${formatBytes(job.originalSize)} (${sourceFormatLabel})`
      : formatBytes(job.originalSize)
  );
  if (targetSummary && job.status !== "completed") {
    metaParts.push(targetSummary);
  }

  const isFinished =
    job.status === "completed" || job.status === "failed" || job.status === "cancelled";
  const showReorder = !isFinished && total > 1;

  return (
    <div
      role="listitem"
      tabIndex={0}
      onClick={() => setSelectedJobId(job.id)}
      onMouseEnter={() => onDragEnterRow?.(index)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setSelectedJobId(job.id);
      }}
      className={cn(
        "rounded-md border p-3 transition-colors duration-150 space-y-2 neu-card-item",
        job.status === "queued" && !isChecked && "opacity-60",
        isDragging
          ? "border-accent bg-elevated/60 ring-2 ring-accent/40"
          : isSelected
            ? "border-accent bg-elevated/40"
            : job.status === "completed"
              ? isLarger
                ? "border-warning/30 bg-warning/[0.06] hover:border-warning/50"
                : "border-success/25 bg-success/[0.06] hover:border-success/45"
              : job.status === "failed"
                ? "border-error/30 bg-error/[0.06] hover:border-error/50"
                : "bg-surface border-border hover:border-border-strong"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {job.status === "queued" && (
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => toggleJobChecked(job.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${job.fileName}`}
              title={isChecked ? "Include in batch" : "Skip this file"}
              className="mt-3 h-4 w-4 rounded border-border accent-accent cursor-pointer shrink-0"
            />
          )}
          {showReorder && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDragStartHandle?.(index);
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Drag to reorder ${job.fileName}`}
              title="Drag to reorder"
              className="mt-2 text-muted hover:text-primary cursor-grab active:cursor-grabbing p-0.5 rounded-sm shrink-0"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          {thumbSrc && !thumbFailed ? (
            <img
              src={thumbSrc}
              alt={job.fileName}
              onError={() => setThumbFailed(true)}
              className="mt-0.5 h-10 w-10 rounded-sm object-cover border border-border shrink-0 bg-elevated"
            />
          ) : (
            <div
              className={cn(
                "mt-0.5 h-10 w-10 rounded-sm border flex flex-col items-center justify-center shrink-0 gap-0.5",
                extTone
              )}
              title={extLabel}
            >
              {fileIcon}
              <span className="text-[8px] font-bold leading-none tracking-wide">{extLabel}</span>
            </div>
          )}
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-primary truncate" title={job.inputPath}>
                {job.fileName}
              </span>
              {statusBadge()}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-muted">
              <span>{metaParts.join(" • ")}</span>
              {job.status === "completed" && job.outputSize != null && (
                <>
                  <span>→</span>
                  <span className="text-primary font-medium">
                    {formatBytes(job.outputSize)}
                  </span>
                  {isLarger ? (
                    <Badge tone="warning" className="text-[11px]">
                      <AlertTriangle className="h-3 w-3" />
                      +{Math.abs(savings)}% Larger
                    </Badge>
                  ) : (
                    <Badge tone="success" className="text-[11px]">
                      Saved {savings}%
                    </Badge>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {job.type !== "audio" &&
            (!isFinished || (job.status === "completed" && Boolean(job.outputPath))) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedJobId(job.id);
                setPreviewJobId(job.id);
              }}
              aria-label={isFinished ? `Compare ${job.fileName}` : `Preview ${job.fileName}`}
              title={isFinished ? "Compare Original vs Output" : "Visual Preview, Crop & Trim"}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          )}
          {showReorder && (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={index === 0}
                onClick={() => void moveJob(job.id, "up", job.type)}
                aria-label={`Move ${job.fileName} up`}
                title="Move up"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={index === total - 1}
                onClick={() => void moveJob(job.id, "down", job.type)}
                aria-label={`Move ${job.fileName} down`}
                title="Move down"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {job.status === "queued" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void removeJob(job.id, job.type)}
              aria-label={`Remove ${job.fileName}`}
              title="Remove from queue"
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          {job.status === "processing" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void pauseJob(job.id)}
                aria-label={`Pause ${job.fileName}`}
                title="Pause"
              >
                <Pause className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void cancelJob(job.id)}
                aria-label={`Cancel ${job.fileName}`}
                title="Cancel"
              >
                <X className="h-4 w-4 text-error" />
              </Button>
            </>
          )}

          {job.status === "paused" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void resumeJob(job.id)}
                aria-label={`Resume ${job.fileName}`}
                title="Resume"
              >
                <Play className="h-4 w-4 text-accent" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void cancelJob(job.id)}
                aria-label={`Cancel ${job.fileName}`}
                title="Cancel"
              >
                <X className="h-4 w-4 text-error" />
              </Button>
            </>
          )}

          {job.status === "completed" && (
            <>
              {isLarger && job.outputPath && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void keepOriginal(job.id, job.type)}
                  title="Delete larger compressed file and keep original"
                >
                  Keep Original
                </Button>
              )}
              {job.outputPath && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void tauri.openOutputFolder(job.outputPath!)}
                    aria-label="Open output folder"
                    title="Open folder"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => void handleCopyPath(e)}
                    aria-label="Copy output path"
                    title="Copy output path"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void removeJob(job.id, job.type)}
                aria-label="Remove item"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {(job.status === "failed" || job.status === "cancelled") && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void retryJob(job.id)}
                title="Retry"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void removeJob(job.id, job.type)}
                aria-label="Remove item"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {(job.status === "processing" || job.status === "paused") && (
        <ProgressBar
          progress={job.progress}
          status={job.status}
          etaSeconds={job.etaSeconds}
          indeterminate={job.type === "image" && job.progress < 15}
        />
      )}

      {job.status === "failed" && job.error && (
        <div className="rounded-sm bg-error/10 border border-error/25 px-2.5 py-2 text-xs text-error space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">
              {job.error.split("\n")[0]}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowErrorDetails((v) => !v);
              }}
              className="inline-flex items-center gap-1 text-[11px] underline shrink-0"
            >
              {showErrorDetails ? (
                <>
                  Hide details <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  Show details <ChevronDown className="h-3 w-3" />
                </>
              )}
            </button>
          </div>
          {showErrorDetails && (
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-all text-error/90 max-h-28 overflow-y-auto bg-app/60 p-2 rounded-sm">
              {job.error}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
