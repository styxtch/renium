import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/themeStore";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, cycleTheme } = useThemeStore();
  const isDark = theme === "dark";

  if (compact) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        onClick={cycleTheme}
        aria-label={`Switch theme (current: ${isDark ? "Dark" : "Light"})`}
        title={`Theme: ${isDark ? "Dark" : "Light"} (click to switch)`}
        className="h-8 w-8 inline-flex items-center justify-center rounded-full bg-elevated border border-border text-primary hover:border-border-strong transition-colors neu-btn-ghost"
      >
        {isDark ? <Moon className="h-4 w-4 text-accent" /> : <Sun className="h-4 w-4 text-warning" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={cycleTheme}
      aria-label={`Switch theme (current: ${isDark ? "Dark" : "Light"})`}
      title={`Theme: ${isDark ? "Dark" : "Light"} (click to switch)`}
      className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-elevated border border-border hover:border-border-strong transition-colors neu-segmented"
    >
      <span
        className={cn(
          "h-6 w-7 rounded-full inline-flex items-center justify-center transition-all",
          !isDark ? "bg-surface text-warning shadow-sm" : "text-muted"
        )}
      >
        <Sun className="h-3.5 w-3.5" />
      </span>
      <span
        className={cn(
          "h-6 w-7 rounded-full inline-flex items-center justify-center transition-all",
          isDark ? "bg-surface text-accent shadow-sm" : "text-muted"
        )}
      >
        <Moon className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
