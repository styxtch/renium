import { SlidersHorizontal } from "lucide-react";
import { Button, FieldLabel, Select } from "@/components/ui/Primitives";
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
    <div className="space-y-1.5 pb-3 border-b border-border">
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor={`preset-${mediaType}`}>Preset</FieldLabel>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => setShowPresetModal(true)}
          title="Save, import, or export presets"
        >
          <SlidersHorizontal className="h-3 w-3" />
          <span>Manage / JSON</span>
        </Button>
      </div>
      <Select
        id={`preset-${mediaType}`}
        value={activePresetId}
        onChange={(e) => handleChange(e.target.value)}
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
    </div>
  );
}

export type PresetSelectionHandler = (
  options: VideoOptions | ImageOptions,
  presetId: string
) => void;
