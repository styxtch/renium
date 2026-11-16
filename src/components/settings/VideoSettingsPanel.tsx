import { useState } from "react";
import { Eye, FolderOpen, FileText } from "lucide-react";
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
import { useSettingsStore } from "@/stores/settingsStore";
import type { VideoOptions } from "@/types";

type VideoTaskMode = "compress" | "convert" | "resize";

const QUICK_VIDEO_FORMATS: { value: VideoOptions["outputFormat"]; label: string }[] = [
  { value: "mp4", label: "MP4" },
  { value: "mkv", label: "MKV" },
  { value: "mov", label: "MOV" },
  { value: "webm", label: "WebM" },
  { value: "gif", label: "GIF" },
  { value: "mp3", label: "MP3" },
  { value: "aac", label: "AAC" },
];

export function VideoSettingsPanel() {
  const {
    videoJobs,
    selectedJobId,
    setPreviewJobId,
    videoOptions,
    activeVideoPresetId,
    updateVideoOptions,
  } = useJobStore();
  const { capabilities } = useSettingsStore();

  const [taskMode, setTaskMode] = useState<VideoTaskMode>("compress");

  const handleSelectMode = (mode: VideoTaskMode) => {
    setTaskMode(mode);
    const nextPattern = nextAutoNamingPattern(videoOptions.namingPattern, mode);
    if (nextPattern) {
      void updateVideoOptions({ namingPattern: nextPattern });
    }
  };

  const isAudioOnly =
    videoOptions.outputFormat === "mp3" || videoOptions.outputFormat === "aac";
  const isGif = videoOptions.outputFormat === "gif";

  const hasResizeOrTrimEdits =
    videoOptions.resolution !== "original" ||
    videoOptions.fps !== "original" ||
    videoOptions.cropWidth != null ||
    videoOptions.trimStartSec != null ||
    videoOptions.trimEndSec != null ||
    videoOptions.rotate !== 0 ||
    videoOptions.flipHorizontal ||
    videoOptions.flipVertical;

  const hwBadges: string[] = [];
  if (capabilities.hasNvenc) hwBadges.push("NVENC");
  if (capabilities.hasQsv) hwBadges.push("QSV");
  if (capabilities.hasAmf) hwBadges.push("AMF");
  if (capabilities.hasVideotoolbox) hwBadges.push("VideoToolbox");
  if (capabilities.hasVaapi) hwBadges.push("VAAPI");

  const handlePickOutputDir = async () => {
    const dir = await tauri.pickFolder();
    if (dir) void updateVideoOptions({ outputDir: dir });
  };

  const handlePickSrt = async () => {
    const srt = await tauri.pickSingleFile("Select external subtitle (.srt)", ["srt"]);
    if (srt) void updateVideoOptions({ externalSrtPath: srt });
  };

  return (
    <aside
      aria-label="Video Settings"
      className="w-full lg:w-[340px] shrink-0 min-h-0 rounded-md border border-border bg-surface shadow-card p-4 flex flex-col gap-3.5 overflow-y-auto"
    >
      <h3 className="text-sm font-semibold text-primary">Settings</h3>
      <PresetHeader
        mediaType="video"
        activePresetId={activeVideoPresetId}
        onSelectPreset={(preset) =>
          void updateVideoOptions(preset.options as VideoOptions, preset.id)
        }
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
              {videoOptions.outputFormat !== "mp4" && taskMode !== "convert" && (
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
              <span>Resize &amp; Trim</span>
              {hasResizeOrTrimEdits && taskMode !== "resize" && (
                <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
              )}
            </button>
          </div>
        </div>

        {taskMode === "compress" && (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              Reduce video file size while keeping high visual quality.
            </p>

            {!isAudioOnly && !isGif && (
              <>
                <div>
                  <FieldLabel htmlFor="vid-codec">Codec</FieldLabel>
                  <Select
                    id="vid-codec"
                    value={videoOptions.videoCodec}
                    onChange={(e) =>
                      void updateVideoOptions({
                        videoCodec: e.target.value as VideoOptions["videoCodec"],
                      })
                    }
                  >
                    <option value="h264">H.264</option>
                    <option value="h265">H.265 (HEVC)</option>
                    <option value="vp9">VP9</option>
                    <option value="av1">AV1</option>
                  </Select>
                </div>

                {videoOptions.rateControl === "crf" ? (
                  <div>
                    <FieldLabel htmlFor="vid-crf" hint={`CRF ${videoOptions.crf}`}>
                      Quality (Lower = Better)
                    </FieldLabel>
                    <input
                      id="vid-crf"
                      type="range"
                      min={14}
                      max={38}
                      value={videoOptions.crf}
                      onChange={(e) =>
                        void updateVideoOptions({ crf: Number(e.target.value) })
                      }
                      style={{ "--slider-pct": `${((videoOptions.crf - 14) / 24) * 100}%` } as React.CSSProperties}
                      className="w-full accent-[var(--accent)]"
                    />
                  </div>
                ) : (
                  <div>
                    <FieldLabel htmlFor="vid-bitrate">Target Bitrate (kbps)</FieldLabel>
                    <Input
                      id="vid-bitrate"
                      type="number"
                      min={128}
                      max={50000}
                      value={videoOptions.targetBitrateKbps ?? 2500}
                      onChange={(e) =>
                        void updateVideoOptions({
                          targetBitrateKbps: Number(e.target.value) || 2500,
                        })
                      }
                    />
                  </div>
                )}
              </>
            )}

            {isAudioOnly && (
              <div>
                <FieldLabel htmlFor="audio-bitrate">Audio Bitrate (kbps)</FieldLabel>
                <Select
                  id="audio-bitrate"
                  value={videoOptions.targetBitrateKbps ?? 192}
                  onChange={(e) =>
                    void updateVideoOptions({
                      targetBitrateKbps: Number(e.target.value),
                    })
                  }
                >
                  <option value={128}>128 kbps</option>
                  <option value={192}>192 kbps</option>
                  <option value={256}>256 kbps</option>
                  <option value={320}>320 kbps</option>
                </Select>
              </div>
            )}

            {isGif && (
              <p className="text-xs text-muted">
                Animated GIF conversion active. Adjust FPS or resolution in Resize &amp; Trim.
              </p>
            )}
          </div>
        )}

        {taskMode === "convert" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-secondary block">
                Target Format / Audio
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {QUICK_VIDEO_FORMATS.map((fmt) => (
                  <button
                    key={fmt.value}
                    type="button"
                    onClick={() => void updateVideoOptions({ outputFormat: fmt.value })}
                    className={cn(
                      "px-2 py-1.5 rounded-sm border text-xs font-medium transition-colors",
                      videoOptions.outputFormat === fmt.value
                        ? "border-accent bg-accent/15 text-accent neu-box-inset"
                        : "border-border bg-elevated/50 text-secondary hover:text-primary neu-btn-raised"
                    )}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            {!isAudioOnly && !isGif && (
              <div>
                <FieldLabel htmlFor="vid-codec">Codec</FieldLabel>
                <Select
                  id="vid-codec"
                  value={videoOptions.videoCodec}
                  onChange={(e) =>
                    void updateVideoOptions({
                      videoCodec: e.target.value as VideoOptions["videoCodec"],
                    })
                  }
                >
                  <option value="h264">H.264</option>
                  <option value="h265">H.265 (HEVC)</option>
                  <option value="vp9">VP9</option>
                  <option value="av1">AV1</option>
                </Select>
              </div>
            )}

            {isAudioOnly && (
              <div>
                <FieldLabel htmlFor="audio-bitrate">Audio Bitrate (kbps)</FieldLabel>
                <Select
                  id="audio-bitrate"
                  value={videoOptions.targetBitrateKbps ?? 192}
                  onChange={(e) =>
                    void updateVideoOptions({
                      targetBitrateKbps: Number(e.target.value),
                    })
                  }
                >
                  <option value={128}>128 kbps</option>
                  <option value={192}>192 kbps</option>
                  <option value={256}>256 kbps</option>
                  <option value={320}>320 kbps</option>
                </Select>
              </div>
            )}
          </div>
        )}

        {taskMode === "resize" && (
          <div className="space-y-3">
            {!isAudioOnly && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel htmlFor="vid-res">Resolution</FieldLabel>
                    <Select
                      id="vid-res"
                      value={videoOptions.resolution}
                      onChange={(e) =>
                        void updateVideoOptions({
                          resolution: e.target.value as VideoOptions["resolution"],
                        })
                      }
                    >
                      <option value="original">Original</option>
                      <option value="1080p">1080p</option>
                      <option value="720p">720p</option>
                      <option value="480p">480p</option>
                      <option value="custom">Custom</option>
                    </Select>
                  </div>

                  <div>
                    <FieldLabel htmlFor="vid-fps">Frame Rate</FieldLabel>
                    <Select
                      id="vid-fps"
                      value={String(videoOptions.fps)}
                      onChange={(e) => {
                        const val = e.target.value;
                        const parsed =
                          val === "original" || val === "custom" ? val : Number(val);
                        void updateVideoOptions({
                          fps: parsed as VideoOptions["fps"],
                        });
                      }}
                    >
                      <option value="original">Original</option>
                      <option value="60">60 fps</option>
                      <option value="30">30 fps</option>
                      <option value="24">24 fps</option>
                      <option value="custom">Custom</option>
                    </Select>
                  </div>
                </div>

                {videoOptions.resolution === "custom" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel htmlFor="vid-cw">Width (px)</FieldLabel>
                      <Input
                        id="vid-cw"
                        type="number"
                        placeholder="-2 (auto)"
                        value={videoOptions.customWidth ?? ""}
                        onChange={(e) =>
                          void updateVideoOptions({
                            customWidth: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="vid-ch">Height (px)</FieldLabel>
                      <Input
                        id="vid-ch"
                        type="number"
                        placeholder="-2 (auto)"
                        value={videoOptions.customHeight ?? ""}
                        onChange={(e) =>
                          void updateVideoOptions({
                            customHeight: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </div>
                  </div>
                )}

                {videoOptions.fps === "custom" && (
                  <div>
                    <FieldLabel htmlFor="vid-cfps">Custom FPS</FieldLabel>
                    <Input
                      id="vid-cfps"
                      type="number"
                      min={1}
                      max={120}
                      value={videoOptions.customFps ?? 15}
                      onChange={(e) =>
                        void updateVideoOptions({
                          customFps: Number(e.target.value) || 15,
                        })
                      }
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel htmlFor="vid-trim-start">Trim Start (s)</FieldLabel>
                    <Input
                      id="vid-trim-start"
                      type="number"
                      min={0}
                      step={0.1}
                      placeholder="0.0"
                      value={videoOptions.trimStartSec ?? ""}
                      onChange={(e) => {
                        const val = e.target.value
                          ? Math.max(0, Number(e.target.value))
                          : undefined;
                        void updateVideoOptions({ trimStartSec: val && val > 0 ? val : undefined });
                      }}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="vid-trim-end">Trim End (s)</FieldLabel>
                    <Input
                      id="vid-trim-end"
                      type="number"
                      min={0}
                      step={0.1}
                      placeholder="End"
                      value={videoOptions.trimEndSec ?? ""}
                      onChange={(e) => {
                        const val = e.target.value
                          ? Math.max(0, Number(e.target.value))
                          : undefined;
                        void updateVideoOptions({ trimEndSec: val && val > 0 ? val : undefined });
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="pt-2 border-t border-border space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Visual Preview, Crop &amp; Trim
                </h4>
                {(videoOptions.cropWidth != null ||
                  videoOptions.trimStartSec != null ||
                  videoOptions.trimEndSec != null) && (
                  <Badge tone="accent">Edited</Badge>
                )}
              </div>

              <Button
                size="sm"
                variant="secondary"
                className="w-full justify-center"
                disabled={videoJobs.length === 0}
                onClick={() => {
                  const targetId = selectedJobId ?? videoJobs[0]?.id;
                  if (targetId) setPreviewJobId(targetId);
                }}
              >
                <Eye className="h-3.5 w-3.5" />
                Open Visual Preview &amp; Editor
              </Button>

              {(videoOptions.cropWidth != null ||
                videoOptions.trimStartSec != null ||
                videoOptions.trimEndSec != null) && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {videoOptions.cropWidth != null && videoOptions.cropHeight != null && (
                    <Badge tone="neutral">
                      Crop {videoOptions.cropWidth}×{videoOptions.cropHeight}
                    </Badge>
                  )}
                  {videoOptions.cropWidth != null && (
                    <button
                      type="button"
                      onClick={() =>
                        void updateVideoOptions({
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
                  )}
                  {(videoOptions.trimStartSec != null || videoOptions.trimEndSec != null) && (
                    <button
                      type="button"
                      onClick={() =>
                        void updateVideoOptions({
                          trimStartSec: undefined,
                          trimEndSec: undefined,
                        })
                      }
                      className="text-muted hover:text-primary underline"
                    >
                      Reset Trim
                    </button>
                  )}
                </div>
              )}
            </div>

            {!isAudioOnly && !isGif && (
              <div className="space-y-2.5 pt-2 border-t border-border">
                <div>
                  <FieldLabel htmlFor="vid-rotate">Rotate</FieldLabel>
                  <Select
                    id="vid-rotate"
                    value={videoOptions.rotate}
                    onChange={(e) =>
                      void updateVideoOptions({
                        rotate: Number(e.target.value) as VideoOptions["rotate"],
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
                    id="vid-fliph"
                    checked={videoOptions.flipHorizontal}
                    onChange={(v) => void updateVideoOptions({ flipHorizontal: v })}
                    label="Flip H"
                  />
                  <SwitchToggle
                    id="vid-flipv"
                    checked={videoOptions.flipVertical}
                    onChange={(v) => void updateVideoOptions({ flipVertical: v })}
                    label="Flip V"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2.5 pt-3.5 border-t border-border">
          <h3 className="text-sm font-semibold text-primary">Output</h3>
          <div>
            <FieldLabel htmlFor="vid-outdir">Output Folder</FieldLabel>
            <div className="flex gap-1.5">
              <Input
                id="vid-outdir"
                value={videoOptions.outputDir ?? ""}
                onChange={(e) =>
                  void updateVideoOptions({
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
            <FieldLabel htmlFor="vid-pattern" hint="{name}, {ext}">
              Naming Pattern
            </FieldLabel>
            <Input
              id="vid-pattern"
              value={videoOptions.namingPattern}
              onChange={(e) =>
                void updateVideoOptions({ namingPattern: e.target.value })
              }
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {[
                "{name}_compressed.{ext}",
                "{name}_converted.{ext}",
                "{name}_resized.{ext}",
                "{name}_trimmed.{ext}",
                "{name}.{ext}",
              ].map((pat) => (
                <button
                  key={pat}
                  type="button"
                  onClick={() => void updateVideoOptions({ namingPattern: pat })}
                  className="px-1.5 py-0.5 text-[11px] font-mono rounded-sm bg-elevated hover:bg-border-strong text-secondary border border-border neu-btn-raised"
                >
                  {pat}
                </button>
              ))}
            </div>
          </div>

          <SwitchToggle
            id="vid-overwrite"
            checked={videoOptions.overwriteExisting}
            onChange={(v) => void updateVideoOptions({ overwriteExisting: v })}
            label="Overwrite Existing Files"
          />
        </div>

        <div className="space-y-3 pt-3 border-t border-border">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Encoding &amp; Subtitles
          </h4>

          {!isAudioOnly && !isGif && (
            <>
              <SwitchToggle
                id="vid-hwaccel"
                checked={videoOptions.hwAccel}
                onChange={(checked) => void updateVideoOptions({ hwAccel: checked })}
                label="Hardware Acceleration"
                description={
                  hwBadges.length > 0
                    ? `Detected: ${hwBadges.join(", ")}`
                    : "Auto-fallback to software if unavailable"
                }
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel htmlFor="vid-rate-control">Rate Control</FieldLabel>
                  <Select
                    id="vid-rate-control"
                    value={videoOptions.rateControl}
                    onChange={(e) =>
                      void updateVideoOptions({
                        rateControl: e.target.value as VideoOptions["rateControl"],
                      })
                    }
                  >
                    <option value="crf">Constant Quality (CRF)</option>
                    <option value="bitrate">Target Bitrate</option>
                    <option value="two-pass">Two-Pass Bitrate</option>
                  </Select>
                </div>

                <div>
                  <FieldLabel htmlFor="vid-preset-speed">FFmpeg Speed Preset</FieldLabel>
                  <Select
                    id="vid-preset-speed"
                    value={videoOptions.encoderPreset}
                    onChange={(e) =>
                      void updateVideoOptions({
                        encoderPreset: e.target.value as VideoOptions["encoderPreset"],
                      })
                    }
                  >
                    {[
                      "ultrafast",
                      "superfast",
                      "veryfast",
                      "faster",
                      "fast",
                      "medium",
                      "slow",
                      "slower",
                      "veryslow",
                      "placebo",
                    ].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="vid-subs">Subtitles</FieldLabel>
                <Select
                  id="vid-subs"
                  value={videoOptions.subtitleMode}
                  onChange={(e) =>
                    void updateVideoOptions({
                      subtitleMode: e.target.value as VideoOptions["subtitleMode"],
                    })
                  }
                >
                  <option value="keep">Keep Tracks</option>
                  <option value="strip">Strip All</option>
                  <option value="burn-in">Burn-in (.srt)</option>
                  <option value="extract-srt">Extract .srt</option>
                </Select>
              </div>

              {videoOptions.subtitleMode === "burn-in" && (
                <div>
                  <FieldLabel htmlFor="vid-srt-path">External .srt File</FieldLabel>
                  <div className="flex gap-1.5">
                    <Input
                      id="vid-srt-path"
                      value={videoOptions.externalSrtPath ?? ""}
                      placeholder="Select subtitle file..."
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button size="sm" onClick={() => void handlePickSrt()}>
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          <SwitchToggle
            id="vid-strip-meta"
            checked={videoOptions.stripMetadata}
            onChange={(v) => void updateVideoOptions({ stripMetadata: v })}
            label="Strip Metadata"
            description="Remove tags & device metadata"
          />
        </div>
    </aside>
  );
}
