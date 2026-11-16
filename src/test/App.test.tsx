import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import * as tauri from "@/lib/tauri";
import { DEFAULT_AUDIO_OPTIONS, DEFAULT_IMAGE_OPTIONS, DEFAULT_VIDEO_OPTIONS } from "@/lib/utils";
import { useHistoryStore } from "@/stores/historyStore";
import { useJobStore } from "@/stores/jobStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useThemeStore } from "@/stores/themeStore";
import type { HistoryItem, Job } from "@/types";

vi.mock("@/lib/tauri", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  const { BUILT_IN_PRESETS: presets } = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
  return {
    ...actual,
    checkFfmpegStatus: vi.fn().mockResolvedValue({ installed: false }),
    getSettings: vi.fn().mockResolvedValue({
      hwAccel: true,
      maxConcurrentVideoJobs: 1,
      maxConcurrentImageJobs: 4,
      checkUpdates: false,
    }),
    getPresets: vi.fn().mockResolvedValue(presets),
    getCapabilities: vi.fn().mockResolvedValue({
      platform: "windows",
      cpuCores: 8,
      hwEncoders: ["h264_nvenc"],
      hasNvenc: true,
      hasQsv: false,
      hasAmf: false,
      hasVideotoolbox: false,
      hasVaapi: false,
    }),
    getJobs: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([]),
    removeHistoryItem: vi.fn().mockResolvedValue(undefined),
    clearHistory: vi.fn().mockResolvedValue(undefined),
    addJobs: vi.fn().mockResolvedValue([]),
    removeJob: vi.fn().mockResolvedValue(undefined),
    clearCompletedJobs: vi.fn().mockResolvedValue(undefined),
    reorderJobs: vi.fn().mockResolvedValue([]),
    startQueue: vi.fn().mockResolvedValue(undefined),
    updateQueuedJobsOptions: vi.fn().mockResolvedValue(undefined),
    keepOriginal: vi.fn().mockResolvedValue(undefined),
    savePreset: vi.fn().mockImplementation(async (p) => [...presets, p]),
    exportPresetsJson: vi.fn().mockResolvedValue(JSON.stringify(presets)),
    importPresetsJson: vi.fn().mockResolvedValue(presets),
    onJobProgress: vi.fn().mockResolvedValue(() => {}),
    onJobStatusChanged: vi.fn().mockResolvedValue(() => {}),
    onNativeDragDrop: vi.fn().mockResolvedValue(() => {}),
    generatePreview: vi.fn().mockImplementation(async (p, mt, opts, sec, out) =>
      actual.generatePreview(p, mt, opts, sec, out)
    ),
  };
});

describe("Renium UI & Workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useThemeStore.getState().setTheme("dark");
    useThemeStore.getState().setThemeStyle("default");
    useJobStore.setState({
      activeTab: "video",
      videoJobs: [],
      imageJobs: [],
      audioJobs: [],
      selectedJobId: null,
      previewJobId: null,
      videoOptions: { ...DEFAULT_VIDEO_OPTIONS },
      imageOptions: { ...DEFAULT_IMAGE_OPTIONS },
      audioOptions: { ...DEFAULT_AUDIO_OPTIONS },
      activeVideoPresetId: "builtin-video-web-balanced",
      activeImagePresetId: "builtin-image-keep-original",
      activeAudioPresetId: "builtin-audio-mp3-balanced",
      notice: null,
      noticeTone: "info",
      mismatchOffer: null,
      uncheckedJobIds: {},
    });
    useHistoryStore.setState({
      items: [],
      searchQuery: "",
      filter: "all",
      loading: false,
    });
    useSettingsStore.setState({
      showFfmpegModal: false,
      showPreferencesModal: false,
      showPresetModal: false,
      showShortcutsModal: false,
      ffmpegStatus: { installed: false },
      ffmpegChecked: false,
    });
  });

  it("shows First-Run FFmpeg Setup Modal when FFmpeg is missing and allows switching to Image Mode Only", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Video Engine Required")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Download Video Engine/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Locate Local FFmpeg Binary/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Use Image Mode Only/i }));

    await waitFor(() => {
      expect(screen.queryByText("Video Engine Required")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Drop images or folders here")).toBeInTheDocument();
  });

  it("navigates separately between Video, Image, Audio, and History tabs via clicks and Ctrl+1/2/3/4 shortcuts", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({
      installed: true,
      version: "ffmpeg version 7.0",
      source: "appdata",
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Drop video files or folders here")).toBeInTheDocument();
    });

    // Switch via Ctrl+2 -> Image tab
    fireEvent.keyDown(window, { key: "2", ctrlKey: true });
    expect(screen.getByText("Drop images or folders here")).toBeInTheDocument();

    // Switch via Ctrl+3 -> Audio tab
    fireEvent.keyDown(window, { key: "3", ctrlKey: true });
    expect(screen.getByText("Drop audio files or folders here")).toBeInTheDocument();

    // Switch via Ctrl+4 -> History tab
    fireEvent.keyDown(window, { key: "4", ctrlKey: true });
    expect(screen.getByText("Total Space Saved")).toBeInTheDocument();

    // Switch via clicking Video tab
    fireEvent.click(screen.getByRole("tab", { name: /Video/i }));
    expect(screen.getByText("Drop video files or folders here")).toBeInTheDocument();
  });

  it("implements manual staging workflow and Start Compress (N) + Keep Original action", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({
      installed: true,
      version: "ffmpeg version 7.0",
      source: "appdata",
    });

    const stagedImageJob: Job = {
      id: "img-1",
      type: "image",
      inputPath: "C:\\photos\\hero.png",
      fileName: "hero.png",
      originalSize: 2_000_000,
      progress: 0,
      status: "queued",
      options: DEFAULT_IMAGE_OPTIONS,
      createdAt: Date.now(),
    };

    const largerCompletedJob: Job = {
      id: "img-2",
      type: "image",
      inputPath: "C:\\photos\\tiny.jpg",
      outputPath: "C:\\photos\\tiny_compressed.jpg",
      fileName: "tiny.jpg",
      originalSize: 100_000,
      outputSize: 115_000,
      sizeLargerWarning: true,
      progress: 100,
      status: "completed",
      options: DEFAULT_IMAGE_OPTIONS,
      createdAt: Date.now(),
    };

    vi.mocked(tauri.getJobs).mockImplementation(async (mt) =>
      mt === "image" ? [stagedImageJob, largerCompletedJob] : []
    );

    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: /Image/i }));

    await waitFor(() => {
      expect(screen.getByText("hero.png")).toBeInTheDocument();
    });

    const startBtn = screen.getByRole("button", { name: /Start Compress \(1\)/i });
    expect(startBtn).toBeEnabled();

    expect(
      (screen.getByLabelText("Preset") as HTMLSelectElement).value
    ).toBe("builtin-image-keep-original");

    // Switching to Convert tab and changing target format to PNG dynamically updates CTA to Convert to PNG (1)
    fireEvent.click(screen.getByRole("button", { name: /^Convert$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^PNG$/i }));
    const convertBtn = screen.getByRole("button", { name: /Convert to PNG \(1\)/i });
    expect(convertBtn).toBeEnabled();
    fireEvent.click(convertBtn);

    await waitFor(() => {
      expect(tauri.startQueue).toHaveBeenCalledWith("image");
    });

    // Verify Keep Original button appears on bloated output
    const keepOrigBtn = screen.getByRole("button", { name: /Keep Original/i });
    fireEvent.click(keepOrigBtn);

    await waitFor(() => {
      expect(tauri.keepOriginal).toHaveBeenCalledWith("img-2");
    });
  });

  it("toggles between Dark and Light themes", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({ installed: true });
    render(<App />);

    await waitFor(() => {
      expect(useSettingsStore.getState().ffmpegChecked).toBe(true);
    });

    expect(document.documentElement.classList.contains("dark")).toBe(true);

    const toggle = screen.getByRole("switch", { name: /Switch theme/i });
    fireEvent.click(toggle);

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(useThemeStore.getState().theme).toBe("light");

    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(useThemeStore.getState().theme).toBe("dark");

    // Theme Style (Neumorphism) works independently of Color Mode (Light/Dark)
    expect(document.documentElement.getAttribute("data-theme-style")).toBe("default");
    fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));
    const styleSelect = screen.getByLabelText("Theme Style") as HTMLSelectElement;
    fireEvent.change(styleSelect, { target: { value: "neumorphism" } });
    expect(document.documentElement.getAttribute("data-theme-style")).toBe("neumorphism");
    expect(useThemeStore.getState().themeStyle).toBe("neumorphism");

    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.getAttribute("data-theme-style")).toBe("neumorphism");
  });

  it("supports preset selection, custom preset saving, and JSON export", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({ installed: true });
    vi.mocked(tauri.getJobs).mockImplementation(async (mt) =>
      mt === "video"
        ? [
            {
              id: "vid-preset-1",
              type: "video",
              inputPath: "C:\\videos\\clip.mp4",
              fileName: "clip.mp4",
              originalSize: 5_000_000,
              progress: 0,
              status: "queued",
              options: DEFAULT_VIDEO_OPTIONS,
              createdAt: Date.now(),
            },
          ]
        : []
    );
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    });

    const presetSelect = screen.getByLabelText("Preset") as HTMLSelectElement;
    fireEvent.change(presetSelect, { target: { value: "builtin-video-hevc-compact" } });

    await waitFor(() => {
      expect(useJobStore.getState().videoOptions.videoCodec).toBe("h265");
    });

    fireEvent.click(screen.getByRole("button", { name: /Manage \/ JSON/i }));
    expect(screen.getByText("Manage Video Presets")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Preset Name"), {
      target: { value: "My Custom HEVC" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Preset/i }));

    await waitFor(() => {
      expect(tauri.savePreset).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: /Export JSON/i }));
    await waitFor(() => {
      expect(tauri.exportPresetsJson).toHaveBeenCalled();
    });
    clickSpy.mockRestore();
  });

  it("displays aggregated stats and filtering in History tab", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({ installed: true });
    const historyData: HistoryItem[] = [
      {
        id: "h1",
        type: "video",
        fileName: "vlog.mp4",
        inputPath: "C:\\in\\vlog.mp4",
        outputPath: "C:\\out\\vlog_compressed.mp4",
        originalSize: 100 * 1024 * 1024,
        outputSize: 40 * 1024 * 1024,
        savedBytes: 60 * 1024 * 1024,
        status: "completed",
        finishedAt: Date.now(),
      },
      {
        id: "h2",
        type: "image",
        fileName: "corrupt.png",
        inputPath: "C:\\in\\corrupt.png",
        outputPath: "",
        originalSize: 500_000,
        outputSize: 0,
        savedBytes: 0,
        status: "failed",
        error: "Invalid PNG header",
        finishedAt: Date.now(),
      },
    ];
    vi.mocked(tauri.getHistory).mockResolvedValueOnce(historyData);

    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: /History/i }));

    await waitFor(() => {
      expect(screen.getByText("vlog.mp4")).toBeInTheDocument();
      expect(screen.getByText("corrupt.png")).toBeInTheDocument();
    });

    expect(screen.getByText("60.0 MB")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search filename..."), {
      target: { value: "vlog" },
    });
    expect(screen.getByText("vlog.mp4")).toBeInTheDocument();
    expect(screen.queryByText("corrupt.png")).not.toBeInTheDocument();
  });

  it("warns when dropping a video onto the Image tab and offers switching to Video tab", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({ installed: true });
    vi.mocked(tauri.addJobs).mockResolvedValue([]);

    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: /Image/i }));

    await waitFor(() => {
      expect(screen.getByText("Drop images or folders here")).toBeInTheDocument();
    });

    const dropZoneText = screen.getByText("Drop images or folders here");
    const dropContainer = dropZoneText.closest("div[class*='border-dashed']") as HTMLElement;
    fireEvent.drop(dropContainer, {
      dataTransfer: {
        files: [new File(["data"], "sample.mp4", { type: "video/mp4" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /cannot be added to the Image tab\. Use the Video tab/i
      );
    });

    const switchBtn = screen.getByRole("button", { name: /Switch to Video Tab/i });
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(screen.getByText("Drop video files or folders here")).toBeInTheDocument();
    });
  });

  it("requires confirmation before deleting history items or clearing all history", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({ installed: true });
    const historyData: HistoryItem[] = [
      {
        id: "h1",
        type: "image",
        fileName: "photo.jpg",
        inputPath: "C:\\in\\photo.jpg",
        outputPath: "C:\\out\\photo_compressed.jpg",
        originalSize: 200_000,
        outputSize: 80_000,
        savedBytes: 120_000,
        status: "completed",
        finishedAt: Date.now(),
      },
      {
        id: "h2",
        type: "video",
        fileName: "clip.mp4",
        inputPath: "C:\\in\\clip.mp4",
        outputPath: "C:\\out\\clip_compressed.mp4",
        originalSize: 5_000_000,
        outputSize: 2_000_000,
        savedBytes: 3_000_000,
        status: "completed",
        finishedAt: Date.now(),
      },
    ];
    vi.mocked(tauri.getHistory).mockResolvedValueOnce(historyData);

    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: /History/i }));

    await waitFor(() => {
      expect(screen.getByText("photo.jpg")).toBeInTheDocument();
    });

    // Single item delete opens confirmation modal
    fireEvent.click(screen.getByRole("button", { name: /Delete history item photo\.jpg/i }));
    expect(tauri.removeHistoryItem).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent(/Delete History Item\?/i);
    fireEvent.click(screen.getByRole("button", { name: /Delete Item/i }));
    await waitFor(() => {
      expect(tauri.removeHistoryItem).toHaveBeenCalledWith("h1");
    });

    // Click Clear History -> opens modal, should NOT delete immediately
    fireEvent.click(screen.getByRole("button", { name: /Clear History/i }));
    expect(tauri.clearHistory).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent(/Clear All History\?/i);
    expect(screen.getByRole("button", { name: /Yes, Clear All/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(tauri.clearHistory).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Confirm Clear All inside modal
    fireEvent.click(screen.getByRole("button", { name: /Clear History/i }));
    fireEvent.click(screen.getByRole("button", { name: /Yes, Clear All/i }));

    await waitFor(() => {
      expect(tauri.clearHistory).toHaveBeenCalledTimes(1);
    });
  });

  it("loads example JSON for Image preset in Preset Manager modal", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({ installed: true });
    vi.mocked(tauri.getJobs).mockImplementation(async (mt) =>
      mt === "image"
        ? [
            {
              id: "img-preset-1",
              type: "image",
              inputPath: "C:\\images\\photo.png",
              fileName: "photo.png",
              originalSize: 1_200_000,
              progress: 0,
              status: "queued",
              options: DEFAULT_IMAGE_OPTIONS,
              createdAt: Date.now(),
            },
          ]
        : []
    );
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: /Image/i }));
    await waitFor(() => {
      expect(screen.getByText("photo.png")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Manage \/ JSON/i }));
    expect(screen.getByText("Manage Image Presets")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Load Example JSON/i }));
    const textarea = screen.getByPlaceholderText(/Paste preset JSON/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('"type": "image"');
    expect(textarea.value).toContain('"outputFormat": "webp"');

    fireEvent.click(screen.getByRole("button", { name: /Apply Pasted JSON/i }));
    await waitFor(() => {
      expect(tauri.importPresetsJson).toHaveBeenCalled();
    });
  });

  it("renders workspace tabs in vertical sidebar and supports reordering queue jobs", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({ installed: true });
    const jobA: Job = {
      id: "vid-1",
      type: "video",
      inputPath: "C:\\videos\\first.mp4",
      fileName: "first.mp4",
      originalSize: 10_000_000,
      progress: 0,
      status: "queued",
      options: DEFAULT_VIDEO_OPTIONS,
      createdAt: Date.now(),
    };
    const jobB: Job = {
      id: "vid-2",
      type: "video",
      inputPath: "C:\\videos\\second.mp4",
      fileName: "second.mp4",
      originalSize: 12_000_000,
      progress: 0,
      status: "queued",
      options: DEFAULT_VIDEO_OPTIONS,
      createdAt: Date.now() + 1,
    };
    vi.mocked(tauri.getJobs).mockImplementation(async (mt) =>
      mt === "video" ? [jobA, jobB] : []
    );

    render(<App />);

    expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "vertical");

    await waitFor(() => {
      expect(screen.getByText("first.mp4")).toBeInTheDocument();
      expect(screen.getByText("second.mp4")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Move first\.mp4 down/i }));

    await waitFor(() => {
      expect(tauri.reorderJobs).toHaveBeenCalledWith("video", ["vid-2", "vid-1"]);
    });
    expect(useJobStore.getState().videoJobs.map((j) => j.id)).toEqual(["vid-2", "vid-1"]);

    fireEvent.click(screen.getByRole("button", { name: /Move first\.mp4 up/i }));

    await waitFor(() => {
      expect(tauri.reorderJobs).toHaveBeenLastCalledWith("video", ["vid-1", "vid-2"]);
    });
    expect(useJobStore.getState().videoJobs.map((j) => j.id)).toEqual(["vid-1", "vid-2"]);
  });

  it("opens visual preview modal, edits crop and trim, and applies to queue options", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({ installed: true });
    const videoJob: Job = {
      id: "vid-preview-1",
      type: "video",
      inputPath: "C:\\videos\\clip.mp4",
      fileName: "clip.mp4",
      originalSize: 8_000_000,
      probeInfo: {
        durationMs: 24_000,
        width: 1280,
        height: 960,
        fps: 30,
        subtitleTracks: [],
      },
      progress: 0,
      status: "queued",
      options: DEFAULT_VIDEO_OPTIONS,
      createdAt: Date.now(),
    };

    const imageJob: Job = {
      id: "img-preview-1",
      type: "image",
      inputPath: "C:\\images\\photo.png",
      fileName: "photo.png",
      originalSize: 1_500_000,
      probeInfo: {
        width: 1200,
        height: 800,
        subtitleTracks: [],
      },
      progress: 0,
      status: "queued",
      options: DEFAULT_IMAGE_OPTIONS,
      createdAt: Date.now(),
    };

    vi.mocked(tauri.getJobs).mockImplementation(async (mt) =>
      mt === "video" ? [videoJob] : [imageJob]
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    });

    // Open preview from queued video job row
    fireEvent.click(screen.getByRole("button", { name: /Preview clip\.mp4/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /Visual Preview & Editor/i })).toBeInTheDocument();
      expect(tauri.generatePreview).toHaveBeenCalled();
    });

    // Switch compare modes
    fireEvent.click(screen.getByRole("button", { name: /Side-by-Side/i }));
    expect(screen.getByAltText("Processed output preview")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Split Slider/i }));
    expect(screen.getByLabelText(/Before after split slider/i)).toBeInTheDocument();

    // Switch to Visual Crop and choose 16:9 preset (from 1920x1080 or 1280x960 depending on preview dimensions)
    fireEvent.click(screen.getByRole("tab", { name: /Visual Crop/i }));
    fireEvent.click(screen.getByRole("button", { name: "16:9" }));

    // Switch to Trim Timeline and enter start/end
    fireEvent.click(screen.getByRole("tab", { name: /Trim Timeline/i }));
    fireEvent.change(screen.getByLabelText("Trim Start Seconds"), { target: { value: "2.5" } });
    fireEvent.change(screen.getByLabelText("Trim End Seconds"), { target: { value: "12.5" } });

    fireEvent.click(screen.getByRole("button", { name: /Apply to Queue Options/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /Visual Preview & Editor/i })).not.toBeInTheDocument();
      expect(tauri.updateQueuedJobsOptions).toHaveBeenCalledWith(
        "video",
        expect.objectContaining({
          cropWidth: expect.any(Number),
          cropHeight: expect.any(Number),
          trimStartSec: 2.5,
          trimEndSec: 12.5,
        })
      );
    });

    // Verify image tab settings panel also opens Visual Preview & applies 1:1 crop
    fireEvent.click(screen.getByRole("tab", { name: /Image/i }));
    await waitFor(() => {
      expect(screen.getByText("photo.png")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Resize & Crop/i }));
    fireEvent.click(screen.getByRole("button", { name: /Open Visual Preview & Editor/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /Visual Preview & Editor/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: /Visual Crop/i }));
    fireEvent.click(screen.getByRole("button", { name: "1:1" }));
    fireEvent.click(screen.getByRole("button", { name: /Apply to Queue Options/i }));

    await waitFor(() => {
      expect(tauri.updateQueuedJobsOptions).toHaveBeenCalledWith(
        "image",
        expect.objectContaining({
          cropWidth: expect.any(Number),
          cropHeight: expect.any(Number),
        })
      );
    });
  });

  it("renders safely when persisted or returned job JSON contains null option fields from Rust", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({ installed: true });
    const jobWithNulls = {
      id: "vid-null-1",
      type: "video",
      inputPath: "C:\\videos\\legacy.mp4",
      fileName: "legacy.mp4",
      originalSize: 5_000_000,
      outputSize: null,
      etaSeconds: null,
      progress: 0,
      status: "queued",
      options: {
        ...DEFAULT_VIDEO_OPTIONS,
        trimStartSec: null,
        trimEndSec: null,
        cropX: null,
        cropY: null,
        cropWidth: null,
        cropHeight: null,
      },
      createdAt: Date.now(),
    } as unknown as Job;

    vi.mocked(tauri.getJobs).mockImplementation(async (mt) =>
      mt === "video" ? [jobWithNulls] : []
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("legacy.mp4")).toBeInTheDocument();
    });
    expect(screen.getByText(/Video Queue \(1\)/i)).toBeInTheDocument();
  });

  it("hides queue and settings panel when queue is empty and reveals task modes once files are added", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({ installed: true });
    vi.mocked(tauri.getJobs).mockResolvedValue([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Drop video files or folders here")).toBeInTheDocument();
    });

    // Empty state: hide Video Queue & Video Settings
    expect(screen.queryByRole("complementary", { name: "Video Settings" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Video Queue \(0\)/i)).not.toBeInTheDocument();

    // Switch to Image tab -> empty state hides Image Queue & Image Settings
    fireEvent.click(screen.getByRole("tab", { name: /Image/i }));
    expect(screen.getByText("Drop images or folders here")).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Image Settings" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Image Queue \(0\)/i)).not.toBeInTheDocument();

    // Simulate dropping/adding an image -> reveals Queue + Image Settings with 3 task tabs
    const addedImage: Job = {
      id: "img-added-1",
      type: "image",
      inputPath: "C:\\images\\photo.jpg",
      fileName: "photo.jpg",
      originalSize: 900_000,
      progress: 0,
      status: "queued",
      options: DEFAULT_IMAGE_OPTIONS,
      createdAt: Date.now(),
    };
    vi.mocked(tauri.addJobs).mockResolvedValueOnce([addedImage]);

    const dropContainer = screen
      .getByText("Drop images or folders here")
      .closest("div[class*='border-dashed']") as HTMLElement;
    fireEvent.drop(dropContainer, {
      dataTransfer: {
        files: [new File(["img"], "photo.jpg", { type: "image/jpeg" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Image Settings" })).toBeInTheDocument();
    });
    expect(screen.getByText(/Image Queue \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText("What do you want to do?")).toBeInTheDocument();
    expect(screen.getByLabelText("Compression Quality")).toBeInTheDocument();
    expect(screen.queryByText("Target Format")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Resize Mode")).not.toBeInTheDocument();

    // Switch between task tabs inside Image Settings
    fireEvent.click(screen.getByRole("button", { name: /^Convert$/i }));
    expect(screen.getByText("Target Format")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^WebP$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Resize & Crop/i }));
    expect(screen.getByLabelText("Resize Mode")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Compress$/i }));
    expect(screen.getByLabelText("Compression Quality")).toBeInTheDocument();
  });

  it("opens Keyboard Shortcuts modal via sidebar button and '?' / Escape shortcuts", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({ installed: true });
    vi.mocked(tauri.getJobs).mockResolvedValue([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Drop video files or folders here")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Keyboard Shortcuts" }));
    const dialog = await screen.findByRole("dialog", { name: "Keyboard Shortcuts" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Switch to Video workspace")).toBeInTheDocument();
    expect(within(dialog).getByText("Start or resume current queue")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Keyboard Shortcuts" })).not.toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "?" });
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Keyboard Shortcuts" })).toBeInTheDocument();
    });
  });

  it("separates active Queue and Output List dynamically and hides reorder controls on finished outputs", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({ installed: true });
    vi.mocked(tauri.removeJob).mockResolvedValue(undefined);
    vi.mocked(tauri.clearCompletedJobs).mockResolvedValue(undefined);

    const queuedJob: Job = {
      id: "vid-q1",
      type: "video",
      inputPath: "C:\\videos\\q1.mp4",
      fileName: "q1.mp4",
      originalSize: 10_000_000,
      progress: 0,
      status: "queued",
      options: DEFAULT_VIDEO_OPTIONS,
      createdAt: 1000,
    };
    const doneJob1: Job = {
      id: "vid-out1",
      type: "video",
      inputPath: "C:\\videos\\out1.mp4",
      fileName: "out1.mp4",
      originalSize: 20_000_000,
      outputSize: 10_000_000,
      outputPath: "C:\\videos\\out1_compressed.mp4",
      progress: 100,
      status: "completed",
      options: DEFAULT_VIDEO_OPTIONS,
      createdAt: 2000,
    };
    const doneJob2: Job = {
      id: "vid-out2",
      type: "video",
      inputPath: "C:\\videos\\out2.mp4",
      fileName: "out2.mp4",
      originalSize: 30_000_000,
      outputSize: 15_000_000,
      outputPath: "C:\\videos\\out2_compressed.mp4",
      progress: 100,
      status: "completed",
      options: DEFAULT_VIDEO_OPTIONS,
      createdAt: 3000,
    };

    vi.mocked(tauri.getJobs).mockImplementation(async (mt) =>
      mt === "video" ? [queuedJob, doneJob1, doneJob2] : []
    );

    render(<App />);

    const queueSection = await screen.findByRole("region", { name: "Video Queue" });
    const outputSection = screen.getByRole("region", { name: "Output List" });

    expect(within(queueSection).getByText("q1.mp4")).toBeInTheDocument();
    expect(within(queueSection).queryByText("out1.mp4")).not.toBeInTheDocument();

    expect(within(outputSection).getByText("out1.mp4")).toBeInTheDocument();
    expect(within(outputSection).getByText("out2.mp4")).toBeInTheDocument();
    expect(within(outputSection).queryByText("q1.mp4")).not.toBeInTheDocument();

    expect(
      within(queueSection).getByRole("button", { name: /Preview q1\.mp4/i })
    ).toBeInTheDocument();
    expect(
      within(outputSection).queryByRole("button", { name: /Preview out1\.mp4/i })
    ).not.toBeInTheDocument();
    const compareBtn = within(outputSection).getByRole("button", { name: /Compare out1\.mp4/i });
    expect(compareBtn).toBeInTheDocument();

    // Open Compare Output modal from Output List (compare-only: no Crop/Trim/Apply)
    fireEvent.click(compareBtn);
    const compareDialog = await screen.findByRole("dialog", { name: /Visual Preview & Editor/i });
    expect(within(compareDialog).getByText(/Compare Output — out1\.mp4/i)).toBeInTheDocument();
    expect(within(compareDialog).queryByRole("tab", { name: /Visual Crop/i })).not.toBeInTheDocument();
    expect(within(compareDialog).queryByRole("button", { name: /Apply to Queue Options/i })).not.toBeInTheDocument();
    expect(tauri.generatePreview).toHaveBeenCalledWith(
      doneJob1.inputPath,
      "video",
      expect.anything(),
      undefined,
      doneJob1.outputPath
    );
    fireEvent.click(within(compareDialog).getByRole("button", { name: /^Close$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /Visual Preview & Editor/i })).not.toBeInTheDocument();
    });
    expect(
      within(outputSection).queryByRole("button", { name: /Move out1\.mp4 up/i })
    ).not.toBeInTheDocument();
    expect(
      within(outputSection).queryByRole("button", { name: /Drag to reorder out1\.mp4/i })
    ).not.toBeInTheDocument();

    // Remove the only active queued job -> Queue card disappears, Output List remains visible
    fireEvent.click(within(queueSection).getByRole("button", { name: /Remove q1\.mp4/i }));
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Video Queue" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("region", { name: "Output List" })).toBeInTheDocument();

    // Clear Output List -> both lists and settings panel hide back to clean empty state
    fireEvent.click(screen.getByRole("button", { name: /Clear Output List \(2\)/i }));
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Output List" })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("complementary", { name: "Video Settings" })).not.toBeInTheDocument();
  });

  it("allows selecting specific queued files via checkboxes and only starts checked jobs", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValueOnce({ installed: true });

    const tsJob: Job = {
      id: "vid-ts",
      type: "video",
      inputPath: "C:\\videos\\clip.ts",
      fileName: "clip.ts",
      originalSize: 10_000_000,
      progress: 0,
      status: "queued",
      options: DEFAULT_VIDEO_OPTIONS,
      createdAt: 1000,
    };
    const movJob: Job = {
      id: "vid-mov",
      type: "video",
      inputPath: "C:\\videos\\camera.mov",
      fileName: "camera.mov",
      originalSize: 20_000_000,
      progress: 0,
      status: "queued",
      options: DEFAULT_VIDEO_OPTIONS,
      createdAt: 2000,
    };

    vi.mocked(tauri.getJobs).mockImplementation(async (mt) =>
      mt === "video" ? [tsJob, movJob] : []
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("clip.ts")).toBeInTheDocument();
      expect(screen.getByText("camera.mov")).toBeInTheDocument();
    });

    const movCheckbox = screen.getByRole("checkbox", { name: /Select camera\.mov/i }) as HTMLInputElement;
    expect(movCheckbox.checked).toBe(true);

    // Uncheck camera.mov so only clip.ts runs
    fireEvent.click(movCheckbox);
    expect(movCheckbox.checked).toBe(false);

    const startBtn = screen.getByRole("button", { name: /Start Compress \(1\)/i });
    expect(startBtn).toBeEnabled();
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(tauri.startQueue).toHaveBeenCalledWith("video", ["vid-ts"]);
    });

    // Clicking Select All from partial state checks all (2), then clicking again unchecks all (0)
    const selectAllCheckbox = screen.getByRole("checkbox", { name: /Select all queued jobs/i });
    fireEvent.click(selectAllCheckbox);
    expect(screen.getByRole("button", { name: /Start Compress \(2\)/i })).toBeEnabled();

    fireEvent.click(selectAllCheckbox);
    expect(screen.getByRole("button", { name: /Start Compress \(0\)/i })).toBeDisabled();
  });

  it("supports Audio tab: displays audio dropzone, updates audio format/bitrate, and starts audio queue", async () => {
    vi.mocked(tauri.checkFfmpegStatus).mockResolvedValue({ installed: true, version: "7.0" });
    const wavJob: Job = {
      id: "aud-1",
      type: "audio",
      inputPath: "C:\\audio\\podcast.wav",
      fileName: "podcast.wav",
      originalSize: 25_000_000,
      progress: 0,
      status: "queued",
      options: DEFAULT_AUDIO_OPTIONS,
      createdAt: 1000,
    };

    vi.mocked(tauri.getJobs).mockImplementation(async (mt) =>
      mt === "audio" ? [wavJob] : []
    );

    render(<App />);

    const audioTabBtn = await screen.findByRole("tab", { name: /Audio/i });
    fireEvent.click(audioTabBtn);

    await waitFor(() => {
      expect(screen.getByText(/Drop audio files or folders here/i)).toBeInTheDocument();
      expect(screen.getByText("podcast.wav")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Convert" }));
    expect((screen.getByLabelText("Naming Pattern") as HTMLInputElement).value).toBe(
      "{name}_converted.{ext}"
    );
    const flacBtn = screen.getByRole("button", { name: "FLAC" });
    fireEvent.click(flacBtn);

    await waitFor(() => {
      expect(tauri.updateQueuedJobsOptions).toHaveBeenCalledWith(
        "audio",
        expect.objectContaining({ outputFormat: "flac", namingPattern: "{name}_converted.{ext}" })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Trim" }));
    expect((screen.getByLabelText("Naming Pattern") as HTMLInputElement).value).toBe(
      "{name}_trimmed.{ext}"
    );

    const startBtn = screen.getByRole("button", { name: /Convert to FLAC \(1\)/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(tauri.startQueue).toHaveBeenCalledWith("audio");
    });
  });
});
