import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Music,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { Badge, Button, Input, Select } from "@/components/ui/Primitives";
import * as tauri from "@/lib/tauri";
import { calcSavingsPercent, formatBytes } from "@/lib/utils";
import { useHistoryStore } from "@/stores/historyStore";

export function HistoryView() {
  const {
    items,
    searchQuery,
    filter,
    setSearchQuery,
    setFilter,
    removeItem,
    clearAll,
  } = useHistoryStore();

  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const targetDeleteItem = useMemo(
    () => items.find((i) => i.id === confirmDeleteId) ?? null,
    [items, confirmDeleteId]
  );
  const isConfirmModalOpen = confirmClearAll || targetDeleteItem !== null;

  useEffect(() => {
    if (!isConfirmModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmClearAll(false);
        setConfirmDeleteId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isConfirmModalOpen]);

  const stats = useMemo(() => {
    const completed = items.filter((i) => i.status === "completed");
    const totalSaved = completed.reduce((sum, i) => sum + Math.max(0, i.savedBytes), 0);
    const totalOriginal = completed.reduce((sum, i) => sum + i.originalSize, 0);
    const avgPct =
      totalOriginal > 0 ? Math.round((totalSaved / totalOriginal) * 1000) / 10 : 0;
    return {
      totalSaved,
      filesProcessed: completed.length,
      avgPct,
    };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (
        searchQuery.trim() &&
        !item.fileName.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      if (filter === "video" && item.type !== "video") return false;
      if (filter === "image" && item.type !== "image") return false;
      if (filter === "audio" && item.type !== "audio") return false;
      if (filter === "completed" && item.status !== "completed") return false;
      if (filter === "failed" && item.status !== "failed") return false;
      return true;
    });
  }, [items, searchQuery, filter]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4 max-w-6xl w-full mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
        <div className="rounded-md border border-border bg-surface shadow-card p-4">
          <div className="text-xs font-medium text-secondary">Total Space Saved</div>
          <div className="mt-1 text-2xl font-semibold font-mono text-success">
            {formatBytes(stats.totalSaved)}
          </div>
        </div>
        <div className="rounded-md border border-border bg-surface shadow-card p-4">
          <div className="text-xs font-medium text-secondary">Files Processed</div>
          <div className="mt-1 text-2xl font-semibold font-mono text-primary">
            {stats.filesProcessed}
          </div>
        </div>
        <div className="rounded-md border border-border bg-surface shadow-card p-4">
          <div className="text-xs font-medium text-secondary">Average Savings</div>
          <div className="mt-1 text-2xl font-semibold font-mono text-accent">
            {stats.avgPct}%
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md relative">
          <Search className="h-4 w-4 text-muted absolute left-3 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search filename..."
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            aria-label="Filter history"
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as typeof filter)
            }
            className="w-40"
          >
            <option value="all">All Items</option>
            <option value="video">Video Only</option>
            <option value="image">Image Only</option>
            <option value="audio">Audio Only</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </Select>

          <Button
            variant="destructive"
            size="md"
            disabled={items.length === 0}
            onClick={() => setConfirmClearAll(true)}
          >
            <Trash2 className="h-4 w-4" />
            <span>Clear History</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-md border border-border bg-surface shadow-card overflow-y-auto p-3.5 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-muted text-sm gap-1">
            <span>No history items found</span>
            <span className="text-xs">
              Completed and failed compression jobs will appear here across sessions.
            </span>
          </div>
        ) : (
          filtered.map((item) => {
            const savings = calcSavingsPercent(item.originalSize, item.outputSize);
            const isFailed = item.status === "failed";
            const isExpanded = expandedErrorId === item.id;

            return (
              <div
                key={item.id}
                className="rounded-md border border-border bg-surface p-3 space-y-2 neu-card-item"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-sm bg-elevated border border-border flex items-center justify-center shrink-0">
                      {item.type === "video" ? (
                        <Film className="h-4 w-4 text-accent" />
                      ) : item.type === "audio" ? (
                        <Music className="h-4 w-4 text-accent" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-accent" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-primary truncate">
                          {item.fileName}
                        </span>
                        {isFailed ? (
                          <Badge tone="error">
                            <XCircle className="h-3 w-3" />
                            Failed
                          </Badge>
                        ) : (
                          <Badge tone="success">
                            <CheckCircle2 className="h-3 w-3" />
                            Done
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs font-mono text-muted flex flex-wrap items-center gap-2">
                        <span>{new Date(item.finishedAt).toLocaleString()}</span>
                        {!isFailed ? (
                          <>
                            <span>•</span>
                            <span>
                              {formatBytes(item.originalSize)} →{" "}
                              {formatBytes(item.outputSize)}
                            </span>
                            <span
                              className={
                                savings > 0 ? "text-success" : "text-warning"
                              }
                            >
                              ({savings > 0 ? `-${savings}%` : `+${Math.abs(savings)}%`})
                            </span>
                          </>
                        ) : (
                          item.error && (
                            <span className="text-error truncate max-w-md">
                              {item.error.split("\n")[0]}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isFailed && item.outputPath && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void tauri.openOutputFolder(item.outputPath)}
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        <span>Open Folder</span>
                      </Button>
                    )}
                    {isFailed && item.error && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setExpandedErrorId(isExpanded ? null : item.id)
                        }
                      >
                        {isExpanded ? "Hide Log" : "View Log"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDeleteId(item.id)}
                      aria-label={`Delete history item ${item.fileName}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {isExpanded && item.error && (
                  <pre className="text-[11px] font-mono whitespace-pre-wrap break-all text-error bg-app p-2.5 rounded-sm border border-error/25 max-h-32 overflow-y-auto">
                    {item.error}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>

      {isConfirmModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-confirm-title"
          onClick={() => {
            setConfirmClearAll(false);
            setConfirmDeleteId(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg bg-surface border border-border-strong shadow-soft p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-error/15 border border-error/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-error" />
                </div>
                <h2
                  id="history-confirm-title"
                  className="text-base font-semibold text-primary"
                >
                  {confirmClearAll ? "Clear All History?" : "Delete History Item?"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfirmClearAll(false);
                  setConfirmDeleteId(null);
                }}
                aria-label="Close confirmation dialog"
                className="text-muted hover:text-primary p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-secondary leading-relaxed">
              {confirmClearAll ? (
                <>
                  Are you sure you want to remove all{" "}
                  <span className="font-semibold text-primary">
                    {items.length}
                  </span>{" "}
                  history record{items.length > 1 ? "s" : ""}? Output files already
                  saved on disk will not be deleted.
                </>
              ) : (
                <>
                  Remove{" "}
                  <span className="font-semibold text-primary break-all">
                    {targetDeleteItem?.fileName}
                  </span>{" "}
                  from history? Output files already saved on disk will not be
                  deleted.
                </>
              )}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  setConfirmClearAll(false);
                  setConfirmDeleteId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="md"
                onClick={() => {
                  if (confirmClearAll) {
                    void clearAll();
                    setConfirmClearAll(false);
                  } else if (targetDeleteItem) {
                    void removeItem(targetDeleteItem.id);
                    setConfirmDeleteId(null);
                  }
                }}
              >
                {confirmClearAll ? "Yes, Clear All" : "Delete Item"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
