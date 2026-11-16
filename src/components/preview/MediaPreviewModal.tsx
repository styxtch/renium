import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronsLeftRight,
  Columns2,
  Crop,
  Eye,
  RefreshCw,
  Scissors,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Badge, Button, Input } from "@/components/ui/Primitives";
import * as tauri from "@/lib/tauri";
import { calcSavingsPercent, cn, formatBytes } from "@/lib/utils";
import { useJobStore } from "@/stores/jobStore";
import type { ImageOptions, MediaPreviewResponse, VideoOptions } from "@/types";

type EditorTab = "compare" | "crop" | "trim";
type CompareMode = "split" | "side-by-side";
type AspectPreset = "free" | "16:9" | "9:16" | "1:1" | "4:3";

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function formatTimePrecise(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00.0";
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, "0")}:${rem.toFixed(1).padStart(4, "0")}`;
}

function roundForMedia(val: number, isVideo: boolean, minVal = 2): number {
  const rounded = Math.round(val);
  if (!isVideo) return Math.max(1, rounded);
  const even = rounded - (rounded % 2);
  return Math.max(minVal, even);
}

function computeAspectCrop(
  origW: number,
  origH: number,
  ratio: number,
  isVideo: boolean
): CropRect {
  let w = origW;
  let h = Math.round(w / ratio);
  if (h > origH) {
    h = origH;
    w = Math.round(h * ratio);
  }
  const finalW = Math.min(origW, roundForMedia(w, isVideo));
  const finalH = Math.min(origH, roundForMedia(h, isVideo));
  const x = Math.max(0, Math.floor((origW - finalW) / 2));
  const y = Math.max(0, Math.floor((origH - finalH) / 2));
  return { x, y, width: finalW, height: finalH };
}

export function MediaPreviewModal() {
  const {
    videoJobs,
    imageJobs,
    previewJobId,
    setPreviewJobId,
    videoOptions,
    imageOptions,
    updateVideoOptions,
    updateImageOptions,
  } = useJobStore();

  const job = useMemo(() => {
    if (!previewJobId) return null;
    return (
      videoJobs.find((j) => j.id === previewJobId) ??
      imageJobs.find((j) => j.id === previewJobId) ??
      null
    );
  }, [previewJobId, videoJobs, imageJobs]);

  const [editorTab, setEditorTab] = useState<EditorTab>("compare");
  const [compareMode, setCompareMode] = useState<CompareMode>("split");
  const [splitPos, setSplitPos] = useState(50);

  const [preview, setPreview] = useState<MediaPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Draft crop / trim state synced from store options when opening
  const [cropX, setCropX] = useState<number | undefined>(undefined);
  const [cropY, setCropY] = useState<number | undefined>(undefined);
  const [cropWidth, setCropWidth] = useState<number | undefined>(undefined);
  const [cropHeight, setCropHeight] = useState<number | undefined>(undefined);
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>("free");

  const [trimStartSec, setTrimStartSec] = useState<number | undefined>(undefined);
  const [trimEndSec, setTrimEndSec] = useState<number | undefined>(undefined);
  const [previewTimeSec, setPreviewTimeSec] = useState<number>(0);

  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const updateSplitFromClientX = useCallback((clientX: number) => {
    const el = splitContainerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPos(Math.max(0, Math.min(100, Math.round(pct))));
  }, []);

  useEffect(() => {
    if (!isDraggingSplit) return;
    const handleMouseMove = (e: MouseEvent) => updateSplitFromClientX(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) updateSplitFromClientX(e.touches[0].clientX);
    };
    const handleEnd = () => setIsDraggingSplit(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchend", handleEnd);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDraggingSplit, updateSplitFromClientX]);

  const cropContainerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    startClientX: number;
    startClientY: number;
    origRect: CropRect;
    mode: "move" | "se";
  } | null>(null);

  const buildDraftOptions = useCallback((): VideoOptions | ImageOptions | null => {
    if (!job) return null;
    if (job.type === "video") {
      return {
        ...videoOptions,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        trimStartSec,
        trimEndSec,
      };
    }
    return {
      ...imageOptions,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
    };
  }, [
    job,
    videoOptions,
    imageOptions,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    trimStartSec,
    trimEndSec,
  ]);

  const fetchPreview = useCallback(
    async (
      targetJob: NonNullable<typeof job>,
      opts: VideoOptions | ImageOptions,
      seekSec?: number
    ) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await tauri.generatePreview(
          targetJob.inputPath,
          targetJob.type,
          opts,
          seekSec,
          targetJob.status === "completed" ? targetJob.outputPath : undefined
        );
        setPreview(res);
        setPreviewTimeSec(res.previewTimeSec);
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : typeof err === "object" && err && "message" in err
              ? String((err as { message: string }).message)
              : String(err)
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Initialize draft values when previewJobId changes
  useEffect(() => {
    if (!job) {
      setPreview(null);
      setErrorMsg(null);
      return;
    }

    const activeOpts = job.type === "video" ? videoOptions : imageOptions;
    setCropX(activeOpts.cropX ?? undefined);
    setCropY(activeOpts.cropY ?? undefined);
    setCropWidth(activeOpts.cropWidth ?? undefined);
    setCropHeight(activeOpts.cropHeight ?? undefined);
    setAspectPreset("free");
    setEditorTab("compare");

    if (job.type === "video") {
      setTrimStartSec(videoOptions.trimStartSec ?? undefined);
      setTrimEndSec(videoOptions.trimEndSec ?? undefined);
      const initialSeek = videoOptions.trimStartSec ?? 0;
      setPreviewTimeSec(initialSeek);
      void fetchPreview(job, { ...videoOptions }, initialSeek > 0 ? initialSeek : undefined);
    } else {
      setTrimStartSec(undefined);
      setTrimEndSec(undefined);
      setPreviewTimeSec(0);
      void fetchPreview(job, { ...imageOptions });
    }
    // Intentionally reset draft state only when opening/switching preview job
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  if (!job) return null;

  const isVideo = job.type === "video";
  const origW = preview?.originalWidth ?? job.probeInfo?.width ?? 1920;
  const origH = preview?.originalHeight ?? job.probeInfo?.height ?? 1080;
  const durMs = preview?.durationMs ?? job.probeInfo?.durationMs;
  const totalDurationSec =
    durMs && durMs > 0 ? Math.round((durMs / 1000) * 10) / 10 : 30;

  const activeCrop: CropRect = {
    x: Math.max(0, Math.min(origW - 2, cropX ?? 0)),
    y: Math.max(0, Math.min(origH - 2, cropY ?? 0)),
    width: Math.max(isVideo ? 2 : 1, Math.min(origW, cropWidth ?? origW)),
    height: Math.max(isVideo ? 2 : 1, Math.min(origH, cropHeight ?? origH)),
  };

  const hasCustomCrop = cropWidth != null && cropHeight != null;
  const hasTrim =
    isVideo &&
    ((trimStartSec != null && trimStartSec > 0) ||
      (trimEndSec != null && trimEndSec > 0));

  const setClampedCrop = (next: CropRect) => {
    const w = Math.min(origW, roundForMedia(next.width, isVideo));
    const h = Math.min(origH, roundForMedia(next.height, isVideo));
    const x = Math.max(0, Math.min(origW - w, Math.round(next.x)));
    const y = Math.max(0, Math.min(origH - h, Math.round(next.y)));
    setCropX(x);
    setCropY(y);
    setCropWidth(w);
    setCropHeight(h);
  };

  const handleAspectPreset = (preset: AspectPreset) => {
    setAspectPreset(preset);
    if (preset === "free") {
      if (!hasCustomCrop) {
        setClampedCrop({ x: 0, y: 0, width: origW, height: origH });
      }
      return;
    }
    const ratios: Record<Exclude<AspectPreset, "free">, number> = {
      "16:9": 16 / 9,
      "9:16": 9 / 16,
      "1:1": 1,
      "4:3": 4 / 3,
    };
    setClampedCrop(computeAspectCrop(origW, origH, ratios[preset], isVideo));
  };

  const handleResetCrop = () => {
    setAspectPreset("free");
    setCropX(undefined);
    setCropY(undefined);
    setCropWidth(undefined);
    setCropHeight(undefined);
  };

  const handleResetTrim = () => {
    setTrimStartSec(undefined);
    setTrimEndSec(undefined);
  };

  const handleRefreshPreview = () => {
    const draft = buildDraftOptions();
    if (!draft) return;
    void fetchPreview(job, draft, isVideo ? previewTimeSec : undefined);
  };

  const handleApplyToQueue = () => {
    if (isVideo) {
      void updateVideoOptions({
        cropX: hasCustomCrop ? activeCrop.x : undefined,
        cropY: hasCustomCrop ? activeCrop.y : undefined,
        cropWidth: hasCustomCrop ? activeCrop.width : undefined,
        cropHeight: hasCustomCrop ? activeCrop.height : undefined,
        trimStartSec: trimStartSec && trimStartSec > 0 ? trimStartSec : undefined,
        trimEndSec: trimEndSec && trimEndSec > 0 ? trimEndSec : undefined,
      });
    } else {
      void updateImageOptions({
        cropX: hasCustomCrop ? activeCrop.x : undefined,
        cropY: hasCustomCrop ? activeCrop.y : undefined,
        cropWidth: hasCustomCrop ? activeCrop.width : undefined,
        cropHeight: hasCustomCrop ? activeCrop.height : undefined,
      });
    }
    setPreviewJobId(null);
  };

  const startCropDrag = (mode: "move" | "se", e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragStateRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      origRect: activeCrop,
      mode,
    };
  };

  const onCropPointerMove = (e: React.PointerEvent) => {
    const drag = dragStateRef.current;
    const container = cropContainerRef.current;
    if (!drag || !container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dxPx = ((e.clientX - drag.startClientX) / rect.width) * origW;
    const dyPx = ((e.clientY - drag.startClientY) / rect.height) * origH;

    if (drag.mode === "move") {
      setClampedCrop({
        x: drag.origRect.x + dxPx,
        y: drag.origRect.y + dyPx,
        width: drag.origRect.width,
        height: drag.origRect.height,
      });
    } else {
      setClampedCrop({
        x: drag.origRect.x,
        y: drag.origRect.y,
        width: Math.max(20, drag.origRect.width + dxPx),
        height: Math.max(20, drag.origRect.height + dyPx),
      });
    }
  };

  const stopCropDrag = () => {
    dragStateRef.current = null;
  };

  const procSize = preview?.processedSize ?? 0;
  const origSize = preview?.originalSize ?? job.originalSize;
  const savings = procSize > 0 ? calcSavingsPercent(origSize, procSize) : 0;

  const trimmedDurationSec = Math.max(
    0,
    Math.round(((trimEndSec ?? totalDurationSec) - (trimStartSec ?? 0)) * 10) / 10
  );

  const isCompareOnly = job.status === "completed" && Boolean(job.outputPath);
  const activeOpts = isVideo ? videoOptions : imageOptions;
  const hasPendingEdits =
    !isCompareOnly &&
    (cropX !== activeOpts.cropX ||
      cropY !== activeOpts.cropY ||
      cropWidth !== activeOpts.cropWidth ||
      cropHeight !== activeOpts.cropHeight ||
      (isVideo &&
        (trimStartSec !== videoOptions.trimStartSec ||
          trimEndSec !== videoOptions.trimEndSec)));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Visual Preview & Editor"
    >
      <div className="w-full max-w-4xl rounded-lg bg-surface border border-border-strong shadow-soft flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-elevated/40">
          <div className="min-w-0 flex items-center gap-2.5">
            <Eye className="h-4 w-4 text-accent shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-primary truncate">
                {isCompareOnly ? "Compare Output" : "Visual Preview & Editor"} — {job.fileName}
              </h2>
              <p className="text-[11px] text-muted">
                {isCompareOnly
                  ? "Compare original file vs processed output on disk"
                  : isVideo
                    ? "Compare compressed frame, visual crop, and start/end trim timeline"
                    : "Compare before/after compression quality and interactive crop"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPreviewJobId(null)}
            aria-label="Close visual preview"
            className="text-muted hover:text-primary p-1 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-surface">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Preview editor modes">
            <button
              type="button"
              role="tab"
              aria-selected={editorTab === "compare"}
              onClick={() => {
                setEditorTab("compare");
                handleRefreshPreview();
              }}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors",
                editorTab === "compare"
                  ? "bg-accent text-white"
                  : "text-secondary hover:text-primary hover:bg-hover"
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Compare Before/After
            </button>
            {!isCompareOnly && (
              <button
                type="button"
                role="tab"
                aria-selected={editorTab === "crop"}
                onClick={() => setEditorTab("crop")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors",
                  editorTab === "crop"
                    ? "bg-accent text-white"
                    : "text-secondary hover:text-primary hover:bg-hover"
                )}
              >
                <Crop className="h-3.5 w-3.5" />
                Visual Crop
                {hasCustomCrop && <Badge tone="accent">Active</Badge>}
              </button>
            )}
            {!isCompareOnly && isVideo && (
              <button
                type="button"
                role="tab"
                aria-selected={editorTab === "trim"}
                onClick={() => setEditorTab("trim")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors",
                  editorTab === "trim"
                    ? "bg-accent text-white"
                    : "text-secondary hover:text-primary hover:bg-hover"
                )}
              >
                <Scissors className="h-3.5 w-3.5" />
                Trim Timeline
                {hasTrim && <Badge tone="accent">Active</Badge>}
              </button>
            )}
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleRefreshPreview}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh Preview
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="rounded-sm bg-error/10 border border-error/30 px-3 py-2 text-xs text-error">
              {errorMsg}
            </div>
          )}

          {/* COMPARE TAB */}
          {editorTab === "compare" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-sm border border-border bg-elevated/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => setCompareMode("split")}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded-sm transition-colors",
                      compareMode === "split"
                        ? "bg-accent text-white"
                        : "text-secondary hover:text-primary"
                    )}
                  >
                    Split Slider
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareMode("side-by-side")}
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm transition-colors",
                      compareMode === "side-by-side"
                        ? "bg-accent text-white"
                        : "text-secondary hover:text-primary"
                    )}
                  >
                    <Columns2 className="h-3 w-3" />
                    Side-by-Side
                  </button>
                </div>

                {preview && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted">
                      Orig:{" "}
                      <strong className="text-primary">
                        {preview.originalWidth}×{preview.originalHeight}
                      </strong>{" "}
                      ({formatBytes(origSize)})
                    </span>
                    <span className="text-muted">→</span>
                    <span className="text-secondary">
                      Out:{" "}
                      <strong className="text-primary">
                        {preview.processedWidth}×{preview.processedHeight}
                      </strong>{" "}
                      ({isVideo ? "~" : ""}
                      {formatBytes(procSize)} {preview.processedFormat.toUpperCase()})
                    </span>
                    <Badge tone={savings >= 0 ? "success" : "warning"}>
                      {savings >= 0 ? `Saved ${savings}%` : `+${Math.abs(savings)}%`}
                    </Badge>
                  </div>
                )}
              </div>

              {loading && !preview ? (
                <div className="h-72 rounded-md border border-border bg-elevated/40 flex items-center justify-center text-xs text-muted">
                  Generating preview...
                </div>
              ) : preview ? (
                compareMode === "split" ? (
                  <div
                    ref={splitContainerRef}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsDraggingSplit(true);
                      updateSplitFromClientX(e.clientX);
                    }}
                    onTouchStart={(e) => {
                      if (e.touches[0]) {
                        setIsDraggingSplit(true);
                        updateSplitFromClientX(e.touches[0].clientX);
                      }
                    }}
                    className="relative h-[360px] w-full rounded-md border border-border bg-black/50 overflow-hidden select-none flex items-center justify-center cursor-ew-resize"
                  >
                    <img
                      src={preview.processedDataUrl}
                      alt="Compressed preview output"
                      draggable={false}
                      className="max-h-full max-w-full object-contain pointer-events-none"
                    />
                    <div
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
                    >
                      <img
                        src={preview.originalDataUrl}
                        alt="Original media preview"
                        draggable={false}
                        className="max-h-full max-w-full object-contain pointer-events-none"
                      />
                    </div>

                    <div
                      role="slider"
                      tabIndex={0}
                      aria-label="Before after split slider"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={splitPos}
                      onKeyDown={(e) => {
                        const step = e.shiftKey ? 5 : 1;
                        if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          setSplitPos((p) => Math.max(0, p - step));
                        } else if (e.key === "ArrowRight") {
                          e.preventDefault();
                          setSplitPos((p) => Math.min(100, p + step));
                        }
                      }}
                      className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,0.6)] -translate-x-1/2 focus:outline-none"
                      style={{ left: `${splitPos}%` }}
                    >
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-surface border-2 border-accent text-accent shadow-md flex items-center justify-center">
                        <ChevronsLeftRight className="h-4 w-4" />
                      </div>
                    </div>

                    <span className="absolute top-2.5 left-2.5 rounded bg-black/75 px-2 py-0.5 text-[10px] font-medium text-white pointer-events-none">
                      Original ({splitPos}%)
                    </span>
                    <span className="absolute top-2.5 right-2.5 rounded bg-accent/90 px-2 py-0.5 text-[10px] font-medium text-white pointer-events-none">
                      Output ({preview.processedFormat.toUpperCase()})
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-md border border-border bg-black/40 p-2.5 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-muted">
                        <span className="font-semibold text-primary">Original</span>
                        <span>
                          {preview.originalWidth}×{preview.originalHeight} • {formatBytes(origSize)}
                        </span>
                      </div>
                      <div className="h-64 flex items-center justify-center bg-black/30 rounded overflow-hidden">
                        <img
                          src={preview.originalDataUrl}
                          alt="Original frame"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    </div>

                    <div className="rounded-md border border-accent/40 bg-black/40 p-2.5 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-muted">
                        <span className="font-semibold text-accent">
                          Output ({preview.processedFormat.toUpperCase()})
                        </span>
                        <span>
                          {preview.processedWidth}×{preview.processedHeight} •{" "}
                          {isVideo ? "~" : ""}
                          {formatBytes(procSize)}
                        </span>
                      </div>
                      <div className="h-64 flex items-center justify-center bg-black/30 rounded overflow-hidden">
                        <img
                          src={preview.processedDataUrl}
                          alt="Processed output preview"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    </div>
                  </div>
                )
              ) : null}
            </div>
          )}

          {/* VISUAL CROP TAB */}
          {editorTab === "crop" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(["free", "16:9", "9:16", "1:1", "4:3"] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => handleAspectPreset(ratio)}
                      className={cn(
                        "px-2.5 py-1 rounded-sm border text-xs font-medium transition-colors",
                        aspectPreset === ratio && hasCustomCrop
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border bg-elevated/50 text-secondary hover:text-primary"
                      )}
                    >
                      {ratio === "free" ? "Free" : ratio}
                    </button>
                  ))}
                </div>
                <Button size="sm" variant="ghost" onClick={handleResetCrop}>
                  Reset Crop
                </Button>
              </div>

              <div className="flex justify-center bg-black/50 rounded-md border border-border p-3">
                <div
                  ref={cropContainerRef}
                  className="relative inline-block max-h-[300px] overflow-hidden select-none"
                  style={{ aspectRatio: `${origW} / ${origH}` }}
                  onPointerMove={onCropPointerMove}
                  onPointerUp={stopCropDrag}
                  onPointerLeave={stopCropDrag}
                >
                  {preview ? (
                    <img
                      src={preview.originalDataUrl}
                      alt="Crop target preview"
                      className="block w-full h-full max-h-[300px] object-contain pointer-events-none"
                    />
                  ) : (
                    <div className="w-[400px] h-[225px] flex items-center justify-center text-xs text-muted">
                      Loading frame...
                    </div>
                  )}

                  {/* Crop Overlay Box */}
                  <div
                    role="region"
                    aria-label="Interactive crop region"
                    onPointerDown={(e) => startCropDrag("move", e)}
                    className="absolute border-2 border-accent bg-accent/10 cursor-move shadow-[0_0_0_9999px_rgba(0,0,0,0.52)]"
                    style={{
                      left: `${(activeCrop.x / origW) * 100}%`,
                      top: `${(activeCrop.y / origH) * 100}%`,
                      width: `${(activeCrop.width / origW) * 100}%`,
                      height: `${(activeCrop.height / origH) * 100}%`,
                    }}
                  >
                    <div
                      role="slider"
                      aria-label="Resize crop corner"
                      aria-valuenow={activeCrop.width}
                      tabIndex={0}
                      onPointerDown={(e) => startCropDrag("se", e)}
                      className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 rounded-xs bg-accent border border-white cursor-nwse-resize"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="space-y-1 text-xs">
                  <span className="text-muted">Crop X (px)</span>
                  <Input
                    type="number"
                    aria-label="Crop X"
                    min={0}
                    max={Math.max(0, origW - 2)}
                    value={activeCrop.x}
                    onChange={(e) =>
                      setClampedCrop({
                        ...activeCrop,
                        x: Number(e.target.value) || 0,
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted">Crop Y (px)</span>
                  <Input
                    type="number"
                    aria-label="Crop Y"
                    min={0}
                    max={Math.max(0, origH - 2)}
                    value={activeCrop.y}
                    onChange={(e) =>
                      setClampedCrop({
                        ...activeCrop,
                        y: Number(e.target.value) || 0,
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted">Crop Width (px)</span>
                  <Input
                    type="number"
                    aria-label="Crop Width"
                    min={isVideo ? 2 : 1}
                    max={origW}
                    value={activeCrop.width}
                    onChange={(e) =>
                      setClampedCrop({
                        ...activeCrop,
                        width: Number(e.target.value) || (isVideo ? 2 : 1),
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted">Crop Height (px)</span>
                  <Input
                    type="number"
                    aria-label="Crop Height"
                    min={isVideo ? 2 : 1}
                    max={origH}
                    value={activeCrop.height}
                    onChange={(e) =>
                      setClampedCrop({
                        ...activeCrop,
                        height: Number(e.target.value) || (isVideo ? 2 : 1),
                      })
                    }
                  />
                </label>
              </div>
              <p className="text-[11px] text-muted">
                Source dimensions: {origW}×{origH}px
                {isVideo ? " (video crop dimensions automatically snap to even integers)" : ""}
              </p>
            </div>
          )}

          {/* VIDEO TRIM TAB */}
          {editorTab === "trim" && isVideo && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-black/50 p-3 flex flex-col items-center gap-3">
                <div className="h-56 w-full flex items-center justify-center overflow-hidden rounded bg-black/40">
                  {preview ? (
                    <img
                      src={preview.originalDataUrl}
                      alt="Frame at selected timestamp"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted">Loading frame...</span>
                  )}
                </div>

                {/* Scrubber bar with highlighted trim window */}
                <div className="w-full space-y-1.5">
                  <div className="relative h-2 rounded-full bg-elevated overflow-hidden">
                    <div
                      className="absolute top-0 bottom-0 bg-accent/60"
                      style={{
                        left: `${Math.min(100, ((trimStartSec ?? 0) / Math.max(0.1, totalDurationSec)) * 100)}%`,
                        right: `${Math.max(
                          0,
                          100 -
                            ((trimEndSec ?? totalDurationSec) /
                              Math.max(0.1, totalDurationSec)) *
                              100
                        )}%`,
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={totalDurationSec}
                    step={0.1}
                    value={Math.min(previewTimeSec, totalDurationSec)}
                    onChange={(e) => setPreviewTimeSec(Number(e.target.value))}
                    aria-label="Preview timestamp scrubber"
                    className="w-full accent-accent cursor-pointer"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                    <span>
                      Current Frame: <strong className="text-primary">{formatTimePrecise(previewTimeSec)}</strong> ({previewTimeSec.toFixed(1)}s)
                    </span>
                    <span>
                      Total: {formatTimePrecise(totalDurationSec)} • Trimmed Output:{" "}
                      <strong className="text-accent">{formatTimePrecise(trimmedDurationSec)}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const nextStart = Math.round(previewTimeSec * 10) / 10;
                      setTrimStartSec(nextStart);
                      if (trimEndSec != null && trimEndSec <= nextStart) {
                        setTrimEndSec(Math.min(totalDurationSec, nextStart + 1));
                      }
                    }}
                  >
                    Set Start to Current
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const nextEnd = Math.round(previewTimeSec * 10) / 10;
                      setTrimEndSec(nextEnd);
                      if (trimStartSec != null && trimStartSec >= nextEnd) {
                        setTrimStartSec(Math.max(0, nextEnd - 1));
                      }
                    }}
                  >
                    Set End to Current
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const draft = buildDraftOptions();
                      if (draft) void fetchPreview(job, draft, previewTimeSec);
                    }}
                    disabled={loading}
                  >
                    Preview Frame
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleResetTrim}>
                    Reset Trim
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs">
                  <span className="text-muted">Trim Start (sec)</span>
                  <Input
                    type="number"
                    aria-label="Trim Start Seconds"
                    min={0}
                    max={totalDurationSec}
                    step={0.1}
                    value={trimStartSec ?? 0}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value) || 0);
                      setTrimStartSec(val > 0 ? val : undefined);
                    }}
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted">Trim End (sec, blank = end)</span>
                  <Input
                    type="number"
                    aria-label="Trim End Seconds"
                    min={0}
                    max={totalDurationSec}
                    step={0.1}
                    placeholder={totalDurationSec.toFixed(1)}
                    value={trimEndSec ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (!raw) {
                        setTrimEndSec(undefined);
                      } else {
                        const val = Math.max(0, Math.min(totalDurationSec, Number(raw) || 0));
                        setTrimEndSec(val);
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-border bg-elevated/40">
          {isCompareOnly ? (
            <div className="min-w-0 flex-1 text-xs text-muted truncate" title={job.outputPath}>
              Output: <span className="font-mono text-secondary">{job.outputPath}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {hasCustomCrop ? (
                <Badge tone="accent">
                  Crop {activeCrop.width}×{activeCrop.height} @ ({activeCrop.x},{activeCrop.y})
                </Badge>
              ) : (
                <span>No crop applied</span>
              )}
              {hasTrim && (
                <Badge tone="accent">
                  Trim {Number(trimStartSec ?? 0).toFixed(1)}s–{Number(trimEndSec ?? totalDurationSec).toFixed(1)}s
                </Badge>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button variant={hasPendingEdits ? "ghost" : "primary"} onClick={() => setPreviewJobId(null)}>
              Close
            </Button>
            {hasPendingEdits && (
              <Button variant="primary" onClick={handleApplyToQueue}>
                Apply to Queue Options
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
