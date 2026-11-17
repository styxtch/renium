use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::error::AppError;
use crate::models::{AudioOptions, MediaProbeInfo};
use crate::processors::video::run_ffmpeg_once;
use crate::queue::process_control::ActiveProcessRegistry;
use crate::utils::fs::{cleanup_part_file, part_path_for, resolve_output_path};

pub struct AudioProcessResult {
    pub output_path: PathBuf,
    pub output_size: u64,
    pub original_size: u64,
    pub size_larger_warning: bool,
}

pub fn target_extension_for_audio(input_path: &Path, options: &AudioOptions) -> String {
    if options.output_format == "original" {
        return input_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_ascii_lowercase())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "mp3".to_string());
    }
    options.output_format.to_ascii_lowercase()
}

pub fn effective_audio_trimmed_duration_ms(
    orig_duration_ms: Option<u64>,
    options: &AudioOptions,
) -> Option<u64> {
    let start_sec = options.trim_start_sec.unwrap_or(0.0).max(0.0);
    let end_sec = options.trim_end_sec.filter(|&e| e > start_sec);
    match (orig_duration_ms, end_sec) {
        (Some(orig), Some(end)) => {
            let orig_sec = (orig as f64) / 1000.0;
            let clamped_end = end.min(orig_sec);
            let span = (clamped_end - start_sec).max(0.0);
            Some((span * 1000.0).round() as u64)
        }
        (Some(orig), None) if start_sec > 0.0 => {
            let start_ms = (start_sec * 1000.0).round() as u64;
            Some(orig.saturating_sub(start_ms).max(1))
        }
        (None, Some(end)) => Some(((end - start_sec).max(0.0) * 1000.0).round() as u64),
        _ => orig_duration_ms,
    }
}

pub fn build_audio_ffmpeg_args(
    input_path: &Path,
    output_part_path: &Path,
    target_ext: &str,
    options: &AudioOptions,
    trimmed_duration_ms: Option<u64>,
) -> Vec<String> {
    let mut args = vec![
        "-y".to_string(),
        "-hide_banner".to_string(),
    ];

    let start_sec = options.trim_start_sec.unwrap_or(0.0).max(0.0);
    if start_sec > 0.0 {
        args.extend(["-ss".to_string(), format!("{start_sec:.3}")]);
    }

    args.extend(["-i".to_string(), input_path.to_string_lossy().to_string()]);

    if let Some(end_sec) = options.trim_end_sec.filter(|&e| e > start_sec) {
        let dur = end_sec - start_sec;
        args.extend(["-t".to_string(), format!("{dur:.3}")]);
    }

    args.push("-vn".to_string());

    let bitrate = options.bitrate_kbps.clamp(32, 512);
    match target_ext {
        "mp3" => {
            args.extend([
                "-c:a".to_string(),
                "libmp3lame".to_string(),
                "-b:a".to_string(),
                format!("{bitrate}k"),
                "-f".to_string(),
                "mp3".to_string(),
            ]);
        }
        "aac" => {
            args.extend([
                "-c:a".to_string(),
                "aac".to_string(),
                "-b:a".to_string(),
                format!("{bitrate}k"),
                "-f".to_string(),
                "adts".to_string(),
            ]);
        }
        "m4a" => {
            args.extend([
                "-c:a".to_string(),
                "aac".to_string(),
                "-b:a".to_string(),
                format!("{bitrate}k"),
                "-f".to_string(),
                "mp4".to_string(),
            ]);
        }
        "ogg" | "opus" => {
            args.extend([
                "-c:a".to_string(),
                "libopus".to_string(),
                "-b:a".to_string(),
                format!("{bitrate}k"),
                "-f".to_string(),
                "ogg".to_string(),
            ]);
        }
        "flac" => {
            args.extend([
                "-c:a".to_string(),
                "flac".to_string(),
                "-f".to_string(),
                "flac".to_string(),
            ]);
        }
        "wav" => {
            args.extend([
                "-c:a".to_string(),
                "pcm_s16le".to_string(),
                "-f".to_string(),
                "wav".to_string(),
            ]);
        }
        "wma" => {
            args.extend([
                "-c:a".to_string(),
                "wmav2".to_string(),
                "-b:a".to_string(),
                format!("{bitrate}k"),
                "-f".to_string(),
                "asf".to_string(),
            ]);
        }
        "aiff" => {
            args.extend([
                "-c:a".to_string(),
                "pcm_s16be".to_string(),
                "-f".to_string(),
                "aiff".to_string(),
            ]);
        }
        _ => {
            args.extend([
                "-c:a".to_string(),
                "aac".to_string(),
                "-b:a".to_string(),
                format!("{bitrate}k"),
                "-f".to_string(),
                "mp4".to_string(),
            ]);
        }
    }

    if let Some(sr) = options.sample_rate.as_u64() {
        args.extend(["-ar".to_string(), sr.to_string()]);
    }

    match options.channels.as_str() {
        "mono" => args.extend(["-ac".to_string(), "1".to_string()]),
        "stereo" => args.extend(["-ac".to_string(), "2".to_string()]),
        _ => {}
    }

    if options.strip_metadata {
        args.extend(["-map_metadata".to_string(), "-1".to_string()]);
    }

    let mut af_filters = Vec::new();
    if let Some(gain_db) = options.volume_gain_db.filter(|g| g.abs() > 0.05) {
        af_filters.push(format!("volume={gain_db:.1}dB"));
    }
    if let Some(lufs) = options.loudness_target_lufs {
        af_filters.push(format!("loudnorm=I={lufs}:TP=-1.5:LRA=11"));
    }
    if let Some(fade_in) = options.fade_in_sec.filter(|&d| d > 0.0) {
        af_filters.push(format!("afade=t=in:st=0:d={fade_in:.2}"));
    }
    if let Some(fade_out) = options.fade_out_sec.filter(|&d| d > 0.0) {
        if let Some(dur_ms) = trimmed_duration_ms.filter(|&ms| ms > 0) {
            let dur_sec = (dur_ms as f64) / 1000.0;
            let st = (dur_sec - fade_out).max(0.0);
            af_filters.push(format!("afade=t=out:st={st:.3}:d={fade_out:.2}"));
        }
    }
    if !af_filters.is_empty() {
        args.extend(["-af".to_string(), af_filters.join(",")]);
    }

    args.extend([
        "-progress".to_string(),
        "pipe:2".to_string(),
        "-nostats".to_string(),
        output_part_path.to_string_lossy().to_string(),
    ]);

    args
}

pub async fn process_audio_job<F, L>(
    job_id: &str,
    ffmpeg_path: &Path,
    input_path: &Path,
    options: &AudioOptions,
    global_output_dir: Option<&str>,
    probe: Option<&MediaProbeInfo>,
    registry: &Arc<ActiveProcessRegistry>,
    mut on_progress: F,
    mut on_log: L,
) -> Result<AudioProcessResult, AppError>
where
    F: FnMut(f64, Option<u64>),
    L: FnMut(&str),
{
    if !input_path.is_file() {
        return Err(AppError::IoError(format!(
            "Input audio not found: {}",
            input_path.display()
        )));
    }

    let original_size = std::fs::metadata(input_path)?.len();
    let target_ext = target_extension_for_audio(input_path, options);
    let effective_output_dir = options.output_dir.as_deref().or(global_output_dir);

    let output_path = resolve_output_path(
        input_path,
        effective_output_dir,
        &options.naming_pattern,
        &target_ext,
        None,
        None,
        options.overwrite_existing,
    );

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let part_path = part_path_for(&output_path);
    let duration_ms =
        effective_audio_trimmed_duration_ms(probe.and_then(|p| p.duration_ms), options);
    let args = build_audio_ffmpeg_args(input_path, &part_path, &target_ext, options, duration_ms);

    let file_label = input_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("audio");
    on_log(&format!("[renium] Starting audio job: {file_label}"));

    let result = run_ffmpeg_once(
        ffmpeg_path,
        &args,
        job_id,
        duration_ms,
        0.0,
        100.0,
        registry,
        &mut on_progress,
        &mut on_log,
    )
    .await;

    if let Err((code, stderr)) = result {
        cleanup_part_file(&part_path);
        return Err(AppError::EncodeFailed(format!(
            "FFmpeg exited with code {code}: {stderr}"
        )));
    }

    if let Err(e) = std::fs::rename(&part_path, &output_path) {
        cleanup_part_file(&part_path);
        return Err(e.into());
    }

    on_progress(100.0, Some(0));
    let output_size = std::fs::metadata(&output_path)?.len();
    let size_larger_warning = output_size >= original_size;

    Ok(AudioProcessResult {
        output_path,
        output_size,
        original_size,
        size_larger_warning,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_audio_ffmpeg_args_with_trim_and_codec() {
        let input = PathBuf::from("/tmp/song.wav");
        let part = PathBuf::from("/tmp/song_compressed.mp3.part");
        let opts = AudioOptions {
            output_format: "mp3".to_string(),
            bitrate_kbps: 256,
            sample_rate: serde_json::json!(44100),
            channels: "stereo".to_string(),
            trim_start_sec: Some(5.0),
            trim_end_sec: Some(20.0),
            strip_metadata: true,
            volume_gain_db: Some(3.5),
            loudness_target_lufs: Some(-16),
            fade_in_sec: Some(1.5),
            fade_out_sec: Some(2.0),
            ..AudioOptions::default()
        };

        let ext = target_extension_for_audio(&input, &opts);
        assert_eq!(ext, "mp3");

        let args = build_audio_ffmpeg_args(&input, &part, &ext, &opts, Some(15_000));
        assert!(!args.contains(&"-loglevel".to_string()));
        assert!(args.windows(2).any(|w| w == ["-progress", "pipe:2"]));
        assert!(args.windows(2).any(|w| w == ["-ss", "5.000"]));
        assert!(args.windows(2).any(|w| w == ["-t", "15.000"]));
        assert!(args.windows(2).any(|w| w == ["-c:a", "libmp3lame"]));
        assert!(args.windows(2).any(|w| w == ["-b:a", "256k"]));
        assert!(args.windows(2).any(|w| w == ["-ar", "44100"]));
        assert!(args.windows(2).any(|w| w == ["-ac", "2"]));
        assert!(args.windows(2).any(|w| w == ["-map_metadata", "-1"]));
        let af_idx = args.iter().position(|a| a == "-af").unwrap();
        assert_eq!(
            args[af_idx + 1],
            "volume=3.5dB,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=1.50,afade=t=out:st=13.000:d=2.00"
        );

        let flac_opts = AudioOptions {
            output_format: "flac".to_string(),
            ..AudioOptions::default()
        };
        let flac_args = build_audio_ffmpeg_args(&input, &part, "flac", &flac_opts, None);
        assert!(flac_args.windows(2).any(|w| w == ["-c:a", "flac"]));
        assert!(flac_args.windows(2).any(|w| w == ["-f", "flac"]));
    }
}
