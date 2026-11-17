import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Terminal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJobStore } from "@/stores/jobStore";
import type { MediaType } from "@/types";

export interface FfmpegTerminalPanelProps {
  mediaType?: MediaType;
  className?: string;
}

export function FfmpegTerminalPanel({ mediaType, className }: FfmpegTerminalPanelProps) {
  const { ffmpegLogs, clearFfmpegLogs, videoJobs, imageJobs, audioJobs } = useJobStore();
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleLogs = mediaType
    ? ffmpegLogs.filter((entry) => entry.type === mediaType)
    : ffmpegLogs;

  const isRunning =
    mediaType === "video"
      ? videoJobs.some((j) => j.status === "processing")
      : mediaType === "audio"
        ? audioJobs.some((j) => j.status === "processing")
        : mediaType === "image"
          ? imageJobs.some((j) => j.status === "processing")
          : videoJobs.some((j) => j.status === "processing") ||
            imageJobs.some((j) => j.status === "processing") ||
            audioJobs.some((j) => j.status === "processing");

  const panelTitle = mediaType === "image" ? "Image Processing Log" : "FFmpeg Console";

  const lastLogId = visibleLogs[visibleLogs.length - 1]?.id;

  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lastLogId, collapsed]);

  const handleCopy = async () => {
    if (visibleLogs.length === 0) return;
    try {
      await navigator.clipboard.writeText(visibleLogs.map((l) => l.line).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be restricted in non-secure/test environments
    }
  };

  return (
    <section
      aria-label="FFmpeg Terminal"
      className={cn(
        "rounded-md border border-border bg-surface shadow-card flex flex-col overflow-hidden shrink-0",
        !collapsed && className
      )}
    >
      <div
        className={cn(
          "px-3 py-2 flex items-center justify-between gap-2 bg-elevated/40",
          !collapsed && "border-b border-border"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="h-3.5 w-3.5 text-accent shrink-0" />
          <span className="text-xs font-semibold text-primary truncate">{panelTitle}</span>
          {isRunning && (
            <span
              className="h-2 w-2 rounded-full bg-success animate-pulse shrink-0"
              title="FFmpeg running"
            />
          )}
          <span className="text-[11px] font-mono text-muted">({visibleLogs.length})</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={visibleLogs.length === 0}
            title="Copy FFmpeg logs"
            aria-label="Copy FFmpeg logs"
            className="p-1 rounded-sm text-secondary hover:text-primary hover:bg-elevated disabled:opacity-40 transition-colors"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={clearFfmpegLogs}
            disabled={visibleLogs.length === 0}
            title="Clear FFmpeg logs"
            aria-label="Clear FFmpeg logs"
            className="p-1 rounded-sm text-secondary hover:text-primary hover:bg-elevated disabled:opacity-40 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            title={collapsed ? "Expand FFmpeg Console" : "Collapse FFmpeg Console"}
            aria-label={collapsed ? "Expand FFmpeg Console" : "Collapse FFmpeg Console"}
            className="p-1 rounded-sm text-secondary hover:text-primary hover:bg-elevated transition-colors"
          >
            {collapsed ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div
          ref={scrollRef}
          className="min-h-[130px] max-h-[260px] xl:max-h-none flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed bg-app/70 text-secondary select-text"
        >
          {visibleLogs.length === 0 ? (
            <div className="text-muted italic">
              {mediaType === "image"
                ? "Waiting for image processing logs... Start a job to see output path & status."
                : "Waiting for FFmpeg output... Start a job to stream live logs."}
            </div>
          ) : (
            visibleLogs.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "whitespace-pre-wrap break-all",
                  /error|failed|invalid/i.test(entry.line)
                    ? "text-danger font-medium"
                    : entry.line.startsWith("[renium]")
                      ? "text-accent font-medium"
                      : "text-secondary"
                )}
              >
                {entry.line}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
