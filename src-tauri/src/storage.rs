use std::fs;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::models::{AppSettings, AudioOptions, HistoryItem, ImageOptions, Job, JobOptions, MediaType, Preset, VideoOptions};

#[derive(Debug, Clone)]
pub struct StoragePaths {
    pub root_dir: PathBuf,
    pub bin_dir: PathBuf,
    pub settings_file: PathBuf,
    pub presets_file: PathBuf,
    pub history_file: PathBuf,
    pub recovery_file: PathBuf,
}

impl StoragePaths {
    pub fn from_root(root_dir: PathBuf) -> Self {
        let bin_dir = root_dir.join("bin");
        Self {
            settings_file: root_dir.join("settings.json"),
            presets_file: root_dir.join("presets.json"),
            history_file: root_dir.join("history.json"),
            recovery_file: root_dir.join("queue_recovery.json"),
            root_dir,
            bin_dir,
        }
    }

    pub fn ensure_dirs(&self) -> Result<(), AppError> {
        fs::create_dir_all(&self.root_dir)?;
        fs::create_dir_all(&self.bin_dir)?;
        Ok(())
    }
}

pub fn load_json_or_default<T: serde::de::DeserializeOwned + Default>(path: &Path) -> T {
    if !path.exists() {
        return T::default();
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_json_atomic<T: serde::Serialize>(path: &Path, value: &T) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    let data = serde_json::to_string_pretty(value)?;
    fs::write(&tmp, data)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn load_settings(paths: &StoragePaths) -> AppSettings {
    load_json_or_default(&paths.settings_file)
}

pub fn save_settings(paths: &StoragePaths, settings: &AppSettings) -> Result<(), AppError> {
    save_json_atomic(&paths.settings_file, settings)
}

pub fn load_history(paths: &StoragePaths) -> Vec<HistoryItem> {
    load_json_or_default(&paths.history_file)
}

pub fn save_history(paths: &StoragePaths, history: &[HistoryItem]) -> Result<(), AppError> {
    save_json_atomic(&paths.history_file, &history)
}

pub fn load_recovery_jobs(paths: &StoragePaths) -> Vec<Job> {
    load_json_or_default(&paths.recovery_file)
}

pub fn save_recovery_jobs(paths: &StoragePaths, jobs: &[Job]) -> Result<(), AppError> {
    save_json_atomic(&paths.recovery_file, &jobs)
}

pub fn built_in_presets() -> Vec<Preset> {
    vec![
        Preset {
            id: "builtin-video-web-balanced".to_string(),
            name: "Web Balanced (MP4 H.264)".to_string(),
            description: "High compatibility MP4 with CRF 23 and balanced compression".to_string(),
            media_type: MediaType::Video,
            built_in: true,
            options: JobOptions::Video(VideoOptions::default()),
        },
        Preset {
            id: "builtin-video-youtube-1080p".to_string(),
            name: "YouTube 1080p High Quality".to_string(),
            description: "Crisp 1080p H.264 CRF 19 ready for upload".to_string(),
            media_type: MediaType::Video,
            built_in: true,
            options: JobOptions::Video(VideoOptions {
                crf: 19,
                resolution: "1080p".to_string(),
                encoder_preset: "slow".to_string(),
                ..VideoOptions::default()
            }),
        },
        Preset {
            id: "builtin-video-hevc-compact".to_string(),
            name: "Compact Archive (H.265)".to_string(),
            description: "Maximum space savings using HEVC CRF 26".to_string(),
            media_type: MediaType::Video,
            built_in: true,
            options: JobOptions::Video(VideoOptions {
                video_codec: "h265".to_string(),
                crf: 26,
                ..VideoOptions::default()
            }),
        },
        Preset {
            id: "builtin-video-gif".to_string(),
            name: "Animated GIF (15fps)".to_string(),
            description: "High-quality palette GIF scaled to 720p".to_string(),
            media_type: MediaType::Video,
            built_in: true,
            options: JobOptions::Video(VideoOptions {
                output_format: "gif".to_string(),
                video_codec: "none".to_string(),
                resolution: "720p".to_string(),
                fps: serde_json::json!("custom"),
                custom_fps: Some(15),
                ..VideoOptions::default()
            }),
        },
        Preset {
            id: "builtin-image-keep-original".to_string(),
            name: "Smart Compress (Keep Format)".to_string(),
            description: "Compress JPG, PNG, WebP, or AVIF while keeping original format".to_string(),
            media_type: MediaType::Image,
            built_in: true,
            options: JobOptions::Image(ImageOptions::default()),
        },
        Preset {
            id: "builtin-image-web-webp".to_string(),
            name: "Web Optimized (WebP)".to_string(),
            description: "Modern WebP format at quality 80 with stripped EXIF".to_string(),
            media_type: MediaType::Image,
            built_in: true,
            options: JobOptions::Image(ImageOptions {
                output_format: "webp".to_string(),
                quality: 80,
                metadata_mode: "keep-orientation".to_string(),
                ..ImageOptions::default()
            }),
        },
        Preset {
            id: "builtin-image-tiny-png".to_string(),
            name: "Lossless PNG (OxiPNG)".to_string(),
            description: "Maximum lossless PNG compression at level 4".to_string(),
            media_type: MediaType::Image,
            built_in: true,
            options: JobOptions::Image(ImageOptions {
                output_format: "png".to_string(),
                png_optimization_level: 4,
                lossless: true,
                ..ImageOptions::default()
            }),
        },
        Preset {
            id: "builtin-image-avif-ultra".to_string(),
            name: "Next-Gen AVIF".to_string(),
            description: "Ultra-small AVIF images for modern web delivery".to_string(),
            media_type: MediaType::Image,
            built_in: true,
            options: JobOptions::Image(ImageOptions {
                output_format: "avif".to_string(),
                quality: 72,
                effort: 6,
                ..ImageOptions::default()
            }),
        },
        Preset {
            id: "builtin-audio-mp3-balanced".to_string(),
            name: "MP3 Balanced (192 kbps)".to_string(),
            description: "High compatibility MP3 at 192 kbps stereo".to_string(),
            media_type: MediaType::Audio,
            built_in: true,
            options: JobOptions::Audio(AudioOptions {
                output_format: "mp3".to_string(),
                bitrate_kbps: 192,
                ..AudioOptions::default()
            }),
        },
        Preset {
            id: "builtin-audio-aac-compact".to_string(),
            name: "AAC Compact (128 kbps)".to_string(),
            description: "Small M4A/AAC audio ideal for voice and mobile".to_string(),
            media_type: MediaType::Audio,
            built_in: true,
            options: JobOptions::Audio(AudioOptions {
                output_format: "m4a".to_string(),
                bitrate_kbps: 128,
                ..AudioOptions::default()
            }),
        },
        Preset {
            id: "builtin-audio-flac-lossless".to_string(),
            name: "Lossless Archive (FLAC)".to_string(),
            description: "Bit-exact lossless FLAC audio compression".to_string(),
            media_type: MediaType::Audio,
            built_in: true,
            options: JobOptions::Audio(AudioOptions {
                output_format: "flac".to_string(),
                ..AudioOptions::default()
            }),
        },
    ]
}

pub fn load_custom_presets(paths: &StoragePaths) -> Vec<Preset> {
    load_json_or_default(&paths.presets_file)
}

pub fn save_custom_presets(paths: &StoragePaths, presets: &[Preset]) -> Result<(), AppError> {
    let custom_only: Vec<&Preset> = presets.iter().filter(|p| !p.built_in).collect();
    save_json_atomic(&paths.presets_file, &custom_only)
}
