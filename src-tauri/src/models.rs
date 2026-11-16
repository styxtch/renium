use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaType {
    Video,
    Image,
    Audio,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Processing,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrack {
    pub index: u32,
    pub language: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaProbeInfo {
    pub duration_ms: Option<u64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub subtitle_tracks: Vec<SubtitleTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoOptions {
    pub output_format: String,          // mp4 | webm | mkv | mov | gif | mp3 | aac
    pub video_codec: String,            // h264 | h265 | vp9 | av1 | none
    pub rate_control: String,           // crf | bitrate | two-pass
    pub crf: u32,                       // 0..51
    pub target_bitrate_kbps: Option<u32>,
    pub encoder_preset: String,         // ultrafast .. placebo
    pub hw_accel: bool,
    pub resolution: String,             // original | 1080p | 720p | 480p | custom
    pub custom_width: Option<u32>,
    pub custom_height: Option<u32>,
    pub fps: serde_json::Value,         // "original" | 60 | 30 | 24 | "custom"
    pub custom_fps: Option<u32>,
    pub rotate: u16,                    // 0 | 90 | 180 | 270
    pub flip_horizontal: bool,
    pub flip_vertical: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trim_start_sec: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trim_end_sec: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop_x: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop_y: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop_width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop_height: Option<u32>,
    pub extract_thumbnail_sec: Option<f64>,
    pub subtitle_mode: String,          // keep | strip | burn-in | extract-srt
    pub subtitle_track_index: Option<u32>,
    pub external_srt_path: Option<String>,
    pub strip_metadata: bool,
    pub output_dir: Option<String>,
    pub naming_pattern: String,
    pub overwrite_existing: bool,
}

impl Default for VideoOptions {
    fn default() -> Self {
        Self {
            output_format: "mp4".to_string(),
            video_codec: "h264".to_string(),
            rate_control: "crf".to_string(),
            crf: 23,
            target_bitrate_kbps: Some(2500),
            encoder_preset: "medium".to_string(),
            hw_accel: true,
            resolution: "original".to_string(),
            custom_width: None,
            custom_height: None,
            fps: serde_json::json!("original"),
            custom_fps: None,
            rotate: 0,
            flip_horizontal: false,
            flip_vertical: false,
            trim_start_sec: None,
            trim_end_sec: None,
            crop_x: None,
            crop_y: None,
            crop_width: None,
            crop_height: None,
            extract_thumbnail_sec: None,
            subtitle_mode: "keep".to_string(),
            subtitle_track_index: Some(0),
            external_srt_path: None,
            strip_metadata: false,
            output_dir: None,
            naming_pattern: "{name}_compressed.{ext}".to_string(),
            overwrite_existing: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageOptions {
    pub output_format: String, // original | jpg | png | webp | avif | gif | tiff
    pub quality: u8,           // 1..100
    pub png_optimization_level: u8, // 0..6
    pub png_zopfli: bool,
    pub progressive_jpeg: bool,
    pub effort: u8,            // 1..10
    pub lossless: bool,
    pub resize_mode: String,   // none | dimensions | percentage
    pub target_width: Option<u32>,
    pub target_height: Option<u32>,
    pub resize_percentage: Option<u32>,
    pub keep_aspect_ratio: bool,
    pub rotate: u16,           // 0 | 90 | 180 | 270
    pub flip_horizontal: bool,
    pub flip_vertical: bool,
    pub grayscale: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop_x: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop_y: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop_width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop_height: Option<u32>,
    pub metadata_mode: String, // keep-all | strip-all | keep-orientation
    pub output_dir: Option<String>,
    pub naming_pattern: String,
    pub overwrite_existing: bool,
}

impl Default for ImageOptions {
    fn default() -> Self {
        Self {
            output_format: "original".to_string(),
            quality: 82,
            png_optimization_level: 3,
            png_zopfli: false,
            progressive_jpeg: true,
            effort: 6,
            lossless: false,
            resize_mode: "none".to_string(),
            target_width: None,
            target_height: None,
            resize_percentage: Some(50),
            keep_aspect_ratio: true,
            rotate: 0,
            flip_horizontal: false,
            flip_vertical: false,
            grayscale: false,
            crop_x: None,
            crop_y: None,
            crop_width: None,
            crop_height: None,
            metadata_mode: "keep-orientation".to_string(),
            output_dir: None,
            naming_pattern: "{name}_compressed.{ext}".to_string(),
            overwrite_existing: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOptions {
    pub output_format: String, // original | mp3 | aac | m4a | wav | flac | ogg
    pub bitrate_kbps: u32,     // 64 | 96 | 128 | 192 | 256 | 320
    pub sample_rate: serde_json::Value, // "original" | 44100 | 48000
    pub channels: String,      // original | mono | stereo
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trim_start_sec: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trim_end_sec: Option<f64>,
    pub strip_metadata: bool,
    pub output_dir: Option<String>,
    pub naming_pattern: String,
    pub overwrite_existing: bool,
}

impl Default for AudioOptions {
    fn default() -> Self {
        Self {
            output_format: "original".to_string(),
            bitrate_kbps: 192,
            sample_rate: serde_json::json!("original"),
            channels: "original".to_string(),
            trim_start_sec: None,
            trim_end_sec: None,
            strip_metadata: false,
            output_dir: None,
            naming_pattern: "{name}_compressed.{ext}".to_string(),
            overwrite_existing: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum JobOptions {
    Video(VideoOptions),
    Image(ImageOptions),
    Audio(AudioOptions),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    #[serde(rename = "type")]
    pub media_type: MediaType,
    pub input_path: String,
    pub output_path: Option<String>,
    pub file_name: String,
    pub original_size: u64,
    pub output_size: Option<u64>,
    pub size_larger_warning: Option<bool>,
    pub progress: f64,
    pub eta_seconds: Option<u64>,
    pub status: JobStatus,
    pub error: Option<String>,
    pub probe_info: Option<MediaProbeInfo>,
    pub options: JobOptions,
    pub created_at: u64,
    pub started_at: Option<u64>,
    pub finished_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub id: String,
    #[serde(rename = "type")]
    pub media_type: MediaType,
    pub file_name: String,
    pub input_path: String,
    pub output_path: String,
    pub original_size: u64,
    pub output_size: u64,
    pub saved_bytes: i64,
    pub status: String, // "completed" | "failed"
    pub error: Option<String>,
    pub finished_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(rename = "type")]
    pub media_type: MediaType,
    pub built_in: bool,
    pub options: JobOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub default_output_dir: Option<String>,
    pub hw_accel: bool,
    pub max_concurrent_video_jobs: usize,
    pub max_concurrent_image_jobs: usize,
    pub check_updates: bool,
    pub auto_clear_completed: bool,
    pub custom_ffmpeg_path: Option<String>,
    pub custom_ffprobe_path: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_output_dir: None,
            hw_accel: true,
            max_concurrent_video_jobs: 1,
            max_concurrent_image_jobs: 4,
            check_updates: false,
            auto_clear_completed: false,
            custom_ffmpeg_path: None,
            custom_ffprobe_path: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub platform: String,
    pub cpu_cores: usize,
    pub hw_encoders: Vec<String>,
    pub has_nvenc: bool,
    pub has_qsv: bool,
    pub has_amf: bool,
    pub has_videotoolbox: bool,
    pub has_vaapi: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub source: Option<String>, // "appdata" | "custom" | "system"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPreviewResponse {
    pub original_data_url: String,
    pub processed_data_url: String,
    pub original_width: u32,
    pub original_height: u32,
    pub processed_width: u32,
    pub processed_height: u32,
    pub original_size: u64,
    pub processed_size: u64,
    pub estimated_output_size: Option<u64>,
    pub duration_ms: Option<u64>,
    pub preview_time_sec: f64,
    pub processed_format: String,
}
