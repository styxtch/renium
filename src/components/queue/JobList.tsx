import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CheckCircle2, Pause, Play, Sparkles, Trash2, XCircle } from "lucide-react";
import { JobItem } from "@/components/queue/JobItem";
import { Button } from "@/components/ui/Primitives";
import { cn } from "@/lib/utils";
import { useJobStore } from "@/stores/jobStore";
import type { Job, MediaType } from "@/types";

const FINISHED_STATUSES = new Set<Job["status"]>(["completed", "failed", "cancelled"]);

export function JobList({ mediaType }: { mediaType: MediaType }) {
  const {
    videoJobs,
    imageJobs,
    audioJobs,
    videoOptions,
    imageOptions,
    audioOptions,
    startCompress,
    pauseAll,
    resumeAll,
    cancelAll,
    clearCompleted,
    reorderQueue,
    uncheckedJobIds,
    setAllQueuedChecked,
  } = useJobStore();

  const jobs =
    mediaType === "video" ? videoJobs : mediaType === "image" ? imageJobs : audioJobs;
  const activeJobs = jobs.filter((j) => !FINISHED_STATUSES.has(j.status));
  const outputJobs = jobs.filter((j) => FINISHED_STATUSES.has(j.status));

  const queueParentRef = useRef<HTMLDivElement>(null);
  const outputParentRef = useRef<HTMLDivElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    if (dragIndex === null) return;
    const handleMouseUp = () => setDragIndex(null);
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [dragIndex]);

  const handleDragEnterRow = (hoverIndex: number) => {
    if (dragIndex !== null && dragIndex !== hoverIndex) {
      const draggedJob = activeJobs[dragIndex];
      const targetJob = activeJobs[hoverIndex];
      if (draggedJob && targetJob) {
        const fullFrom = jobs.findIndex((j) => j.id === draggedJob.id);
        const fullTo = jobs.findIndex((j) => j.id === targetJob.id);
        if (fullFrom !== -1 && fullTo !== -1) {
          void reorderQueue(mediaType, fullFrom, fullTo);
        }
      }
      setDragIndex(hoverIndex);
    }
  };

  const queuedJobs = activeJobs.filter((j) => j.status === "queued");
  const queuedCount = queuedJobs.length;
  const selectedQueuedCount = queuedJobs.filter((j) => !uncheckedJobIds[j.id]).length;
  const allQueuedChecked = queuedCount > 0 && selectedQueuedCount === queuedCount;
  const processingCount = activeJobs.filter((j) => j.status === "processing").length;
  const pausedCount = activeJobs.filter((j) => j.status === "paused").length;
  const completedCount = outputJobs.filter((j) => j.status === "completed").length;
  const failedCount = outputJobs.filter((j) => j.status === "failed").length;

  const ctaLabel = (() => {
    if (processingCount > 0 && selectedQueuedCount === 0) {
      return `Processing (${processingCount})…`;
    }
    if (mediaType === "image") {
      if (imageOptions.outputFormat === "original") {
        return `Start Compress (${selectedQueuedCount})`;
      }
      return `Convert to ${imageOptions.outputFormat.toUpperCase()} (${selectedQueuedCount})`;
    }
    if (mediaType === "audio") {
      if (audioOptions.outputFormat === "original") {
        return `Start Compress (${selectedQueuedCount})`;
      }
      return `Convert to ${audioOptions.outputFormat.toUpperCase()} (${selectedQueuedCount})`;
    }
    if (videoOptions.subtitleMode === "extract-srt") {
      return `Extract SRT (${selectedQueuedCount})`;
    }
    if (videoOptions.outputFormat === "mp3" || videoOptions.outputFormat === "aac") {
      return `Extract ${videoOptions.outputFormat.toUpperCase()} Audio (${selectedQueuedCount})`;
    }
    if (videoOptions.outputFormat === "gif") {
      return `Convert to GIF (${selectedQueuedCount})`;
    }
    if (videoOptions.outputFormat !== "mp4") {
      return `Convert to ${videoOptions.outputFormat.toUpperCase()} (${selectedQueuedCount})`;
    }
    return `Start Compress (${selectedQueuedCount})`;
  })();

  const useQueueVirtual = activeJobs.length > 50;
  const queueVirtualizer = useVirtualizer({
    count: useQueueVirtual ? activeJobs.length : 0,
    getScrollElement: () => queueParentRef.current,
    estimateSize: () => 86,
    overscan: 8,
  });

  const useOutputVirtual = outputJobs.length > 50;
  const outputVirtualizer = useVirtualizer({
    count: useOutputVirtual ? outputJobs.length : 0,
    getScrollElement: () => outputParentRef.current,
    estimateSize: () => 86,
    overscan: 8,
  });

  const overallProgress =
    activeJobs.length > 0
      ? Math.round(
          activeJobs.reduce((acc, j) => {
            if (j.status === "processing" || j.status === "paused") return acc + j.progress;
            return acc;
          }, 0) / activeJobs.length
        )
      : 0;

  if (activeJobs.length === 0 && outputJobs.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex-1 min-h-[200px] xl:min-h-0 grid items-start gap-3 xl:overflow-y-auto p-3 -m-3",
        activeJobs.length > 0 && outputJobs.length > 0
          ? "grid-cols-1 xl:grid-cols-2"
          : "grid-cols-1"
      )}
    >
      {activeJobs.length > 0 && (
        <section
          aria-label={
            mediaType === "video"
              ? "Video Queue"
              : mediaType === "image"
                ? "Image Queue"
                : "Audio Queue"
          }
          className="flex flex-col max-h-full min-h-0 rounded-md border border-border bg-surface shadow-card overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-3">
              {queuedCount > 0 && (
                <input
                  type="checkbox"
                  checked={allQueuedChecked}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate =
                        selectedQueuedCount > 0 && selectedQueuedCount < queuedCount;
                    }
                  }}
                  onChange={() => setAllQueuedChecked(mediaType, !allQueuedChecked)}
                  aria-label="Select all queued jobs"
                  title={allQueuedChecked ? "Unselect all" : "Select all"}
                  className="h-4 w-4 rounded border-border accent-accent cursor-pointer shrink-0"
                />
              )}
              <h3 className="text-sm font-semibold text-primary">
                {mediaType === "video"
                  ? "Video Queue"
                  : mediaType === "image"
                    ? "Image Queue"
                    : "Audio Queue"}{" "}
                ({activeJobs.length})
              </h3>
              {(processingCount > 0 || pausedCount > 0) && (
                <span className="text-xs font-mono text-secondary">
                  Overall {overallProgress}%
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {processingCount > 0 && (
                <Button size="sm" variant="secondary" onClick={() => void pauseAll(mediaType)}>
                  <Pause className="h-3.5 w-3.5" />
                  <span>Pause All</span>
                </Button>
              )}
              {pausedCount > 0 && (
                <Button size="sm" variant="secondary" onClick={() => void resumeAll(mediaType)}>
                  <Play className="h-3.5 w-3.5" />
                  <span>Resume All</span>
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => void cancelAll(mediaType)}>
                <XCircle className="h-3.5 w-3.5 text-error" />
                <span>Cancel Remaining</span>
              </Button>
            </div>
          </div>

          <div ref={queueParentRef} className="min-h-0 overflow-y-auto p-3" role="list">
            {useQueueVirtual ? (
              <div
                style={{
                  height: `${queueVirtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {queueVirtualizer.getVirtualItems().map((vRow) => {
                  const job = activeJobs[vRow.index];
                  return (
                    <div
                      key={job.id}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${vRow.start}px)`,
                        paddingBottom: "8px",
                      }}
                    >
                      <JobItem
                        job={job}
                        index={vRow.index}
                        total={activeJobs.length}
                        isDragging={dragIndex === vRow.index}
                        onDragStartHandle={setDragIndex}
                        onDragEnterRow={handleDragEnterRow}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {activeJobs.map((job, idx) => (
                  <JobItem
                    key={job.id}
                    job={job}
                    index={idx}
                    total={activeJobs.length}
                    isDragging={dragIndex === idx}
                    onDragStartHandle={setDragIndex}
                    onDragEnterRow={handleDragEnterRow}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3 shrink-0">
            <span className="text-xs text-muted">
              {selectedQueuedCount < queuedCount
                ? `${selectedQueuedCount} of ${queuedCount} selected`
                : `${queuedCount} queued`}
              {processingCount > 0 ? ` • ${processingCount} running` : ""}
              {pausedCount > 0 ? ` • ${pausedCount} paused` : ""}
            </span>

            <Button
              variant="primary"
              size="md"
              disabled={selectedQueuedCount === 0}
              onClick={() => void startCompress(mediaType)}
            >
              <Sparkles className="h-4 w-4" />
              <span>{ctaLabel}</span>
            </Button>
          </div>
        </section>
      )}

      {outputJobs.length > 0 && (
        <section
          aria-label="Output List"
          className="flex flex-col max-h-full min-h-0 rounded-md border border-border bg-surface shadow-card overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              <h3 className="text-sm font-semibold text-primary">
                Output List ({outputJobs.length})
              </h3>
              {(completedCount > 0 || failedCount > 0) && (
                <span className="text-xs text-muted">
                  {completedCount > 0 ? `${completedCount} done` : ""}
                  {completedCount > 0 && failedCount > 0 ? " • " : ""}
                  {failedCount > 0 ? `${failedCount} failed` : ""}
                </span>
              )}
            </div>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => void clearCompleted(mediaType)}
              title="Clear completed, failed, and cancelled jobs"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear Output List ({outputJobs.length})</span>
            </Button>
          </div>

          <div ref={outputParentRef} className="min-h-0 overflow-y-auto p-3" role="list">
            {useOutputVirtual ? (
              <div
                style={{
                  height: `${outputVirtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {outputVirtualizer.getVirtualItems().map((vRow) => {
                  const job = outputJobs[vRow.index];
                  return (
                    <div
                      key={job.id}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${vRow.start}px)`,
                        paddingBottom: "8px",
                      }}
                    >
                      <JobItem
                        job={job}
                        index={vRow.index}
                        total={outputJobs.length}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {outputJobs.map((job, idx) => (
                  <JobItem
                    key={job.id}
                    job={job}
                    index={idx}
                    total={outputJobs.length}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
