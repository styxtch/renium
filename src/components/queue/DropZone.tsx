import { useEffect, useRef, useState } from "react";
import { FolderPlus, FilePlus2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Primitives";
import * as tauri from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useJobStore } from "@/stores/jobStore";
import type { MediaType } from "@/types";

export function DropZone({
  mediaType,
  fullHeight = false,
}: {
  mediaType: MediaType;
  fullHeight?: boolean;
}) {
  const { addFiles } = useJobStore();
  const [isDragging, setIsDragging] = useState(false);
  const lastNativeDropRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;

    void tauri
      .onNativeDragDrop(
        () => mounted && setIsDragging(true),
        () => mounted && setIsDragging(false),
        (paths) => {
          if (!mounted) return;
          lastNativeDropRef.current = Date.now();
          const currentTab = useJobStore.getState().activeTab;
          if (currentTab === mediaType) {
            void addFiles(paths, mediaType);
          }
        }
      )
      .then((fn) => {
        if (!mounted) {
          fn();
        } else {
          unlisten = fn;
        }
      });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [addFiles, mediaType]);

  const handleBrowseFiles = async () => {
    const files = await tauri.pickMediaFiles(mediaType);
    if (files.length > 0) {
      await addFiles(files, mediaType);
    }
  };

  const handleBrowseFolder = async () => {
    const folder = await tauri.pickFolder();
    if (folder) {
      await addFiles([folder], mediaType);
    }
  };

  const handleHtmlDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (Date.now() - lastNativeDropRef.current <= 500) return;
    if (e.dataTransfer.files?.length) {
      const paths = Array.from(e.dataTransfer.files).map(
        (f) => (f as File & { path?: string }).path || f.name
      );
      void addFiles(paths, mediaType);
    }
  };

  const isVideo = mediaType === "video";
  const isAudio = mediaType === "audio";
  const dropTitle = isVideo
    ? "Drop video files or folders here"
    : isAudio
      ? "Drop audio files or folders here"
      : "Drop images or folders here";
  const dropSubtitle = isVideo
    ? "Supports MP4, MKV, MOV, AVI, WebM, FLV, TS, M4V, WMV, 3GP"
    : isAudio
      ? "Supports MP3, WAV, FLAC, M4A, AAC, OGG, OPUS, WMA, AIFF"
      : "Supports JPG, PNG, WebP, AVIF, GIF, BMP, TIFF";

  if (!fullHeight) {
    return (
      <div className="rounded-md border border-border bg-surface shadow-card p-3 shrink-0">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleHtmlDrop}
          className={cn(
            "relative overflow-hidden rounded-sm border-2 border-dashed px-6 py-6 min-h-[144px] transition-all duration-150 flex flex-col items-center justify-center text-center gap-3",
            isDragging
              ? "border-accent bg-accent/15 shadow-[0_0_0_3px_rgba(31,94,255,0.15)]"
              : "border-accent/45 bg-accent/[0.07] hover:border-accent/75 hover:bg-accent/[0.11]"
          )}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 600 160"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <path
              fill="rgb(var(--accent-rgb) / 0.05)"
              d="M0,108 C130,68 255,142 405,94 C495,66 555,86 600,72 L600,160 L0,160 Z"
            />
            <path
              fill="rgb(var(--accent-rgb) / 0.04)"
              d="M0,128 C160,104 290,152 445,112 C515,94 565,104 600,98 L600,160 L0,160 Z"
            />
          </svg>

          <div className="relative z-10 h-10 w-10 rounded-full bg-surface border border-accent/25 shadow-sm flex items-center justify-center text-accent shrink-0">
            <UploadCloud className="h-5 w-5" />
          </div>

          <div className="relative z-10 space-y-0.5">
            <p className="text-sm font-medium text-primary">
              {dropTitle}
            </p>
            <p className="text-xs text-muted">
              {dropSubtitle}
            </p>
          </div>

          <div className="relative z-10 flex flex-wrap items-center justify-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => void handleBrowseFiles()}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              <span>Add Files</span>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void handleBrowseFolder()}>
              <FolderPlus className="h-3.5 w-3.5" />
              <span>Add Folder</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface shadow-card p-4 flex-1 min-h-[320px] flex flex-col">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleHtmlDrop}
        className={cn(
          "relative overflow-hidden rounded-sm border-2 border-dashed transition-all duration-150 flex flex-col items-center justify-center text-center flex-1 p-10 gap-3",
          isDragging
            ? "border-accent bg-accent/15 shadow-[0_0_0_3px_rgba(31,94,255,0.15)]"
            : "border-accent/45 bg-accent/[0.07] hover:border-accent/75 hover:bg-accent/[0.11]"
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 600 160"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <path
            fill="rgb(var(--accent-rgb) / 0.05)"
            d="M0,108 C130,68 255,142 405,94 C495,66 555,86 600,72 L600,160 L0,160 Z"
          />
          <path
            fill="rgb(var(--accent-rgb) / 0.04)"
            d="M0,128 C160,104 290,152 445,112 C515,94 565,104 600,98 L600,160 L0,160 Z"
          />
        </svg>

        <div className="relative z-10 h-10 w-10 rounded-full bg-surface border border-accent/25 shadow-sm flex items-center justify-center text-accent">
          <UploadCloud className="h-5 w-5" />
        </div>

        <div className="relative z-10 space-y-1">
          <p className="text-sm font-medium text-primary">
            {dropTitle}
          </p>
          <p className="text-xs text-muted">
            {dropSubtitle}
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center justify-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() => void handleBrowseFiles()}
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            <span>Add Files</span>
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void handleBrowseFolder()}>
            <FolderPlus className="h-3.5 w-3.5" />
            <span>Add Folder</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
