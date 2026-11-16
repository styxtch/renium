import { cn, formatEta } from "@/lib/utils";
import type { JobStatus } from "@/types";

export function ProgressBar({
  progress,
  status,
  etaSeconds,
  indeterminate,
}: {
  progress: number;
  status: JobStatus;
  etaSeconds?: number;
  indeterminate?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, progress));

  const barColor =
    status === "paused"
      ? "bg-warning"
      : status === "completed"
        ? "bg-success"
        : status === "failed"
          ? "bg-error"
          : "bg-accent";

  return (
    <div className="flex items-center gap-2.5 w-full">
      <div className="relative h-1.5 flex-1 rounded-full bg-input overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-150 ease-out",
            barColor,
            indeterminate && status === "processing" && "animate-pulse"
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono text-secondary tabular-nums">
        <span>{Math.round(clamped)}%</span>
        {status === "processing" && etaSeconds !== undefined && etaSeconds > 0 && (
          <span className="text-muted">• ETA {formatEta(etaSeconds)}</span>
        )}
      </div>
    </div>
  );
}
