import { useState } from "react";
import { Download, FileCode2, Plus, Trash2, Upload, X } from "lucide-react";
import { Badge, Button, FieldLabel, Input } from "@/components/ui/Primitives";
import * as tauri from "@/lib/tauri";
import { DEFAULT_AUDIO_OPTIONS, DEFAULT_IMAGE_OPTIONS, DEFAULT_VIDEO_OPTIONS } from "@/lib/utils";
import { useJobStore } from "@/stores/jobStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Preset } from "@/types";

function extractErrMsg(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message: string }).message);
  }
  return typeof err === "string" && err ? err : fallback;
}

export function PresetManagerModal() {
  const {
    presets,
    showPresetModal,
    setShowPresetModal,
    saveCustomPreset,
    removeCustomPreset,
    importPresets,
    exportPresets,
  } = useSettingsStore();

  const {
    activeTab,
    videoOptions,
    imageOptions,
    audioOptions,
    updateVideoOptions,
    updateImageOptions,
    updateAudioOptions,
  } = useJobStore();

  const mediaType =
    activeTab === "image" ? "image" : activeTab === "audio" ? "audio" : "video";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"info" | "error">("info");

  if (!showPresetModal) return null;

  const filtered = presets.filter((p) => p.type === mediaType);

  const handleLoadExample = () => {
    const example: Preset =
      mediaType === "image"
        ? {
          id: "custom-image-social-webp",
          name: "Social Media WebP 1200px",
          description: "Resize width to 1200px and convert to WebP quality 80",
          type: "image",
          builtIn: false,
          options: {
            ...DEFAULT_IMAGE_OPTIONS,
            outputFormat: "webp",
            quality: 80,
            resizeMode: "dimensions",
            targetWidth: 1200,
            metadataMode: "keep-orientation",
          },
        }
        : mediaType === "audio"
          ? {
            id: "custom-audio-podcast-mp3",
            name: "Podcast MP3 128k",
            description: "Compact MP3 128 kbps 44.1kHz",
            type: "audio",
            builtIn: false,
            options: {
              ...DEFAULT_AUDIO_OPTIONS,
              outputFormat: "mp3",
              bitrateKbps: 128,
              sampleRate: 44100,
            },
          }
          : {
            id: "custom-video-whatsapp-720p",
            name: "WhatsApp Share 720p",
            description: "Compact 720p MP4 H.264 CRF 26",
            type: "video",
            builtIn: false,
            options: {
              ...DEFAULT_VIDEO_OPTIONS,
              crf: 26,
              resolution: "720p",
              encoderPreset: "fast",
            },
          };
    setJsonText(JSON.stringify([example], null, 2));
    setStatusTone("info");
    setStatusMsg("Loaded example JSON template. You can edit it and click Apply Pasted JSON.");
  };

  const handleSaveCurrent = async () => {
    if (!name.trim()) return;
    const newPreset: Preset = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || `Custom ${mediaType} preset`,
      type: mediaType,
      builtIn: false,
      options:
        mediaType === "video"
          ? { ...videoOptions }
          : mediaType === "audio"
            ? { ...audioOptions }
            : { ...imageOptions },
    };
    await saveCustomPreset(newPreset);
    if (mediaType === "video") {
      await updateVideoOptions(videoOptions, newPreset.id);
    } else if (mediaType === "audio") {
      await updateAudioOptions(audioOptions, newPreset.id);
    } else {
      await updateImageOptions(imageOptions, newPreset.id);
    }
    setName("");
    setDescription("");
    setStatusTone("info");
    setStatusMsg(`Saved preset "${newPreset.name}".`);
  };

  const handleExport = async () => {
    const json = await exportPresets();
    setJsonText(json);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "renium-presets.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatusTone("info");
    setStatusMsg("Exported presets to JSON.");
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      await importPresets(text);
      setStatusTone("info");
      setStatusMsg("Imported presets from JSON file.");
    } catch (err) {
      setStatusTone("error");
      setStatusMsg(extractErrMsg(err, "Invalid JSON preset file."));
    }
  };

  const handleImportText = async () => {
    if (!jsonText.trim()) return;
    try {
      await importPresets(jsonText);
      setStatusTone("info");
      setStatusMsg("Imported presets from JSON text.");
      setJsonText("");
    } catch (err) {
      setStatusTone("error");
      setStatusMsg(extractErrMsg(err, "Invalid JSON format."));
    }
  };

  const handleBrowseAndImport = async () => {
    if (!tauri.isTauriRuntime()) return;
    const picked = await tauri.pickSingleFile("Select Preset JSON", ["json"]);
    if (!picked) return;
    try {
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const content = await readTextFile(picked);
      await importPresets(content);
      setStatusTone("info");
      setStatusMsg("Imported presets from JSON.");
    } catch (err) {
      setStatusTone("error");
      setStatusMsg(extractErrMsg(err, "Failed to read or parse selected JSON file."));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preset-modal-title"
    >
      <div className="w-full max-w-xl rounded-lg bg-surface border border-border-strong shadow-soft p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 id="preset-modal-title" className="text-lg font-semibold text-primary">
            Manage {mediaType === "video" ? "Video" : mediaType === "image" ? "Image" : "Audio"} Presets
          </h2>
          <button
            type="button"
            onClick={() => setShowPresetModal(false)}
            aria-label="Close preset manager"
            className="text-muted hover:text-primary p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {statusMsg && (
          <div
            className={
              statusTone === "error"
                ? "rounded-sm bg-error/10 border border-error/30 px-3 py-2 text-xs text-error"
                : "rounded-sm bg-info/10 border border-info/30 px-3 py-2 text-xs text-info"
            }
          >
            {statusMsg}
          </div>
        )}

        <div className="rounded-md bg-elevated/50 border border-border p-3.5 space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Save Current Settings as Preset
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <FieldLabel htmlFor="preset-new-name">Preset Name</FieldLabel>
              <Input
                id="preset-new-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Instagram Reels 1080p"
              />
            </div>
            <div>
              <FieldLabel htmlFor="preset-new-desc">Description</FieldLabel>
              <Input
                id="preset-new-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional note"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="primary"
              disabled={!name.trim()}
              onClick={() => void handleSaveCurrent()}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Save Preset</span>
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Available Presets ({filtered.length})
          </h3>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-sm border border-border bg-app/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary truncate">
                      {p.name}
                    </span>
                    <Badge tone={p.builtIn ? "neutral" : "accent"}>
                      {p.builtIn ? "Built-in" : "Custom"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted truncate">{p.description}</p>
                </div>

                {!p.builtIn && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void removeCustomPreset(p.id)}
                    aria-label={`Delete preset ${p.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-error" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2.5 pt-2 border-t border-border">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Import / Export JSON
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={handleLoadExample}>
                <FileCode2 className="h-3.5 w-3.5" />
                <span>Load Example JSON</span>
              </Button>
              {tauri.isTauriRuntime() ? (
                <Button size="sm" variant="secondary" onClick={() => void handleBrowseAndImport()}>
                  <Upload className="h-3.5 w-3.5" />
                  <span>Import JSON</span>
                </Button>
              ) : (
                <label className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs rounded-sm bg-elevated text-primary hover:bg-border-strong border border-border-strong cursor-pointer font-medium">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Import JSON</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => void handleImportFile(e)}
                    className="hidden"
                  />
                </label>
              )}
              <Button size="sm" variant="secondary" onClick={() => void handleExport()}>
                <Download className="h-3.5 w-3.5" />
                <span>Export JSON</span>
              </Button>
            </div>
          </div>

          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder="Paste preset JSON array here to import, or click Export JSON..."
            rows={4}
            className="w-full rounded-sm border border-border bg-input p-2.5 text-xs font-mono text-primary placeholder:text-muted focus:border-accent focus:outline-none"
          />
          {jsonText.trim() && (
            <div className="flex justify-end">
              <Button size="sm" variant="primary" onClick={() => void handleImportText()}>
                Apply Pasted JSON
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
