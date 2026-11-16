import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, FolderOpen } from "lucide-react";
import { PresetHeader } from "@/components/settings/PresetHeader";
import {
  Badge,
  Button,
  FieldLabel,
  Input,
  Select,
  SwitchToggle,
} from "@/components/ui/Primitives";
import * as tauri from "@/lib/tauri";
import { cn, nextAutoNamingPattern } from "@/lib/utils";
import { useJobStore } from "@/stores/jobStore";
import type { ImageOptions } from "@/types";

type ImageTaskMode = "compress" | "convert" | "resize";

const QUICK_CONVERT_FORMATS: { value: ImageOptions["outputFormat"]; label: string }[] = [
  { value: "webp", label: "WebP" },
  { value: "jpg", label: "JPG" },
  { value: "png", label: "PNG" },
  { value: "avif", label: "AVIF" },
  { value: "gif", label: "GIF" },
  { value: "tiff", label: "TIFF" },
];

export function ImageSettingsPanel() {
  const {
    imageJobs,
    selectedJobId,
    setPreviewJobId,
    imageOptions,
    activeImagePresetId,
    updateImageOptions,
  } = useJobStore();

  const [taskMode, setTaskMode] = useState<ImageTaskMode>(
    imageOptions.outputFormat !== "original" ? "convert" : "compress"
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasPng = imageJobs.some((j) => /\.(png|bmp)$/i.test(j.fileName));
  const hasLossy =
    imageJobs.some((j) => /\.(jpe?g|webp|avif)$/i.test(j.fileName)) || !hasPng;

  const hasResizeOrCropEdits =
    imageOptions.resizeMode !== "none" ||
    imageOptions.cropWidth != null ||
    imageOptions.rotate !== 0 ||
    imageOptions.flipHorizontal ||
    imageOptions.flipVertical;

  const handleSelectMode = (mode: ImageTaskMode) => {
    setTaskMode(mode);
    const nextPattern = nextAutoNamingPattern(imageOptions.namingPattern, mode);
    const patch: Partial<ImageOptions> = nextPattern ? { namingPattern: nextPattern } : {};
    if (mode === "compress" && imageOptions.outputFormat !== "original") {
      patch.outputFormat = "original";
    } else if (mode === "convert" && imageOptions.outputFormat === "original") {
      patch.outputFormat = "webp";
    }
    if (Object.keys(patch).length > 0) {
      void updateImageOptions(patch);
    }
  };

  const handlePickOutputDir = async () => {
    const dir = await tauri.pickFolder();
    if (dir) void updateImageOptions({ outputDir: dir });
  };

  return (
    <aside
      aria-label="Image Settings"
      className="w-full lg:w-[340px] shrink-0 min-h-0 rounded-md border border-border bg-surface shadow-card p-4 flex flex-col gap-3.5 overflow-y-auto"
    >
      <h3 className="text-sm font-semibold text-primary">Settings</h3>
      <PresetHeader
        mediaType="image"
        activePresetId={activeImagePresetId}
        onSelectPreset={(preset) => {
          const nextOpts = preset.options as ImageOptions;
          void updateImageOptions(nextOpts, preset.id);
          setTaskMode(nextOpts.outputFormat !== "original" ? "convert" : "compress");
        }}
      />

      <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            What do you want to do?
          </p>
          <div className="grid grid-cols-3 gap-1 rounded-sm bg-elevated p-1 border border-border neu-segmented">
            <button
              type="button"
              onClick={() => handleSelectMode("compress")}
              className={cn(
                "px-2 py-1.5 rounded-sm text-xs font-medium transition-colors text-center",
                taskMode === "compress"
                  ? "bg-accent text-white shadow-sm neu-tab-active"
                  : "text-secondary hover:text-primary"
              )}
            >
              Compress
            </button>
            <button
              type="button"
              onClick={() => handleSelectMode("convert")}
              className={cn(
                "px-2 py-1.5 rounded-sm text-xs font-medium transition-colors text-center flex items-center justify-center gap-1",
                taskMode === "convert"
                  ? "bg-accent text-white shadow-sm neu-tab-active"
                  : "text-secondary hover:text-primary"
              )}
            >
              <span>Convert</span>
              {imageOptions.outputFormat !== "original" && taskMode !== "convert" && (
                <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleSelectMode("resize")}
              className={cn(
                "px-1.5 py-1.5 rounded-sm text-xs font-medium transition-colors text-center flex items-center justify-center gap-1",
                taskMode === "resize"
                  ? "bg-accent text-white shadow-sm neu-tab-active"
                  : "text-secondary hover:text-primary"
              )}
            >
              <span>Resize &amp; Crop</span>
              {hasResizeOrCropEdits && taskMode !== "resize" && (
                <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
              )}
            </button>
          </div>
        </div>

        {taskMode === "compress" && (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              Keep original file format and reduce file size.
            </p>

            {(hasLossy || !hasPng) && (
              <div>
                <FieldLabel htmlFor="img-quality" hint={`${imageOptions.quality}%`}>
                  Compression Quality
                </FieldLabel>
                <input
                  id="img-quality"
                  type="range"
                  min={1}
                  max={100}
                  value={imageOptions.quality}
                  onChange={(e) =>
                    void updateImageOptions({ quality: Number(e.target.value) })
                  }
                  style={{ "--slider-pct": `${((imageOptions.quality - 1) / 99) * 100}%` } as React.CSSProperties}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            )}

            {hasPng && (
              <div>
                <FieldLabel
                  htmlFor="img-png-level"
                  hint={`Level ${imageOptions.pngOptimizationLevel}`}
                >
                  OxiPNG Optimization Level
                </FieldLabel>
                <input
                  id="img-png-level"
                  type="range"
                  min={0}
                  max={6}
                  value={imageOptions.pngOptimizationLevel}
                  onChange={(e) =>
                    void updateImageOptions({
                      pngOptimizationLevel: Number(e.target.value),
                    })
                  }
                  style={{ "--slider-pct": `${(imageOptions.pngOptimizationLevel / 6) * 100}%` } as React.CSSProperties}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            )}

            <SwitchToggle
              id="img-lossless"
              checked={imageOptions.lossless}
              onChange={(v) => void updateImageOptions({ lossless: v })}
              label="Lossless Mode"
            />
          </div>
        )}

        {taskMode === "convert" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-secondary block">
                Target Format
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {QUICK_CONVERT_FORMATS.map((fmt) => (
                  <button
                    key={fmt.value}
                    type="button"
                    onClick={() => void updateImageOptions({ outputFormat: fmt.value })}
                    className={cn(
                      "px-2 py-1.5 rounded-sm border text-xs font-medium transition-colors",
                      imageOptions.outputFormat === fmt.value
                        ? "border-accent bg-accent/15 text-accent neu-box-inset"
                        : "border-border bg-elevated/50 text-secondary hover:text-primary neu-btn-raised"
                    )}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            {(imageOptions.outputFormat === "jpg" ||
              imageOptions.outputFormat === "webp" ||
              imageOptions.outputFormat === "avif") && (
              <div>
                <FieldLabel htmlFor="img-quality" hint={`${imageOptions.quality}%`}>
                  Quality
                </FieldLabel>
                <input
                  id="img-quality"
                  type="range"
                  min={1}
                  max={100}
                  value={imageOptions.quality}
                  onChange={(e) =>
                    void updateImageOptions({ quality: Number(e.target.value) })
                  }
                  style={{ "--slider-pct": `${((imageOptions.quality - 1) / 99) * 100}%` } as React.CSSProperties}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            )}

            {imageOptions.outputFormat === "png" && (
              <div>
                <FieldLabel
                  htmlFor="img-png-level"
                  hint={`Level ${imageOptions.pngOptimizationLevel}`}
                >
                  OxiPNG Optimization Level
                </FieldLabel>
                <input
                  id="img-png-level"
                  type="range"
                  min={0}
                  max={6}
                  value={imageOptions.pngOptimizationLevel}
                  onChange={(e) =>
                    void updateImageOptions({
                      pngOptimizationLevel: Number(e.target.value),
                    })
                  }
                  style={{ "--slider-pct": `${(imageOptions.pngOptimizationLevel / 6) * 100}%` } as React.CSSProperties}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            )}

            {(imageOptions.outputFormat === "png" ||
              imageOptions.outputFormat === "webp" ||
              imageOptions.outputFormat === "avif") && (
              <SwitchToggle
                id="img-lossless"
                checked={imageOptions.lossless}
                onChange={(v) => void updateImageOptions({ lossless: v })}
                label="Lossless Mode"
              />
            )}
          </div>
        )}

        {taskMode === "resize" && (
          <div className="space-y-3">
            <div>
              <FieldLabel htmlFor="img-resize">Resize Mode</FieldLabel>
              <Select
                id="img-resize"
                value={imageOptions.resizeMode}
                onChange={(e) =>
                  void updateImageOptions({
                    resizeMode: e.target.value as ImageOptions["resizeMode"],
                  })
                }
              >
                <option value="none">Keep Original Dimensions</option>
                <option value="dimensions">Target Width / Height (px)</option>
                <option value="percentage">Scale by Percentage (%)</option>
              </Select>
            </div>

            {imageOptions.resizeMode === "dimensions" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel htmlFor="img-w">Width (px)</FieldLabel>
                    <Input
                      id="img-w"
                      type="number"
                      min={1}
                      placeholder="Auto"
                      value={imageOptions.targetWidth ?? ""}
                      onChange={(e) =>
                        void updateImageOptions({
                          targetWidth: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="img-h">Height (px)</FieldLabel>
                    <Input
                      id="img-h"
                      type="number"
                      min={1}
                      placeholder="Auto"
                      value={imageOptions.targetHeight ?? ""}
                      onChange={(e) =>
                        void updateImageOptions({
                          targetHeight: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                </div>
                <SwitchToggle
                  id="img-aspect"
                  checked={imageOptions.keepAspectRatio}
                  onChange={(v) => void updateImageOptions({ keepAspectRatio: v })}
                  label="Keep Aspect Ratio"
                />
              </>
            )}

            {imageOptions.resizeMode === "percentage" && (
              <div>
                <FieldLabel
                  htmlFor="img-pct"
                  hint={`${imageOptions.resizePercentage ?? 50}%`}
                >
                  Scale Percentage
                </FieldLabel>
                <input
                  id="img-pct"
                  type="range"
                  min={10}
                  max={200}
                  step={5}
                  value={imageOptions.resizePercentage ?? 50}
                  onChange={(e) =>
                    void updateImageOptions({
                      resizePercentage: Number(e.target.value),
                    })
                  }
                  style={{ "--slider-pct": `${(((imageOptions.resizePercentage ?? 50) - 10) / 190) * 100}%` } as React.CSSProperties}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            )}

            <div className="pt-2 border-t border-border space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Visual Preview &amp; Crop
                </h4>
                {imageOptions.cropWidth != null && imageOptions.cropHeight != null && (
                  <Badge tone="accent">
                    {imageOptions.cropWidth}×{imageOptions.cropHeight}
                  </Badge>
                )}
              </div>

              <Button
                size="sm"
                variant="secondary"
                className="w-full justify-center"
                disabled={imageJobs.length === 0}
                onClick={() => {
                  const targetId = selectedJobId ?? imageJobs[0]?.id;
                  if (targetId) setPreviewJobId(targetId);
                }}
              >
                <Eye className="h-3.5 w-3.5" />
                Open Visual Preview &amp; Editor
              </Button>

              {imageOptions.cropWidth != null && imageOptions.cropHeight != null && (
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>
                    Crop @ ({imageOptions.cropX ?? 0}, {imageOptions.cropY ?? 0})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void updateImageOptions({
                        cropX: undefined,
                        cropY: undefined,
                        cropWidth: undefined,
                        cropHeight: undefined,
                      })
                    }
                    className="text-muted hover:text-primary underline"
                  >
                    Reset Crop
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2.5 pt-2 border-t border-border">
              <div>
                <FieldLabel htmlFor="img-rotate">Rotate</FieldLabel>
                <Select
                  id="img-rotate"
                  value={imageOptions.rotate}
                  onChange={(e) =>
                    void updateImageOptions({
                      rotate: Number(e.target.value) as ImageOptions["rotate"],
                    })
                  }
                >
                  <option value={0}>0°</option>
                  <option value={90}>90° CW</option>
                  <option value={180}>180°</option>
                  <option value={270}>270° CCW</option>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SwitchToggle
                  id="img-fliph"
                  checked={imageOptions.flipHorizontal}
                  onChange={(v) => void updateImageOptions({ flipHorizontal: v })}
                  label="Flip H"
                />
                <SwitchToggle
                  id="img-flipv"
                  checked={imageOptions.flipVertical}
                  onChange={(v) => void updateImageOptions({ flipVertical: v })}
                  label="Flip V"
                />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2.5 pt-3.5 border-t border-border">
          <h3 className="text-sm font-semibold text-primary">Output</h3>
          <div>
            <FieldLabel htmlFor="img-outdir">Output Folder</FieldLabel>
            <div className="flex gap-1.5">
              <Input
                id="img-outdir"
                value={imageOptions.outputDir ?? ""}
                onChange={(e) =>
                  void updateImageOptions({
                    outputDir: e.target.value || undefined,
                  })
                }
                placeholder="Same as source folder"
                className="font-mono text-xs"
              />
              <Button
                size="sm"
                onClick={() => void handlePickOutputDir()}
                title="Browse output folder"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="img-pattern" hint="{name}, {width}, {height}, {ext}">
              Naming Pattern
            </FieldLabel>
            <Input
              id="img-pattern"
              value={imageOptions.namingPattern}
              onChange={(e) =>
                void updateImageOptions({ namingPattern: e.target.value })
              }
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {[
                "{name}_compressed.{ext}",
                "{name}_converted.{ext}",
                "{name}_resized.{ext}",
                "{name}.{ext}",
              ].map((pat) => (
                <button
                  key={pat}
                  type="button"
                  onClick={() => void updateImageOptions({ namingPattern: pat })}
                  className="px-1.5 py-0.5 text-[11px] font-mono rounded-sm bg-elevated hover:bg-border-strong text-secondary border border-border neu-btn-raised"
                >
                  {pat}
                </button>
              ))}
            </div>
          </div>

          <SwitchToggle
            id="img-overwrite"
            checked={imageOptions.overwriteExisting}
            onChange={(v) => void updateImageOptions({ overwriteExisting: v })}
            label="Overwrite Existing Files"
          />
        </div>

        <div
          className={cn(
            "rounded-sm border p-3 transition-colors",
            showAdvanced
              ? "border-accent/35 bg-accent/[0.03] neu-box-inset"
              : "border-border neu-btn-raised"
          )}
        >
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted hover:text-primary"
          >
            <span>Advanced Options</span>
            {showAdvanced ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-3">
              <div>
                <FieldLabel htmlFor="img-meta">EXIF Metadata</FieldLabel>
                <Select
                  id="img-meta"
                  value={imageOptions.metadataMode}
                  onChange={(e) =>
                    void updateImageOptions({
                      metadataMode: e.target.value as ImageOptions["metadataMode"],
                    })
                  }
                >
                  <option value="keep-orientation">Keep Orientation Only</option>
                  <option value="strip-all">Strip All EXIF</option>
                  <option value="keep-all">Keep All EXIF</option>
                </Select>
              </div>

              <SwitchToggle
                id="img-gray"
                checked={imageOptions.grayscale}
                onChange={(v) => void updateImageOptions({ grayscale: v })}
                label="Grayscale"
              />
              <SwitchToggle
                id="img-prog"
                checked={imageOptions.progressiveJpeg}
                onChange={(v) => void updateImageOptions({ progressiveJpeg: v })}
                label="Progressive JPEG"
              />
              <SwitchToggle
                id="img-zopfli"
                checked={imageOptions.pngZopfli}
                onChange={(v) => void updateImageOptions({ pngZopfli: v })}
                label="PNG Zopfli (Slower, Smaller)"
              />
            </div>
          )}
        </div>
    </aside>
  );
}
