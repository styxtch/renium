import { useState } from "react";
import { Eye, FileText, Film } from "lucide-react";
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

type VideoSettingsTab =
  | "video"
  | "picture"
  | "filters"
  | "audio"
  | "subtitles"
  | "advanced";

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

  const [activeTab, setActiveTab] = useState<VideoSettingsTab>("video");

  const isAudioOnly =
    videoOptions.outputFormat === "mp3" || videoOptions.outputFormat === "aac";
  const isGif = videoOptions.outputFormat === "gif";

  const hasPictureOrTrimEdits =
    videoOptions.cropWidth != null ||
    videoOptions.trimStartSec != null ||
    videoOptions.trimEndSec != null ||
    videoOptions.rotate !== 0 ||
    videoOptions.flipHorizontal ||
    videoOptions.flipVertical;

  const hasFilterEdits =
    videoOptions.fps !== "original" ||
    (videoOptions.fpsMode ?? "auto") !== "auto" ||
    (videoOptions.deinterlace ?? "none") !== "none" ||
    (videoOptions.denoise ?? "none") !== "none" ||
    (videoOptions.sharpen ?? "none") !== "none" ||
    (videoOptions.colorSpace ?? "auto") !== "auto";

  const hasAudioEdits =
    (videoOptions.audioCodec ?? "aac") !== "aac" ||
    (videoOptions.audioBitrateKbps ?? 128) !== 128 ||
    (videoOptions.audioChannels ?? "original") !== "original" ||
    videoOptions.audioTrackIndex != null;

  const hasAdvancedEdits =
    (videoOptions.encoderProfile ?? "auto") !== "auto" ||
    (videoOptions.encoderTune ?? "none") !== "none" ||
    (videoOptions.pixFmt ?? "auto") !== "auto" ||
    videoOptions.preserveChapters === false ||
    videoOptions.stripMetadata ||
    videoOptions.fastStart === false;

  const hwBadges: string[] = [];
  if (capabilities.hasNvenc) hwBadges.push("NVENC");
  if (capabilities.hasQsv) hwBadges.push("QSV");
  if (capabilities.hasAmf) hwBadges.push("AMF");
  if (capabilities.hasVideotoolbox) hwBadges.push("VideoToolbox");
  if (capabilities.hasVaapi) hwBadges.push("VAAPI");

  const handleSelectFormat = (fmt: VideoOptions["outputFormat"]) => {
    const nextPattern = nextAutoNamingPattern(
      videoOptions.namingPattern,
      fmt === "mp4" ? "compress" : "convert"
    );
    void updateVideoOptions({
      outputFormat: fmt,
      ...(nextPattern ? { namingPattern: nextPattern } : {}),
    });
  };

  const handlePickSrt = async () => {
    const srt = await tauri.pickSingleFile("Select external subtitle (.srt)", ["srt"]);
    if (srt) void updateVideoOptions({ externalSrtPath: srt });
  };

  const selectedJob = videoJobs.find((j) => j.id === selectedJobId);
  const probedAudioTracks =
    (selectedJob ?? videoJobs[0])?.probeInfo?.audioTracks ?? [];
  const previewTargetId =
    (selectedJob && selectedJob.status === "queued" ? selectedJob.id : null) ??
    videoJobs.find((j) => j.status === "queued")?.id ??
    selectedJobId ??
    videoJobs[0]?.id ??
    null;

  return (
    <aside
      aria-label="Video Settings"
      className="w-full shrink-0 rounded-md border border-border bg-surface shadow-card p-3.5 flex flex-col gap-2.5 xl:max-h-[340px] xl:overflow-y-auto"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-accent shrink-0" />
          <h3 className="text-sm font-semibold text-primary">Video Settings</h3>
        </div>
        <div className="flex-1 min-w-[260px] max-w-lg">
          <PresetHeader
            mediaType="video"
            activePresetId={activeVideoPresetId}
            onSelectPreset={(preset) =>
              void updateVideoOptions(preset.options as VideoOptions, preset.id)
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-sm bg-elevated p-1 border border-border neu-segmented">
        {(
          [
            { id: "video", label: "Video", dot: false },
            { id: "picture", label: "Picture & Trim", dot: hasPictureOrTrimEdits },
            { id: "filters", label: "Filters", dot: hasFilterEdits },
            { id: "audio", label: "Audio", dot: hasAudioEdits },
            { id: "subtitles", label: "Subtitles", dot: videoOptions.subtitleMode !== "keep" },
            { id: "advanced", label: "Advanced", dot: hasAdvancedEdits },
          ] as { id: VideoSettingsTab; label: string; dot: boolean }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-2.5 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5",
              activeTab === tab.id
                ? "bg-accent text-white shadow-sm neu-tab-active"
                : "text-secondary hover:text-primary"
            )}
          >
            <span>{tab.label}</span>
            {tab.dot && activeTab !== tab.id && (
              <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
            )}
          </button>
        ))}
      </div>

      {activeTab === "video" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
          <div className="space-y-2">
            <div>
              <span className="text-xs font-medium text-secondary block mb-1">
                Target Format / Audio
              </span>
              <div className="grid grid-cols-4 gap-1">
                {QUICK_VIDEO_FORMATS.map((fmt) => (
                  <button
                    key={fmt.value}
                    type="button"
                    onClick={() => handleSelectFormat(fmt.value)}
                    className={cn(
                      "px-1.5 py-1 rounded-sm border text-[11px] font-medium transition-colors",
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

            {!isAudioOnly && (
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
                  <option value="1080p">1080p (Full HD)</option>
                  <option value="720p">720p (HD)</option>
                  <option value="480p">480p (SD)</option>
                  <option value="custom">Custom</option>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2.5">
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
                      style={
                        {
                          "--slider-pct": `${((videoOptions.crf - 14) / 24) * 100}%`,
                        } as React.CSSProperties
                      }
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
                Animated GIF conversion active. Adjust FPS in Filters or Crop/Trim in Picture &amp; Trim.
              </p>
            )}
          </div>

          {!isAudioOnly && !isGif && (
            <div className="space-y-2.5">
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
                  <FieldLabel htmlFor="vid-preset-speed">Speed Preset</FieldLabel>
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

              <SwitchToggle
                id="vid-hwaccel"
                checked={videoOptions.hwAccel}
                onChange={(checked) => void updateVideoOptions({ hwAccel: checked })}
                label="Hardware Acceleration"
                description={
                  hwBadges.length > 0
                    ? `Detected: ${hwBadges.join(", ")}`
                    : "Auto-fallback to CPU"
                }
              />
            </div>
          )}
        </div>
      )}

      {activeTab === "picture" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          <div className="space-y-2.5">
            {videoOptions.resolution === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel htmlFor="vid-cw">Custom Width</FieldLabel>
                  <Input
                    id="vid-cw"
                    type="number"
                    min={16}
                    value={videoOptions.customWidth ?? ""}
                    onChange={(e) =>
                      void updateVideoOptions({
                        customWidth: Number(e.target.value) || undefined,
                      })
                    }
                    placeholder="Auto"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="vid-ch">Custom Height</FieldLabel>
                  <Input
                    id="vid-ch"
                    type="number"
                    min={16}
                    value={videoOptions.customHeight ?? ""}
                    onChange={(e) =>
                      void updateVideoOptions({
                        customHeight: Number(e.target.value) || undefined,
                      })
                    }
                    placeholder="Auto"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
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
                  <option value={90}>90°</option>
                  <option value={180}>180°</option>
                  <option value={270}>270°</option>
                </Select>
              </div>
              <div className="flex items-end pb-1">
                <SwitchToggle
                  id="vid-fh"
                  checked={videoOptions.flipHorizontal}
                  onChange={(v) => void updateVideoOptions({ flipHorizontal: v })}
                  label="Flip H"
                />
              </div>
              <div className="flex items-end pb-1">
                <SwitchToggle
                  id="vid-fv"
                  checked={videoOptions.flipVertical}
                  onChange={(v) => void updateVideoOptions({ flipVertical: v })}
                  label="Flip V"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!previewTargetId}
                onClick={() => {
                  if (previewTargetId) setPreviewJobId(previewTargetId, "editor");
                }}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Visual Crop &amp; Trim</span>
              </Button>
              {videoOptions.cropWidth != null && videoOptions.cropHeight != null && (
                <>
                  <Badge tone="accent">
                    Crop {videoOptions.cropWidth}×{videoOptions.cropHeight}
                  </Badge>
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
                    className="text-xs text-muted hover:text-primary underline"
                  >
                    Reset Crop
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-secondary block">
              Trim Timeline (Seconds)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel htmlFor="vid-trim-start">Start (sec)</FieldLabel>
                <Input
                  id="vid-trim-start"
                  type="number"
                  min={0}
                  step={0.1}
                  value={videoOptions.trimStartSec ?? ""}
                  onChange={(e) =>
                    void updateVideoOptions({
                      trimStartSec:
                        e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                  placeholder="0.0"
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <FieldLabel htmlFor="vid-trim-end">End (sec)</FieldLabel>
                <Input
                  id="vid-trim-end"
                  type="number"
                  min={0}
                  step={0.1}
                  value={videoOptions.trimEndSec ?? ""}
                  onChange={(e) =>
                    void updateVideoOptions({
                      trimEndSec:
                        e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                  placeholder="End"
                  className="font-mono text-xs"
                />
              </div>
            </div>
            {(videoOptions.trimStartSec != null || videoOptions.trimEndSec != null) && (
              <button
                type="button"
                onClick={() =>
                  void updateVideoOptions({
                    trimStartSec: undefined,
                    trimEndSec: undefined,
                  })
                }
                className="text-xs text-muted hover:text-primary underline"
              >
                Reset Trim
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === "filters" && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
          <div className="space-y-2">
            <div>
              <FieldLabel htmlFor="vid-fps">Frame Rate (FPS)</FieldLabel>
              <Select
                id="vid-fps"
                value={String(videoOptions.fps)}
                onChange={(e) => {
                  const v = e.target.value;
                  void updateVideoOptions({
                    fps: v === "original" || v === "custom" ? v : (Number(v) as 60 | 30 | 24),
                  });
                }}
              >
                <option value="original">Original</option>
                <option value="60">60 FPS</option>
                <option value="30">30 FPS</option>
                <option value="24">24 FPS</option>
                <option value="custom">Custom</option>
              </Select>
            </div>
            {videoOptions.fps === "custom" && (
              <div>
                <FieldLabel htmlFor="vid-cfps">Custom FPS</FieldLabel>
                <Input
                  id="vid-cfps"
                  type="number"
                  min={1}
                  max={240}
                  value={videoOptions.customFps ?? ""}
                  onChange={(e) =>
                    void updateVideoOptions({
                      customFps: Number(e.target.value) || undefined,
                    })
                  }
                  placeholder="30"
                />
              </div>
            )}
            <div>
              <FieldLabel htmlFor="vid-fps-mode">Frame Rate Mode</FieldLabel>
              <Select
                id="vid-fps-mode"
                value={videoOptions.fpsMode ?? "auto"}
                onChange={(e) =>
                  void updateVideoOptions({
                    fpsMode: e.target.value as VideoOptions["fpsMode"],
                  })
                }
              >
                <option value="auto">Auto</option>
                <option value="cfr">Constant (CFR)</option>
                <option value="vfr">Variable (VFR)</option>
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="vid-deinterlace">Deinterlace</FieldLabel>
            <Select
              id="vid-deinterlace"
              value={videoOptions.deinterlace ?? "none"}
              onChange={(e) =>
                void updateVideoOptions({
                  deinterlace: e.target.value as VideoOptions["deinterlace"],
                })
              }
            >
              <option value="none">Off</option>
              <option value="yadif">Yadif (Standard)</option>
              <option value="bwdif">Bwdif (Motion Adaptive)</option>
            </Select>
          </div>

          <div>
            <FieldLabel htmlFor="vid-denoise">Denoise (hqdn3d)</FieldLabel>
            <Select
              id="vid-denoise"
              value={videoOptions.denoise ?? "none"}
              onChange={(e) =>
                void updateVideoOptions({
                  denoise: e.target.value as VideoOptions["denoise"],
                })
              }
            >
              <option value="none">Off</option>
              <option value="light">Light</option>
              <option value="medium">Medium</option>
              <option value="strong">Strong</option>
            </Select>
          </div>

          <div className="space-y-2">
            <div>
              <FieldLabel htmlFor="vid-sharpen">Sharpen (Unsharp)</FieldLabel>
              <Select
                id="vid-sharpen"
                value={videoOptions.sharpen ?? "none"}
                onChange={(e) =>
                  void updateVideoOptions({
                    sharpen: e.target.value as VideoOptions["sharpen"],
                  })
                }
              >
                <option value="none">Off</option>
                <option value="light">Light</option>
                <option value="medium">Medium</option>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="vid-colorspace">Color Space / HDR</FieldLabel>
              <Select
                id="vid-colorspace"
                value={videoOptions.colorSpace ?? "auto"}
                onChange={(e) =>
                  void updateVideoOptions({
                    colorSpace: e.target.value as VideoOptions["colorSpace"],
                  })
                }
              >
                <option value="auto">Auto (Keep Source)</option>
                <option value="bt709">Standard SDR (BT.709)</option>
                <option value="hdr-to-sdr">HDR → SDR Tone Map</option>
              </Select>
            </div>
          </div>
        </div>
      )}

      {activeTab === "audio" && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <FieldLabel htmlFor="vid-audio-track">Audio Track</FieldLabel>
            <Select
              id="vid-audio-track"
              disabled={videoOptions.audioCodec === "none"}
              value={videoOptions.audioTrackIndex != null ? String(videoOptions.audioTrackIndex) : ""}
              onChange={(e) =>
                void updateVideoOptions({
                  audioTrackIndex:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            >
              <option value="">Default (Track 1)</option>
              {probedAudioTracks.length > 0
                ? probedAudioTracks.map((t) => {
                    const details = [
                      t.language?.toUpperCase(),
                      t.codec,
                      t.title ? `"${t.title}"` : undefined,
                    ]
                      .filter(Boolean)
                      .join(" • ");
                    return (
                      <option key={t.index} value={t.index}>
                        Track {t.index + 1}
                        {details ? ` (${details})` : ""}
                      </option>
                    );
                  })
                : [0, 1, 2, 3].map((idx) => (
                    <option key={idx} value={idx}>
                      Track {idx + 1}
                    </option>
                  ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="vid-audio-codec">Audio Codec</FieldLabel>
            <Select
              id="vid-audio-codec"
              value={videoOptions.audioCodec ?? "aac"}
              onChange={(e) =>
                void updateVideoOptions({
                  audioCodec: e.target.value as VideoOptions["audioCodec"],
                })
              }
            >
              <option value="aac">AAC (Compatible)</option>
              <option value="opus">Opus (Efficient)</option>
              <option value="mp3">MP3</option>
              <option value="copy">Passthrough (Copy)</option>
              <option value="none">No Audio (Mute)</option>
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="vid-audio-bitrate">Audio Bitrate</FieldLabel>
            <Select
              id="vid-audio-bitrate"
              disabled={
                videoOptions.audioCodec === "copy" || videoOptions.audioCodec === "none"
              }
              value={videoOptions.audioBitrateKbps ?? 128}
              onChange={(e) =>
                void updateVideoOptions({
                  audioBitrateKbps: Number(e.target.value),
                })
              }
            >
              <option value={96}>96 kbps</option>
              <option value={128}>128 kbps</option>
              <option value={192}>192 kbps</option>
              <option value={256}>256 kbps</option>
              <option value={320}>320 kbps</option>
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="vid-audio-channels">Mixdown / Channels</FieldLabel>
            <Select
              id="vid-audio-channels"
              disabled={
                videoOptions.audioCodec === "copy" || videoOptions.audioCodec === "none"
              }
              value={videoOptions.audioChannels ?? "original"}
              onChange={(e) =>
                void updateVideoOptions({
                  audioChannels: e.target.value as VideoOptions["audioChannels"],
                })
              }
            >
              <option value="original">Original</option>
              <option value="stereo">Stereo (2.0)</option>
              <option value="mono">Mono (1.0)</option>
            </Select>
          </div>
        </div>
      )}

      {activeTab === "subtitles" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
        </div>
      )}

      {activeTab === "advanced" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
          <div>
            <FieldLabel htmlFor="vid-profile">Encoder Profile</FieldLabel>
            <Select
              id="vid-profile"
              value={videoOptions.encoderProfile ?? "auto"}
              onChange={(e) =>
                void updateVideoOptions({
                  encoderProfile: e.target.value as VideoOptions["encoderProfile"],
                })
              }
            >
              <option value="auto">Auto</option>
              <option value="main">Main</option>
              <option value="high">High</option>
              <option value="main10">Main10 (10-bit)</option>
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="vid-tune">Encoder Tune (CPU)</FieldLabel>
            <Select
              id="vid-tune"
              value={videoOptions.encoderTune ?? "none"}
              onChange={(e) =>
                void updateVideoOptions({
                  encoderTune: e.target.value as VideoOptions["encoderTune"],
                })
              }
            >
              <option value="none">None</option>
              <option value="film">Film</option>
              <option value="animation">Animation</option>
              <option value="grain">Grain</option>
              <option value="fastdecode">Fast Decode</option>
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="vid-pixfmt">Pixel Format / Bit Depth</FieldLabel>
            <Select
              id="vid-pixfmt"
              value={videoOptions.pixFmt ?? "auto"}
              onChange={(e) =>
                void updateVideoOptions({
                  pixFmt: e.target.value as VideoOptions["pixFmt"],
                })
              }
            >
              <option value="auto">Auto</option>
              <option value="yuv420p">yuv420p (8-bit)</option>
              <option value="yuv420p10le">yuv420p10le (10-bit)</option>
            </Select>
          </div>

          <SwitchToggle
            id="vid-faststart"
            checked={videoOptions.fastStart !== false}
            onChange={(v) => void updateVideoOptions({ fastStart: v })}
            label="Web Optimized (faststart)"
            description="MP4/MOV instant web playback"
          />
          <SwitchToggle
            id="vid-chapters"
            checked={videoOptions.preserveChapters !== false}
            onChange={(v) => void updateVideoOptions({ preserveChapters: v })}
            label="Preserve Chapters"
            description="Keep source chapter markers"
          />
          <SwitchToggle
            id="vid-strip-meta"
            checked={videoOptions.stripMetadata}
            onChange={(v) => void updateVideoOptions({ stripMetadata: v })}
            label="Strip Metadata"
            description="Remove tags & device metadata"
          />
        </div>
      )}
    </aside>
  );
}
