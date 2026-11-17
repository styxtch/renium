import { FolderOpen, FolderOutput } from "lucide-react";
import { Button, FieldLabel, Input, SwitchToggle } from "@/components/ui/Primitives";
import * as tauri from "@/lib/tauri";
import { useJobStore } from "@/stores/jobStore";
import type { MediaType } from "@/types";

const PATTERNS_BY_TYPE: Record<MediaType, string[]> = {
  video: [
    "{name}_compressed.{ext}",
    "{name}_converted.{ext}",
    "{name}_resized.{ext}",
    "{name}_trimmed.{ext}",
    "{name}.{ext}",
  ],
  image: [
    "{name}_compressed.{ext}",
    "{name}_converted.{ext}",
    "{name}_resized.{ext}",
    "{name}.{ext}",
  ],
  audio: [
    "{name}_compressed.{ext}",
    "{name}_converted.{ext}",
    "{name}_trimmed.{ext}",
    "{name}.{ext}",
  ],
};

export function OutputSettingsCard({ mediaType }: { mediaType: MediaType }) {
  const {
    videoOptions,
    imageOptions,
    audioOptions,
    updateVideoOptions,
    updateImageOptions,
    updateAudioOptions,
  } = useJobStore();

  const options =
    mediaType === "video" ? videoOptions : mediaType === "image" ? imageOptions : audioOptions;

  const updateOptions = (patch: {
    outputDir?: string;
    namingPattern?: string;
    overwriteExisting?: boolean;
  }) => {
    if (mediaType === "video") return updateVideoOptions(patch);
    if (mediaType === "image") return updateImageOptions(patch);
    return updateAudioOptions(patch);
  };

  const handlePickOutputDir = async () => {
    const dir = await tauri.pickFolder();
    if (dir) void updateOptions({ outputDir: dir });
  };

  const idPrefix = mediaType === "video" ? "vid" : mediaType === "image" ? "img" : "aud";
  const patternHint =
    mediaType === "image" ? "{name}, {width}, {height}, {ext}" : "{name}, {ext}";

  return (
    <section
      aria-label="Output Settings"
      className="rounded-md border border-border bg-surface shadow-card p-3.5 flex flex-col gap-2.5 shrink-0"
    >
      <div className="flex items-center gap-2">
        <FolderOutput className="h-4 w-4 text-accent shrink-0" />
        <h3 className="text-sm font-semibold text-primary">Output</h3>
      </div>

      <div>
        <FieldLabel htmlFor={`${idPrefix}-outdir`}>Output Folder</FieldLabel>
        <div className="flex gap-1.5">
          <Input
            id={`${idPrefix}-outdir`}
            value={options.outputDir ?? ""}
            onChange={(e) =>
              void updateOptions({
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
        <FieldLabel htmlFor={`${idPrefix}-pattern`} hint={patternHint}>
          Naming Pattern
        </FieldLabel>
        <Input
          id={`${idPrefix}-pattern`}
          value={options.namingPattern}
          onChange={(e) => void updateOptions({ namingPattern: e.target.value })}
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {PATTERNS_BY_TYPE[mediaType].map((pat) => (
            <button
              key={pat}
              type="button"
              onClick={() => void updateOptions({ namingPattern: pat })}
              className="px-1.5 py-0.5 text-[11px] font-mono rounded-sm bg-elevated hover:bg-border-strong text-secondary border border-border neu-btn-raised"
            >
              {pat}
            </button>
          ))}
        </div>
      </div>

      <SwitchToggle
        id={`${idPrefix}-overwrite`}
        checked={options.overwriteExisting}
        onChange={(v) => void updateOptions({ overwriteExisting: v })}
        label="Overwrite Existing Files"
      />
    </section>
  );
}
