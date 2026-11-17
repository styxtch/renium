import { Keyboard, X } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation & General",
    items: [
      { keys: ["Ctrl", "1"], description: "Switch to Video workspace" },
      { keys: ["Ctrl", "2"], description: "Switch to Audio workspace" },
      { keys: ["Ctrl", "3"], description: "Switch to Image workspace" },
      { keys: ["Ctrl", "4"], description: "Switch to History view" },
      { keys: ["Ctrl", ","], description: "Open App Preferences" },
      { keys: ["?", "/", "F1"], description: "Toggle Keyboard Shortcuts" },
      { keys: ["Esc"], description: "Close Keyboard Shortcuts dialog" },
    ],
  },
  {
    title: "Queue & Media Actions",
    items: [
      { keys: ["Ctrl", "O"], description: "Add files to current queue" },
      { keys: ["Ctrl", "Shift", "O"], description: "Add folder to current queue" },
      { keys: ["Ctrl", "Enter"], description: "Start or resume current queue" },
      { keys: ["Ctrl", "P"], description: "Pause or resume active processing" },
      { keys: ["Delete", "/", "Backspace"], description: "Remove selected job from queue" },
    ],
  },
];

export function ShortcutsModal() {
  const { showShortcutsModal, setShowShortcutsModal } = useSettingsStore();

  if (!showShortcutsModal) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onClick={() => setShowShortcutsModal(false)}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-surface border border-border-strong shadow-soft p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Keyboard className="h-5 w-5 text-accent" />
            <h2 id="shortcuts-title" className="text-lg font-semibold text-primary">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowShortcutsModal(false)}
            aria-label="Close shortcuts"
            className="text-muted hover:text-primary p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {group.title}
              </h3>
              <div className="rounded-lg border border-subtle bg-elevated/40 divide-y divide-subtle/60">
                {group.items.map((item) => (
                  <div
                    key={item.description}
                    className="flex items-center justify-between gap-4 px-3 py-2 text-xs"
                  >
                    <span className="text-secondary">{item.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((key, idx) =>
                        key === "/" ? (
                          <span key={`sep-${idx}`} className="text-muted text-[10px] px-0.5">
                            /
                          </span>
                        ) : (
                          <kbd
                            key={`${key}-${idx}`}
                            className="px-1.5 py-0.5 text-[11px] font-mono rounded bg-surface border border-border-strong text-primary shadow-sm"
                          >
                            {key}
                          </kbd>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted border-t border-subtle pt-3">
          Note: On macOS, use <kbd className="font-mono text-secondary">Cmd</kbd> instead of{" "}
          <kbd className="font-mono text-secondary">Ctrl</kbd>.
        </p>
      </div>
    </div>
  );
}
