use std::path::Path;
use std::process::Command;

use serde::Deserialize;

use crate::error::AppError;
use crate::ffmpeg::downloader::apply_no_window_std;
use crate::models::{AudioTrack, MediaProbeInfo, SubtitleTrack};

#[derive(Debug, Deserialize)]
struct FfprobeOutput {
    format: Option<FfprobeFormat>,
    #[serde(default)]
    streams: Vec<FfprobeStream>,
}

#[derive(Debug, Deserialize)]
struct FfprobeFormat {
    duration: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FfprobeStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    r_frame_rate: Option<String>,
    avg_frame_rate: Option<String>,
    tags: Option<FfprobeTags>,
}

#[derive(Debug, Deserialize)]
struct FfprobeTags {
    language: Option<String>,
    title: Option<String>,
}

fn parse_fps_fraction(raw: &str) -> Option<f64> {
    let parts: Vec<&str> = raw.split('/').collect();
    if parts.len() == 2 {
        let num: f64 = parts[0].parse().ok()?;
        let den: f64 = parts[1].parse().ok()?;
        if den > 0.0 {
            return Some((num / den * 100.0).round() / 100.0);
        }
    }
    raw.parse::<f64>().ok()
}

pub fn parse_ffprobe_json(json_str: &str) -> Result<MediaProbeInfo, AppError> {
    let parsed: FfprobeOutput = serde_json::from_str(json_str)?;
    let mut info = MediaProbeInfo::default();

    if let Some(fmt) = parsed.format {
        if let Some(dur_str) = fmt.duration {
            if let Ok(sec) = dur_str.parse::<f64>() {
                info.duration_ms = Some((sec * 1000.0).round() as u64);
            }
        }
    }

    let mut sub_index = 0u32;
    let mut audio_index = 0u32;
    for stream in parsed.streams {
        match stream.codec_type.as_deref() {
            Some("video") if info.video_codec.is_none() => {
                info.video_codec = stream.codec_name;
                info.width = stream.width;
                info.height = stream.height;
                info.fps = stream
                    .avg_frame_rate
                    .as_deref()
                    .and_then(parse_fps_fraction)
                    .or_else(|| stream.r_frame_rate.as_deref().and_then(parse_fps_fraction));
            }
            Some("audio") => {
                if info.audio_codec.is_none() {
                    info.audio_codec = stream.codec_name.clone();
                }
                info.audio_tracks.push(AudioTrack {
                    index: audio_index,
                    codec: stream.codec_name,
                    language: stream.tags.as_ref().and_then(|t| t.language.clone()),
                    title: stream.tags.as_ref().and_then(|t| t.title.clone()),
                });
                audio_index += 1;
            }
            Some("subtitle") => {
                info.subtitle_tracks.push(SubtitleTrack {
                    index: sub_index,
                    language: stream.tags.as_ref().and_then(|t| t.language.clone()),
                    title: stream.tags.as_ref().and_then(|t| t.title.clone()),
                });
                sub_index += 1;
            }
            _ => {}
        }
    }

    Ok(info)
}

pub fn probe_video(ffprobe_path: &Path, input: &Path) -> Result<MediaProbeInfo, AppError> {
    let mut cmd = Command::new(ffprobe_path);
    cmd.args([
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
    ])
    .arg(input);
    apply_no_window_std(&mut cmd);

    let output = cmd.output()?;
    if !output.status.success() {
        return Err(AppError::EncodeFailed(format!(
            "ffprobe failed for {}",
            input.display()
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_ffprobe_json(&stdout)
}

pub fn probe_image(input: &Path) -> MediaProbeInfo {
    match image::image_dimensions(input) {
        Ok((width, height)) => MediaProbeInfo {
            width: Some(width),
            height: Some(height),
            ..Default::default()
        },
        Err(_) => MediaProbeInfo::default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ffprobe_json_streams_and_duration() {
        let sample = r#"{
            "format": { "duration": "125.5" },
            "streams": [
                { "codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080, "avg_frame_rate": "60000/1001" },
                { "codec_type": "audio", "codec_name": "aac" },
                { "codec_type": "subtitle", "codec_name": "subrip", "tags": { "language": "eng", "title": "English" } }
            ]
        }"#;

        let info = parse_ffprobe_json(sample).unwrap();
        assert_eq!(info.duration_ms, Some(125_500));
        assert_eq!(info.width, Some(1920));
        assert_eq!(info.height, Some(1080));
        assert_eq!(info.fps, Some(59.94));
        assert_eq!(info.video_codec.as_deref(), Some("h264"));
        assert_eq!(info.audio_codec.as_deref(), Some("aac"));
        assert_eq!(info.subtitle_tracks.len(), 1);
        assert_eq!(info.subtitle_tracks[0].language.as_deref(), Some("eng"));
    }
}
