import { create } from "zustand";
import * as tauri from "@/lib/tauri";
import type { HistoryItem } from "@/types";

interface HistoryState {
  items: HistoryItem[];
  searchQuery: string;
  filter: "all" | "video" | "image" | "audio" | "completed" | "failed";
  loading: boolean;
  setSearchQuery: (q: string) => void;
  setFilter: (f: HistoryState["filter"]) => void;
  fetchHistory: () => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  items: [],
  searchQuery: "",
  filter: "all",
  loading: false,

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setFilter: (filter) => set({ filter }),

  fetchHistory: async () => {
    set({ loading: true });
    try {
      const items = await tauri.getHistory();
      set({ items, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  removeItem: async (id) => {
    await tauri.removeHistoryItem(id);
    set({ items: get().items.filter((i) => i.id !== id) });
  },

  clearAll: async () => {
    await tauri.clearHistory();
    set({ items: [] });
  },
}));
