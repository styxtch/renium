import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Music, Pause, Play } from "lucide-react";
import { PresetHeader } from "@/components/settings/PresetHeader";
import {
  Button,
  FieldLabel,
  Input,
  Select,
  SwitchToggle,
} from "@/components/ui/Primitives";
import * as tauri from "@/lib/tauri";
import { cn, nextAutoNamingPattern } from "@/lib/utils";
import { useJobStore } from "@/stores/jobStore";
import type { AudioOptions } from "@/types";

type AudioSettingsTab = "audio" | "trim";

const AUDIO_FORMAT_CHOICES: { value: AudioOptions["outputFormat"]; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "mp3", label: "MP3" },
  { value: "m4a", label: "M4A" },
  { value: "aac", label: "AAC" },
  { value: "wav", label: "WAV" },
  { value: "flac", label: "FLAC" },
  { value: "ogg", label: "OGG" },
  { value: "opus", label: "OPUS" },
];

function formatTimeShort(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00.0";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

export function AudioSettingsPanel() {
  const {
    audioJobs,
    selectedJobId,
    audioOptions,
    activeAudioPresetId,
    updateAudioOptions,
  } = useJobStore();

  const [activeTab, setActiveTab] = useState<AudioSettingsTab>("audio");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playTrimOnly, setPlayTrimOnly] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);

  const selectedJob =
    audioJobs.find((j) => j.id === selectedJobId) ??
    audioJobs.find((j) => j.status === "queued") ??
    audioJobs[0];

  const durMs = selectedJob?.probeInfo?.durationMs;
  const totalDurationSec =
    durMs && durMs > 0 ? Math.round((durMs / 1000) * 10) / 10 : 60;

  useEffect(() => {
    setIsPlaying(false);
    setPlayTrimOnly(false);
    setCurrentSec(audioOptions.trimStartSec ?? 0);
  }, [selectedJob?.id]);

  const isLosslessFormat =
    audioOptions.outputFormat === "wav" || audioOptions.outputFormat === "flac";
  const hasTrimOrEffectEdits =
    audioOptions.trimStartSec != null ||
    audioOptions.trimEndSec != null ||
    (audioOptions.volumeGainDb != null && Math.abs(audioOptions.volumeGainDb) > 0.05) ||
    audioOptions.loudnessTargetLufs != null ||
    (audioOptions.fadeInSec != null && audioOptions.fadeInSec > 0) ||
    (audioOptions.fadeOutSec != null && audioOptions.fadeOutSec > 0);

  const handleSelectFormat = (fmt: AudioOptions["outputFormat"]) => {
    const nextPattern = nextAutoNamingPattern(
      audioOptions.namingPattern,
      fmt === "original" ? "compress" : "convert"
    );
    void updateAudioOptions({
      outputFormat: fmt,
      ...(nextPattern ? { namingPattern: nextPattern } : {}),
    });
  };

  const handleSwitchTab = (tab: AudioSettingsTab) => {
    setActiveTab(tab);
    if (tab === "trim") {
      const nextPattern = nextAutoNamingPattern(audioOptions.namingPattern, "trim");
      if (nextPattern) {
        void updateAudioOptions({ namingPattern: nextPattern });
      }
    }
  };

  const audioSrc =
    selectedJob && tauri.isTauriRuntime() ? convertFileSrc(selectedJob.inputPath) : null;

  const effectiveStart = Math.max(
    0,
    Math.min(audioOptions.trimStartSec ?? 0, totalDurationSec - 0.1)
  );
  const effectiveEnd = Math.max(
    effectiveStart + 0.1,
    Math.min(audioOptions.trimEndSec ?? totalDurationSec, totalDurationSec)
  );
  const startPct = (effectiveStart / Math.max(0.1, totalDurationSec)) * 100;
  const endPct = (effectiveEnd / Math.max(0.1, totalDurationSec)) * 100;
  const playheadPct = Math.max(
    0,
    Math.min(100, (currentSec / Math.max(0.1, totalDurationSec)) * 100)
  );

  const seekAudio = (sec: number) => {
    const clamped = Math.max(0, Math.min(totalDurationSec, Math.round(sec * 10) / 10));
    setCurrentSec(clamped);
    if (audioRef.current) {
      audioRef.current.currentTime = clamped;
    }
  };

  const handleTogglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      setPlayTrimOnly(false);
      if (el.currentTime >= totalDurationSec - 0.05) {
        el.currentTime = 0;
      }
      void el.play();
    } else {
      el.pause();
      setPlayTrimOnly(false);
    }
  };

  const handlePlayTrim = () => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = effectiveStart;
    setCurrentSec(effectiveStart);
    setPlayTrimOnly(true);
    void el.play();
  };

  return (
    <aside
      aria-label="Audio Settings"
      className="w-full shrink-0 rounded-md border border-border bg-surface shadow-card p-3.5 flex flex-col gap-2.5 xl:max-h-[340px] xl:overflow-y-auto"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-accent shrink-0" />
          <h3 className="text-sm font-semibold text-primary">Audio Settings</h3>
        </div>
        <div className="flex-1 min-w-[260px] max-w-lg">
          <PresetHeader
            mediaType="audio"
            activePresetId={activeAudioPresetId}
            onSelectPreset={(preset) =>
              void updateAudioOptions(preset.options as AudioOptions, preset.id)
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-sm bg-elevated p-1 border border-border neu-segmented">
        <button
          type="button"
          onClick={() => handleSwitchTab("audio")}
          className={cn(
            "px-3 py-1 rounded-sm text-xs font-medium transition-colors",
            activeTab === "audio"
              ? "bg-accent text-white shadow-sm neu-tab-active"
              : "text-secondary hover:text-primary"
          )}
        >
          Audio
        </button>
        <button
          type="button"
          onClick={() => handleSwitchTab("trim")}
          className={cn(
            "px-3 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5",
            activeTab === "trim"
              ? "bg-accent text-white shadow-sm neu-tab-active"
              : "text-secondary hover:text-primary"
          )}
        >
          <span>Trim &amp; Effects</span>
          {hasTrimOrEffectEdits && activeTab !== "trim" && (
            <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
          )}
        </button>
      </div>

      {activeTab === "audio" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
          <div>
            <span className="text-xs font-medium text-secondary block mb-1">
              Target Format
            </span>
            <div className="grid grid-cols-4 gap-1">
              {AUDIO_FORMAT_CHOICES.map((fmt) => (
                <button
                  key={fmt.value}
                  type="button"
                  onClick={() => handleSelectFormat(fmt.value)}
                  className={cn(
                    "px-1.5 py-1 rounded-sm border text-[11px] font-medium transition-colors",
                    audioOptions.outputFormat === fmt.value
                      ? "border-accent bg-accent/15 text-accent neu-box-inset"
                      : "border-border bg-elevated/50 text-secondary hover:text-primary neu-btn-raised"
                  )}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {!isLosslessFormat ? (
              <div>
                <FieldLabel htmlFor="aud-bitrate">Audio Bitrate</FieldLabel>
                <Select
                  id="aud-bitrate"
                  value={audioOptions.bitrateKbps}
                  onChange={(e) =>
                    void updateAudioOptions({ bitrateKbps: Number(e.target.value) })
                  }
                >
                  <option value={64}>64 kbps (Voice)</option>
                  <option value={96}>96 kbps (Compact)</option>
                  <option value={128}>128 kbps (Standard)</option>
                  <option value={192}>192 kbps (Balanced)</option>
                  <option value={256}>256 kbps (High)</option>
                  <option value={320}>320 kbps (Maximum)</option>
                </Select>
              </div>
            ) : (
              <p className="text-xs text-muted pt-1">
                Lossless {audioOptions.outputFormat.toUpperCase()} preserves full audio fidelity.
              </p>
            )}

            <div>
              <FieldLabel htmlFor="aud-sr">Sample Rate</FieldLabel>
              <Select
                id="aud-sr"
                value={String(audioOptions.sampleRate)}
                onChange={(e) => {
                  const val = e.target.value;
                  void updateAudioOptions({
                    sampleRate: val === "original" ? "original" : (Number(val) as 44100 | 48000),
                  });
                }}
              >
                <option value="original">Original</option>
                <option value="44100">44.1 kHz</option>
                <option value="48000">48 kHz</option>
              </Select>
            </div>
          </div>

          <div className="space-y-2.5">
            <div>
              <FieldLabel htmlFor="aud-ch">Channels (Downmix)</FieldLabel>
              <Select
                id="aud-ch"
                value={audioOptions.channels}
                onChange={(e) =>
                  void updateAudioOptions({
                    channels: e.target.value as AudioOptions["channels"],
                  })
                }
              >
                <option value="original">Original</option>
                <option value="stereo">Stereo (2.0)</option>
                <option value="mono">Mono (1.0)</option>
              </Select>
            </div>

            <SwitchToggle
              id="aud-strip-meta"
              checked={audioOptions.stripMetadata}
              onChange={(v) => void updateAudioOptions({ stripMetadata: v })}
              label="Strip ID3 / Tags Metadata"
            />
          </div>
        </div>
      )}

      {activeTab === "trim" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          <div className="space-y-2">
            {audioSrc && (
              <audio
                ref={audioRef}
                src={audioSrc}
                preload="metadata"
                onTimeUpdate={() => {
                  const el = audioRef.current;
                  if (!el) return;
                  const t = el.currentTime;
                  setCurrentSec(t);
                  if (playTrimOnly && t >= effectiveEnd) {
                    el.pause();
                    el.currentTime = effectiveEnd;
                    setPlayTrimOnly(false);
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => {
                  setIsPlaying(false);
                  setPlayTrimOnly(false);
                }}
                className="hidden"
              />
            )}

            <div className="flex items-center justify-between text-[11px] text-secondary">
              <span>Trim Range ({selectedJob?.fileName ?? "No file"})</span>
              <span className="font-mono text-accent">
                {formatTimeShort(effectiveStart)} → {formatTimeShort(effectiveEnd)}
              </span>
            </div>

            <div className="relative h-6 flex items-center select-none">
              <div className="absolute left-0 right-0 h-2 rounded-full bg-border" />
              <div
                className="absolute h-2 rounded-full bg-accent/70"
                style={{
                  left: `${startPct}%`,
                  right: `${Math.max(0, 100 - endPct)}%`,
                }}
              />
              <div
                className="absolute top-0.5 bottom-0.5 w-0.5 bg-primary/80 pointer-events-none"
                style={{ left: `${playheadPct}%` }}
              />
              <input
                type="range"
                min={0}
                max={totalDurationSec}
                step={0.1}
                value={effectiveStart}
                aria-label="Audio Trim Start Slider"
                onChange={(e) => {
                  const val = Math.min(
                    Number(e.target.value),
                    Math.round((effectiveEnd - 0.1) * 10) / 10
                  );
                  void updateAudioOptions({ trimStartSec: Math.max(0, val) });
                  seekAudio(Math.max(0, val));
                }}
                className="trim-range-input absolute inset-0 w-full"
              />
              <input
                type="range"
                min={0}
                max={totalDurationSec}
                step={0.1}
                value={effectiveEnd}
                aria-label="Audio Trim End Slider"
                onChange={(e) => {
                  const val = Math.max(
                    Number(e.target.value),
                    Math.round((effectiveStart + 0.1) * 10) / 10
                  );
                  void updateAudioOptions({ trimEndSec: Math.min(totalDurationSec, val) });
                  seekAudio(Math.min(totalDurationSec, val));
                }}
                className="trim-range-input absolute inset-0 w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel htmlFor="aud-trim-start">Start (sec)</FieldLabel>
                <Input
                  id="aud-trim-start"
                  type="number"
                  min={0}
                  step={0.1}
                  value={audioOptions.trimStartSec ?? ""}
                  onChange={(e) =>
                    void updateAudioOptions({
                      trimStartSec:
                        e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                  placeholder="0.0"
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <FieldLabel htmlFor="aud-trim-end">End (sec)</FieldLabel>
                <Input
                  id="aud-trim-end"
                  type="number"
                  min={0}
                  step={0.1}
                  value={audioOptions.trimEndSec ?? ""}
                  onChange={(e) =>
                    void updateAudioOptions({
                      trimEndSec:
                        e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                  placeholder="End"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {audioSrc && (
                <>
                  <Button size="sm" variant="primary" onClick={handleTogglePlay}>
                    {isPlaying && !playTrimOnly ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    <span>{isPlaying && !playTrimOnly ? "Pause" : "Play"}</span>
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handlePlayTrim}>
                    <Play className="h-3.5 w-3.5" />
                    <span>Play Trim</span>
                  </Button>
                </>
              )}
              {(audioOptions.trimStartSec != null || audioOptions.trimEndSec != null) && (
                <button
                  type="button"
                  onClick={() =>
                    void updateAudioOptions({
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

          <div className="grid grid-cols-2 gap-2.5 items-start">
            <div>
              <FieldLabel htmlFor="aud-lufs">Loudness Target</FieldLabel>
              <Select
                id="aud-lufs"
                value={
                  audioOptions.loudnessTargetLufs != null
                    ? String(audioOptions.loudnessTargetLufs)
                    : ""
                }
                onChange={(e) =>
                  void updateAudioOptions({
                    loudnessTargetLufs:
                      e.target.value === ""
                        ? undefined
                        : (Number(e.target.value) as -14 | -16 | -23),
                  })
                }
              >
                <option value="">Off</option>
                <option value="-14">-14 LUFS (Streaming)</option>
                <option value="-16">-16 LUFS (Podcast)</option>
                <option value="-23">-23 LUFS (Broadcast)</option>
              </Select>
            </div>

            <div>
              <FieldLabel
                htmlFor="aud-gain"
                hint={`${(audioOptions.volumeGainDb ?? 0) > 0 ? "+" : ""}${
                  audioOptions.volumeGainDb ?? 0
                } dB`}
              >
                Volume Gain
              </FieldLabel>
              <input
                id="aud-gain"
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={audioOptions.volumeGainDb ?? 0}
                onChange={(e) =>
                  void updateAudioOptions({
                    volumeGainDb: Number(e.target.value) || undefined,
                  })
                }
                style={
                  {
                    "--slider-pct": `${(((audioOptions.volumeGainDb ?? 0) + 12) / 24) * 100}%`,
                  } as React.CSSProperties
                }
                className="w-full accent-[var(--accent)] mt-1.5"
              />
            </div>

            <div>
              <FieldLabel htmlFor="aud-fade-in">Fade In (sec)</FieldLabel>
              <Input
                id="aud-fade-in"
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={audioOptions.fadeInSec ?? ""}
                onChange={(e) =>
                  void updateAudioOptions({
                    fadeInSec:
                      e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                placeholder="0"
                className="font-mono text-xs"
              />
            </div>

            <div>
              <FieldLabel htmlFor="aud-fade-out">Fade Out (sec)</FieldLabel>
              <Input
                id="aud-fade-out"
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={audioOptions.fadeOutSec ?? ""}
                onChange={(e) =>
                  void updateAudioOptions({
                    fadeOutSec:
                      e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                placeholder="0"
                className="font-mono text-xs"
              />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
