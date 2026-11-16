import { FolderOpen, X } from "lucide-react";
import {
  Button,
  FieldLabel,
  Input,
  Select,
  SwitchToggle,
} from "@/components/ui/Primitives";
import * as tauri from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settingsStore";
import { useThemeStore } from "@/stores/themeStore";
import type { ThemeMode, ThemeStyle } from "@/types";

export function AppPreferencesModal() {
  const {
    settings,
    capabilities,
    ffmpegStatus,
    showPreferencesModal,
    setShowPreferencesModal,
    setShowFfmpegModal,
    updateSettings,
  } = useSettingsStore();

  const { theme, themeStyle, setTheme, setThemeStyle } = useThemeStore();

  if (!showPreferencesModal) return null;

  const handleBrowseDefaultDir = async () => {
    const dir = await tauri.pickFolder();
    if (dir) {
      await updateSettings({ defaultOutputDir: dir });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prefs-title"
    >
      <div className="w-full max-w-lg rounded-lg bg-surface border border-border-strong shadow-soft p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 id="prefs-title" className="text-lg font-semibold text-primary">
            Settings &amp; Preferences
          </h2>
          <button
            type="button"
            onClick={() => setShowPreferencesModal(false)}
            aria-label="Close settings"
            className="text-muted hover:text-primary p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="pref-theme">Color Mode</FieldLabel>
              <Select
                id="pref-theme"
                value={theme}
                onChange={(e) => setTheme(e.target.value as ThemeMode)}
              >
                <option value="light">Light (Default)</option>
                <option value="dark">Dark</option>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="pref-theme-style">Theme Style</FieldLabel>
              <Select
                id="pref-theme-style"
                value={themeStyle}
                onChange={(e) => setThemeStyle(e.target.value as ThemeStyle)}
              >
                <option value="default">Modern Card (Default)</option>
                <option value="neumorphism">Neumorphism (Soft UI)</option>
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="pref-outdir">Default Output Folder</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="pref-outdir"
                value={settings.defaultOutputDir ?? ""}
                onChange={(e) =>
                  void updateSettings({
                    defaultOutputDir: e.target.value || undefined,
                  })
                }
                placeholder="Same folder as source file"
                className="font-mono text-xs"
              />
              <Button size="sm" onClick={() => void handleBrowseDefaultDir()}>
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="pref-vid-conc">Concurrent Video Jobs</FieldLabel>
              <Select
                id="pref-vid-conc"
                value={settings.maxConcurrentVideoJobs}
                onChange={(e) =>
                  void updateSettings({
                    maxConcurrentVideoJobs: Number(e.target.value),
                  })
                }
              >
                <option value={1}>1 (Recommended)</option>
                <option value={2}>2</option>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="pref-img-conc">Concurrent Image Jobs</FieldLabel>
              <Select
                id="pref-img-conc"
                value={settings.maxConcurrentImageJobs}
                onChange={(e) =>
                  void updateSettings({
                    maxConcurrentImageJobs: Number(e.target.value),
                  })
                }
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={4}>4 (Recommended)</option>
                <option value={6}>6</option>
              </Select>
            </div>
          </div>

          <SwitchToggle
            id="pref-hw"
            checked={settings.hwAccel}
            onChange={(v) => void updateSettings({ hwAccel: v })}
            label="Hardware Acceleration by Default"
            description={
              capabilities.hwEncoders.length > 0
                ? `Available: ${capabilities.hwEncoders.slice(0, 4).join(", ")}`
                : "No hardware encoders detected yet"
            }
          />

          <SwitchToggle
            id="pref-updates"
            checked={settings.checkUpdates}
            onChange={(v) => void updateSettings({ checkUpdates: v })}
            label="Optional Update Check"
            description="Off by default — Renium stays 100% offline unless enabled"
          />
        </div>

        <div className="rounded-md bg-elevated/50 border border-border p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-primary">
              Video Engine (FFmpeg + FFprobe)
            </div>
            <div className="text-xs text-muted truncate">
              {ffmpegStatus.installed
                ? ffmpegStatus.version || "Installed"
                : "Not configured"}
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setShowPreferencesModal(false);
              setShowFfmpegModal(true);
            }}
          >
            Configure
          </Button>
        </div>

        <div className="pt-2 border-t border-border text-xs text-muted space-y-1">
          <div className="font-medium text-secondary">About Renium v1.0.0</div>
          <p>
            Desktop offline-first media compressor powered by Rust, Tauri 2, OxiPNG, image-rs, and
            FFmpeg (LGPL/GPL components downloaded externally at first run).
          </p>
        </div>
      </div>
    </div>
  );
}
