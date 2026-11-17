import { SlidersHorizontal } from "lucide-react";
import { Button, Select } from "@/components/ui/Primitives";
import { useSettingsStore } from "@/stores/settingsStore";
import type { ImageOptions, MediaType, Preset, VideoOptions } from "@/types";

export function PresetHeader({
  mediaType,
  activePresetId,
  onSelectPreset,
}: {
  mediaType: MediaType;
  activePresetId: string;
  onSelectPreset: (preset: Preset) => void;
}) {
  const { presets, setShowPresetModal } = useSettingsStore();
  const filtered = presets.filter((p) => p.type === mediaType);

  const handleChange = (id: string) => {
    const found = filtered.find((p) => p.id === id);
    if (found) {
      onSelectPreset(found);
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      <label
        htmlFor={`preset-${mediaType}`}
        className="text-xs font-medium text-secondary shrink-0"
      >
        Preset
      </label>
      <Select
        id={`preset-${mediaType}`}
        value={activePresetId}
        onChange={(e) => handleChange(e.target.value)}
        className="h-8 text-xs flex-1 min-w-[150px]"
      >
        <option value="custom" disabled>
          Custom Configuration
        </option>
        {filtered.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} {p.builtIn ? "" : "(Custom)"}
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 px-2 text-xs shrink-0"
        onClick={() => setShowPresetModal(true)}
        title="Save, import, or export presets"
      >
        <SlidersHorizontal className="h-3 w-3" />
        <span>Manage / JSON</span>
      </Button>
    </div>
  );
}

export type PresetSelectionHandler = (
  options: VideoOptions | ImageOptions,
  presetId: string
) => void;
