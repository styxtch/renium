import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Film,
  History,
  Image as ImageIcon,
  Keyboard,
  Layers,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/Primitives";
import { cn } from "@/lib/utils";
import { useHistoryStore } from "@/stores/historyStore";
import { useJobStore } from "@/stores/jobStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { ActiveTab } from "@/types";

const COLLAPSE_KEY = "renium.sidebarCollapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function TopNav() {
  const { activeTab, setActiveTab, videoJobs, imageJobs, audioJobs } = useJobStore();
  const { items: historyItems } = useHistoryStore();
  const { ffmpegStatus, setShowFfmpegModal, setShowPreferencesModal, setShowShortcutsModal } =
    useSettingsStore();
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  };

  const activeVideoCount = videoJobs.filter((j) =>
    ["queued", "processing", "paused"].includes(j.status)
  ).length;
  const activeImageCount = imageJobs.filter((j) =>
    ["queued", "processing", "paused"].includes(j.status)
  ).length;
  const activeAudioCount = audioJobs.filter((j) =>
    ["queued", "processing", "paused"].includes(j.status)
  ).length;
  const runningVideo = videoJobs.some((j) => j.status === "processing");
  const runningImage = imageJobs.some((j) => j.status === "processing");
  const runningAudio = audioJobs.some((j) => j.status === "processing");

  const tabs: {
    id: ActiveTab;
    label: string;
    icon: React.ReactNode;
    count?: number;
    running?: boolean;
  }[] = [
    {
      id: "video",
      label: "Video",
      icon: <Film className="h-4 w-4" />,
      count: activeVideoCount,
      running: runningVideo,
    },
    {
      id: "image",
      label: "Image",
      icon: <ImageIcon className="h-4 w-4" />,
      count: activeImageCount,
      running: runningImage,
    },
    {
      id: "audio",
      label: "Audio",
      icon: <Music className="h-4 w-4" />,
      count: activeAudioCount,
      running: runningAudio,
    },
    {
      id: "history",
      label: "History",
      icon: <History className="h-4 w-4" />,
      count: historyItems.length,
    },
  ];

  return (
    <aside
      aria-label="Sidebar Navigation"
      className={cn(
        "rounded-md border border-border bg-surface shadow-card p-3 flex flex-col justify-between gap-4 shrink-0 select-none transition-[width] duration-200",
        collapsed ? "w-[68px]" : "w-56 xl:w-64 2xl:w-72"
      )}
    >
      <div>
        <div
          className={cn(
            "flex items-center gap-2.5 pt-2 pb-3",
            collapsed ? "flex-col" : "justify-between px-1"
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-sm bg-accent flex items-center justify-center text-white shrink-0">
              <Layers className="h-4 w-4" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex items-baseline gap-1.5">
                <span className="font-semibold text-sm tracking-tight text-primary">
                  Renium
                </span>
                <span className="text-[11px] font-mono text-muted">v1.0</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="h-7 w-7 inline-flex items-center justify-center rounded-sm text-muted hover:text-primary hover:bg-elevated transition-colors shrink-0 neu-btn-ghost"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav
          aria-label="Primary workspace tabs"
          role="tablist"
          aria-orientation="vertical"
          className="mt-5 flex flex-col gap-1"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const hasCount = tab.count !== undefined && tab.count > 0;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-active={isActive}
                aria-label={collapsed ? tab.label : undefined}
                title={collapsed ? tab.label : undefined}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative w-full flex items-center gap-2 py-2.5 rounded-sm text-sm font-medium transition-colors duration-150 neu-nav-item",
                  collapsed ? "justify-center px-0" : "justify-between px-3",
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-secondary hover:text-primary hover:bg-elevated"
                )}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  {tab.icon}
                  {!collapsed && <span className="truncate">{tab.label}</span>}
                  {tab.running && !collapsed && (
                    <span className="h-2 w-2 rounded-full bg-accent animate-pulse shrink-0" />
                  )}
                </span>
                {hasCount && !collapsed && (
                  <span
                    className={cn(
                      "text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 min-w-[20px] text-center",
                      isActive ? "bg-accent/20 text-accent" : "bg-elevated text-muted"
                    )}
                  >
                    {tab.count}
                  </span>
                )}
                {collapsed && (hasCount || tab.running) && (
                  <span
                    className={cn(
                      "absolute top-1.5 right-2.5 h-2 w-2 rounded-full bg-accent",
                      tab.running && "animate-pulse"
                    )}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-2.5">
        <button
          type="button"
          onClick={() => setShowFfmpegModal(true)}
          className={cn(
            "w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-sm text-xs border transition-colors neu-btn-raised",
            collapsed ? "px-0" : "px-2.5",
            ffmpegStatus.installed
              ? "bg-success/10 text-success border-success/30 hover:bg-success/15"
              : "bg-warning/10 text-warning border-warning/30 hover:bg-warning/15"
          )}
          aria-label={
            collapsed
              ? ffmpegStatus.installed
                ? "Engine Ready"
                : "Setup Video Engine"
              : undefined
          }
          title={
            ffmpegStatus.installed
              ? ffmpegStatus.version || "FFmpeg ready"
              : "FFmpeg engine missing — click to set up"
          }
        >
          {ffmpegStatus.installed ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              {!collapsed && (
                <>
                  <span>Engine Ready</span>
                  <span className="h-2 w-2 rounded-full bg-success ml-auto shrink-0" />
                </>
              )}
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {!collapsed && <span>Setup Video Engine</span>}
            </>
          )}
        </button>

        <div
          className={cn(
            "flex items-center gap-1.5 border-t border-border pt-2.5",
            collapsed ? "flex-col" : "justify-between"
          )}
        >
          <ThemeToggle compact={collapsed} />

          <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowShortcutsModal(true)}
              aria-label="Keyboard Shortcuts"
              title="Keyboard Shortcuts (?)"
            >
              <Keyboard className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreferencesModal(true)}
              aria-label="Open Settings"
              title="Settings (Ctrl+,)"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
