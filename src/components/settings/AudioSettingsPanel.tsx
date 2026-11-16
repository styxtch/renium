import { useState } from "react";
import { FolderOpen } from "lucide-react";
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

type AudioTaskMode = "compress" | "convert" | "trim";

const QUICK_AUDIO_FORMATS: { value: AudioOptions["outputFormat"]; label: string }[] = [
  { value: "mp3", label: "MP3" },
  { value: "m4a", label: "M4A" },
  { value: "aac", label: "AAC" },
  { value: "wav", label: "WAV" },
  { value: "flac", label: "FLAC" },
  { value: "ogg", label: "OGG" },
];

export function AudioSettingsPanel() {
  const { audioOptions, activeAudioPresetId, updateAudioOptions } = useJobStore();

  const [taskMode, setTaskMode] = useState<AudioTaskMode>(
    audioOptions.outputFormat !== "original" ? "convert" : "compress"
  );

  const isLosslessFormat =
    audioOptions.outputFormat === "wav" || audioOptions.outputFormat === "flac";
  const hasTrimEdits =
    audioOptions.trimStartSec != null || audioOptions.trimEndSec != null;

  const handleSelectMode = (mode: AudioTaskMode) => {
    setTaskMode(mode);
    const nextPattern = nextAutoNamingPattern(audioOptions.namingPattern, mode);
    const patch: Partial<AudioOptions> = nextPattern ? { namingPattern: nextPattern } : {};
    if (mode === "compress" && audioOptions.outputFormat !== "original") {
      patch.outputFormat = "original";
    } else if (mode === "convert" && audioOptions.outputFormat === "original") {
      patch.outputFormat = "mp3";
    }
    if (Object.keys(patch).length > 0) {
      void updateAudioOptions(patch);
    }
  };

  const handlePickOutputDir = async () => {
    const dir = await tauri.pickFolder();
    if (dir) void updateAudioOptions({ outputDir: dir });
  };

  return (
    <aside
      aria-label="Audio Settings"
      className="w-full lg:w-[340px] shrink-0 min-h-0 rounded-md border border-border bg-surface shadow-card p-4 flex flex-col gap-3.5 overflow-y-auto"
    >
      <h3 className="text-sm font-semibold text-primary">Settings</h3>
      <PresetHeader
        mediaType="audio"
        activePresetId={activeAudioPresetId}
        onSelectPreset={(preset) => {
          const nextOpts = preset.options as AudioOptions;
          void updateAudioOptions(nextOpts, preset.id);
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
            {audioOptions.outputFormat !== "original" && taskMode !== "convert" && (
              <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSelectMode("trim")}
            className={cn(
              "px-2 py-1.5 rounded-sm text-xs font-medium transition-colors text-center flex items-center justify-center gap-1",
              taskMode === "trim"
                ? "bg-accent text-white shadow-sm neu-tab-active"
                : "text-secondary hover:text-primary"
            )}
          >
            <span>Trim</span>
            {hasTrimEdits && taskMode !== "trim" && (
              <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
            )}
          </button>
        </div>
      </div>

      {taskMode === "compress" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Keep original format and reduce audio bitrate or sample rate.
          </p>

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

          <div className="grid grid-cols-2 gap-2">
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

            <div>
              <FieldLabel htmlFor="aud-ch">Channels</FieldLabel>
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
          </div>
        </div>
      )}

      {taskMode === "convert" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-secondary block">
              Target Format
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK_AUDIO_FORMATS.map((fmt) => (
                <button
                  key={fmt.value}
                  type="button"
                  onClick={() => void updateAudioOptions({ outputFormat: fmt.value })}
                  className={cn(
                    "px-2 py-1.5 rounded-sm border text-xs font-medium transition-colors",
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
            <p className="text-xs text-muted">
              Lossless {audioOptions.outputFormat.toUpperCase()} preserves full audio fidelity without bitrate compression.
            </p>
          )}
        </div>
      )}

      {taskMode === "trim" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Cut audio to a specific start and end timestamp (in seconds).
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel htmlFor="aud-trim-start">Trim Start (s)</FieldLabel>
              <Input
                id="aud-trim-start"
                type="number"
                min={0}
                step={0.1}
                placeholder="0.0"
                value={audioOptions.trimStartSec ?? ""}
                onChange={(e) => {
                  const val = e.target.value
                    ? Math.max(0, Number(e.target.value))
                    : undefined;
                  void updateAudioOptions({ trimStartSec: val && val > 0 ? val : undefined });
                }}
              />
            </div>
            <div>
              <FieldLabel htmlFor="aud-trim-end">Trim End (s)</FieldLabel>
              <Input
                id="aud-trim-end"
                type="number"
                min={0}
                step={0.1}
                placeholder="End"
                value={audioOptions.trimEndSec ?? ""}
                onChange={(e) => {
                  const val = e.target.value
                    ? Math.max(0, Number(e.target.value))
                    : undefined;
                  void updateAudioOptions({ trimEndSec: val && val > 0 ? val : undefined });
                }}
              />
            </div>
          </div>

          {hasTrimEdits && (
            <button
              type="button"
              onClick={() =>
                void updateAudioOptions({ trimStartSec: undefined, trimEndSec: undefined })
              }
              className="text-xs text-muted hover:text-primary underline"
            >
              Reset Trim
            </button>
          )}
        </div>
      )}

      <div className="space-y-2.5 pt-3.5 border-t border-border">
        <h3 className="text-sm font-semibold text-primary">Output</h3>
        <div>
          <FieldLabel htmlFor="aud-outdir">Output Folder</FieldLabel>
          <div className="flex gap-1.5">
            <Input
              id="aud-outdir"
              value={audioOptions.outputDir ?? ""}
              onChange={(e) =>
                void updateAudioOptions({
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
          <FieldLabel htmlFor="aud-pattern" hint="{name}, {ext}">
            Naming Pattern
          </FieldLabel>
          <Input
            id="aud-pattern"
            value={audioOptions.namingPattern}
            onChange={(e) =>
              void updateAudioOptions({ namingPattern: e.target.value })
            }
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {[
              "{name}_compressed.{ext}",
              "{name}_converted.{ext}",
              "{name}_trimmed.{ext}",
              "{name}.{ext}",
            ].map((pat) => (
              <button
                key={pat}
                type="button"
                onClick={() => void updateAudioOptions({ namingPattern: pat })}
                className="px-1.5 py-0.5 text-[11px] font-mono rounded-sm bg-elevated hover:bg-border-strong text-secondary border border-border neu-btn-raised"
              >
                {pat}
              </button>
            ))}
          </div>
        </div>

        <SwitchToggle
          id="aud-overwrite"
          checked={audioOptions.overwriteExisting}
          onChange={(v) => void updateAudioOptions({ overwriteExisting: v })}
          label="Overwrite Existing Files"
        />

        <SwitchToggle
          id="aud-strip-meta"
          checked={audioOptions.stripMetadata}
          onChange={(v) => void updateAudioOptions({ stripMetadata: v })}
          label="Strip ID3 / Tags Metadata"
        />
      </div>
    </aside>
  );
}
