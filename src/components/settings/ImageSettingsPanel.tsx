import { useState } from "react";
import { Eye, Image as ImageIcon } from "lucide-react";
import { PresetHeader } from "@/components/settings/PresetHeader";
import {
  Badge,
  Button,
  FieldLabel,
  Input,
  Select,
  SwitchToggle,
} from "@/components/ui/Primitives";
import { cn, nextAutoNamingPattern } from "@/lib/utils";
import { useJobStore } from "@/stores/jobStore";
import type { ImageOptions } from "@/types";

type ImageSettingsTab = "image" | "resize";

const IMAGE_FORMAT_CHOICES: { value: ImageOptions["outputFormat"]; label: string }[] = [
  { value: "original", label: "Original" },
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

  const [activeTab, setActiveTab] = useState<ImageSettingsTab>("image");

  const hasPng = imageJobs.some((j) => /\.(png|bmp)$/i.test(j.fileName));
  const hasLossy =
    imageJobs.some((j) => /\.(jpe?g|webp|avif)$/i.test(j.fileName)) || !hasPng;

  const showLossyControls =
    imageOptions.outputFormat === "jpg" ||
    imageOptions.outputFormat === "webp" ||
    imageOptions.outputFormat === "avif" ||
    (imageOptions.outputFormat === "original" && hasLossy);

  const showPngControls =
    imageOptions.outputFormat === "png" ||
    (imageOptions.outputFormat === "original" && hasPng);

  const hasResizeOrCropEdits =
    imageOptions.resizeMode !== "none" ||
    imageOptions.cropWidth != null ||
    imageOptions.rotate !== 0 ||
    imageOptions.flipHorizontal ||
    imageOptions.flipVertical ||
    imageOptions.grayscale;

  const handleSelectFormat = (fmt: ImageOptions["outputFormat"]) => {
    const nextPattern = nextAutoNamingPattern(
      imageOptions.namingPattern,
      fmt === "original" ? "compress" : "convert"
    );
    void updateImageOptions({
      outputFormat: fmt,
      ...(nextPattern ? { namingPattern: nextPattern } : {}),
    });
  };

  const handleSwitchTab = (tab: ImageSettingsTab) => {
    setActiveTab(tab);
    if (tab === "resize") {
      const nextPattern = nextAutoNamingPattern(imageOptions.namingPattern, "resize");
      if (nextPattern) {
        void updateImageOptions({ namingPattern: nextPattern });
      }
    }
  };

  const selectedJob = imageJobs.find((j) => j.id === selectedJobId);
  const targetId =
    (selectedJob && selectedJob.status === "queued" ? selectedJob.id : null) ??
    imageJobs.find((j) => j.status === "queued")?.id ??
    selectedJobId ??
    imageJobs[0]?.id ??
    null;

  return (
    <aside
      aria-label="Image Settings"
      className="w-full shrink-0 rounded-md border border-border bg-surface shadow-card p-3.5 flex flex-col gap-2.5 xl:max-h-[340px] xl:overflow-y-auto"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-accent shrink-0" />
          <h3 className="text-sm font-semibold text-primary">Image Settings</h3>
        </div>
        <div className="flex-1 min-w-[260px] max-w-lg">
          <PresetHeader
            mediaType="image"
            activePresetId={activeImagePresetId}
            onSelectPreset={(preset) =>
              void updateImageOptions(preset.options as ImageOptions, preset.id)
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-sm bg-elevated p-1 border border-border neu-segmented">
        <button
          type="button"
          onClick={() => handleSwitchTab("image")}
          className={cn(
            "px-3 py-1 rounded-sm text-xs font-medium transition-colors",
            activeTab === "image"
              ? "bg-accent text-white shadow-sm neu-tab-active"
              : "text-secondary hover:text-primary"
          )}
        >
          Image
        </button>
        <button
          type="button"
          onClick={() => handleSwitchTab("resize")}
          className={cn(
            "px-3 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5",
            activeTab === "resize"
              ? "bg-accent text-white shadow-sm neu-tab-active"
              : "text-secondary hover:text-primary"
          )}
        >
          <span>Resize &amp; Crop</span>
          {hasResizeOrCropEdits && activeTab !== "resize" && (
            <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
          )}
        </button>
      </div>

      {activeTab === "image" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
          <div>
            <span className="text-xs font-medium text-secondary block mb-1">
              Target Format
            </span>
            <div className="grid grid-cols-4 gap-1">
              {IMAGE_FORMAT_CHOICES.map((fmt) => (
                <button
                  key={fmt.value}
                  type="button"
                  onClick={() => handleSelectFormat(fmt.value)}
                  className={cn(
                    "px-1.5 py-1 rounded-sm border text-[11px] font-medium transition-colors",
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

          <div className="space-y-2.5">
            {showLossyControls && (
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
                  style={
                    {
                      "--slider-pct": `${((imageOptions.quality - 1) / 99) * 100}%`,
                    } as React.CSSProperties
                  }
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            )}

            {showPngControls && (
              <div className="space-y-2">
                <div>
                  <FieldLabel
                    htmlFor="img-png-opt"
                    hint={`Level ${imageOptions.pngOptimizationLevel}`}
                  >
                    PNG Optimization (OxiPNG)
                  </FieldLabel>
                  <input
                    id="img-png-opt"
                    type="range"
                    min={0}
                    max={6}
                    value={imageOptions.pngOptimizationLevel}
                    onChange={(e) =>
                      void updateImageOptions({
                        pngOptimizationLevel: Number(e.target.value),
                      })
                    }
                    style={
                      {
                        "--slider-pct": `${(imageOptions.pngOptimizationLevel / 6) * 100}%`,
                      } as React.CSSProperties
                    }
                    className="w-full accent-[var(--accent)]"
                  />
                </div>
                <SwitchToggle
                  id="img-zopfli"
                  checked={imageOptions.pngZopfli}
                  onChange={(v) => void updateImageOptions({ pngZopfli: v })}
                  label="Extreme PNG (Zopfli)"
                  description="Smaller PNG, slower"
                />
              </div>
            )}

            {(imageOptions.outputFormat === "webp" ||
              imageOptions.outputFormat === "avif") && (
              <SwitchToggle
                id="img-lossless"
                checked={imageOptions.lossless}
                onChange={(v) => void updateImageOptions({ lossless: v })}
                label="Lossless Mode"
              />
            )}
          </div>

          <div className="space-y-2.5">
            <div>
              <FieldLabel htmlFor="img-meta">Metadata (EXIF)</FieldLabel>
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
                <option value="strip-all">Strip All Metadata</option>
                <option value="keep-all">Keep All Metadata</option>
              </Select>
            </div>

            {showLossyControls && (
              <SwitchToggle
                id="img-prog"
                checked={imageOptions.progressiveJpeg}
                onChange={(v) => void updateImageOptions({ progressiveJpeg: v })}
                label="Progressive JPEG"
              />
            )}
          </div>
        </div>
      )}

      {activeTab === "resize" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          <div className="space-y-2">
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
                <option value="none">None (Original Size)</option>
                <option value="dimensions">Target Dimensions (px)</option>
                <option value="percentage">Percentage (%)</option>
              </Select>
            </div>

            {imageOptions.resizeMode === "dimensions" && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel htmlFor="img-w">Width</FieldLabel>
                    <Input
                      id="img-w"
                      type="number"
                      min={1}
                      value={imageOptions.targetWidth ?? ""}
                      onChange={(e) =>
                        void updateImageOptions({
                          targetWidth: Number(e.target.value) || undefined,
                        })
                      }
                      placeholder="Auto"
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="img-h">Height</FieldLabel>
                    <Input
                      id="img-h"
                      type="number"
                      min={1}
                      value={imageOptions.targetHeight ?? ""}
                      onChange={(e) =>
                        void updateImageOptions({
                          targetHeight: Number(e.target.value) || undefined,
                        })
                      }
                      placeholder="Auto"
                    />
                  </div>
                </div>
                <SwitchToggle
                  id="img-aspect"
                  checked={imageOptions.keepAspectRatio}
                  onChange={(v) => void updateImageOptions({ keepAspectRatio: v })}
                  label="Keep Aspect Ratio"
                />
              </div>
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
                  max={100}
                  value={imageOptions.resizePercentage ?? 50}
                  onChange={(e) =>
                    void updateImageOptions({
                      resizePercentage: Number(e.target.value),
                    })
                  }
                  style={
                    {
                      "--slider-pct": `${(((imageOptions.resizePercentage ?? 50) - 10) / 90) * 100}%`,
                    } as React.CSSProperties
                  }
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <FieldLabel htmlFor="img-rot">Rotate</FieldLabel>
                <Select
                  id="img-rot"
                  value={imageOptions.rotate}
                  onChange={(e) =>
                    void updateImageOptions({
                      rotate: Number(e.target.value) as ImageOptions["rotate"],
                    })
                  }
                >
                  <option value={0}>0°</option>
                  <option value={90}>90°</option>
                  <option value={180}>180°</option>
                  <option value={270}>270°</option>
                </Select>
              </div>
              <div className="flex items-end pb-1">
                <SwitchToggle
                  id="img-fh"
                  checked={imageOptions.flipHorizontal}
                  onChange={(v) => void updateImageOptions({ flipHorizontal: v })}
                  label="Flip H"
                />
              </div>
              <div className="flex items-end pb-1">
                <SwitchToggle
                  id="img-fv"
                  checked={imageOptions.flipVertical}
                  onChange={(v) => void updateImageOptions({ flipVertical: v })}
                  label="Flip V"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <SwitchToggle
                id="img-gray"
                checked={imageOptions.grayscale}
                onChange={(v) => void updateImageOptions({ grayscale: v })}
                label="Grayscale"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!targetId}
                onClick={() => {
                  if (targetId) setPreviewJobId(targetId, "editor");
                }}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Visual Crop</span>
              </Button>
            </div>

            {imageOptions.cropWidth != null && imageOptions.cropHeight != null && (
              <div className="flex items-center gap-2">
                <Badge tone="accent">
                  Crop {imageOptions.cropWidth}×{imageOptions.cropHeight}
                </Badge>
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
                  className="text-xs text-muted hover:text-primary underline"
                >
                  Reset Crop
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
