import { getCurrentWindow } from "@tauri-apps/api/window";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { ThemeMode, ThemeStyle } from "@/types";

interface ThemeState {
  theme: ThemeMode;
  themeStyle: ThemeStyle;
  setTheme: (theme: ThemeMode) => void;
  setThemeStyle: (style: ThemeStyle) => void;
  cycleTheme: () => void;
}

const fallbackStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function getSafeStorage(): StateStorage {
  try {
    if (
      typeof window !== "undefined" &&
      window.localStorage &&
      typeof window.localStorage.setItem === "function"
    ) {
      return window.localStorage;
    }
  } catch {
    // ignore storage access issues
  }
  return fallbackStorage;
}

export function applyThemeToDom(theme: ThemeMode, themeStyle: ThemeStyle = "default") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isLight = theme !== "dark";
  const style: ThemeStyle = themeStyle === "neumorphism" ? "neumorphism" : "default";
  root.classList.remove("dark", "light");
  root.classList.add(isLight ? "light" : "dark");
  root.setAttribute("data-theme-style", style);

  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    void getCurrentWindow()
      .setTheme(isLight ? "light" : "dark")
      .catch(() => {});
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "light",
      themeStyle: "default",
      setTheme: (theme) => {
        const normalized: ThemeMode = theme === "dark" ? "dark" : "light";
        applyThemeToDom(normalized, get().themeStyle);
        set({ theme: normalized });
      },
      setThemeStyle: (themeStyle) => {
        const normalized: ThemeStyle = themeStyle === "neumorphism" ? "neumorphism" : "default";
        applyThemeToDom(get().theme, normalized);
        set({ themeStyle: normalized });
      },
      cycleTheme: () => {
        const next: ThemeMode = get().theme === "dark" ? "light" : "dark";
        applyThemeToDom(next, get().themeStyle);
        set({ theme: next });
      },
    }),
    {
      name: "renium-theme",
      storage: createJSONStorage(getSafeStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const normalizedTheme: ThemeMode = state.theme === "dark" ? "dark" : "light";
          const normalizedStyle: ThemeStyle =
            state.themeStyle === "neumorphism" ? "neumorphism" : "default";
          if (state.theme !== normalizedTheme) state.theme = normalizedTheme;
          if (state.themeStyle !== normalizedStyle) state.themeStyle = normalizedStyle;
          applyThemeToDom(normalizedTheme, normalizedStyle);
        }
      },
    }
  )
);
