use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::error::AppError;
use crate::ffmpeg::downloader::apply_no_window_tokio;
use crate::models::{Capabilities, MediaPreviewResponse, MediaProbeInfo, VideoOptions};
use crate::queue::process_control::ActiveProcessRegistry;
use crate::utils::fs::{cleanup_part_file, part_path_for, resolve_output_path, to_data_url};

#[derive(Debug, Clone)]
pub struct VideoProcessResult {
    pub output_path: PathBuf,
    pub output_size: u64,
    pub original_size: u64,
    pub size_larger_warning: bool,
}

pub fn target_extension_for_video(options: &VideoOptions) -> &'static str {
    if options.extract_thumbnail_sec.is_some() {
        return "jpg";
    }
    if options.subtitle_mode == "extract-srt" {
        return "srt";
    }
    match options.output_format.as_str() {
        "mp4" => "mp4",
        "webm" => "webm",
        "mkv" => "mkv",
        "mov" => "mov",
        "gif" => "gif",
        "mp3" => "mp3",
        "aac" => "aac",
        _ => "mp4",
    }
}

fn muxer_for_extension(ext: &str) -> &'static str {
    match ext {
        "mp4" => "mp4",
        "webm" => "webm",
        "mkv" => "matroska",
        "mov" => "mov",
        "gif" => "gif",
        "mp3" => "mp3",
        "aac" => "adts",
        "srt" => "srt",
        "jpg" => "image2",
        _ => "mp4",
    }
}

fn select_video_encoder(
    codec: &str,
    hw_accel: bool,
    rate_control: &str,
    capabilities: &Capabilities,
) -> (&'static str, bool) {
    // Two-pass encoding uses software encoders consistently across platforms
    if hw_accel && rate_control != "two-pass" {
        match codec {
            "h264" => {
                if capabilities.has_nvenc {
                    return ("h264_nvenc", true);
                }
                if capabilities.has_qsv {
                    return ("h264_qsv", true);
                }
                if capabilities.has_amf {
                    return ("h264_amf", true);
                }
                if capabilities.has_videotoolbox {
                    return ("h264_videotoolbox", true);
                }
                if capabilities.has_vaapi {
                    return ("h264_vaapi", true);
                }
            }
            "h265" => {
                if capabilities.has_nvenc {
                    return ("hevc_nvenc", true);
                }
                if capabilities.has_qsv {
                    return ("hevc_qsv", true);
                }
                if capabilities.has_amf {
                    return ("hevc_amf", true);
                }
                if capabilities.has_videotoolbox {
                    return ("hevc_videotoolbox", true);
                }
                if capabilities.has_vaapi {
                    return ("hevc_vaapi", true);
                }
            }
            "av1" => {
                if capabilities.hw_encoders.iter().any(|e| e == "av1_nvenc") {
                    return ("av1_nvenc", true);
                }
                if capabilities.hw_encoders.iter().any(|e| e == "av1_qsv") {
                    return ("av1_qsv", true);
                }
            }
            _ => {}
        }
    }

    match codec {
        "h265" => ("libx265", false),
        "vp9" => ("libvpx-vp9", false),
        "av1" => ("libsvtav1", false),
        _ => ("libx264", false),
    }
}

fn build_video_filters(options: &VideoOptions) -> Vec<String> {
    let mut filters = Vec::new();

    if let (Some(cw), Some(ch)) = (options.crop_width, options.crop_height) {
        if cw > 0 && ch > 0 {
            let cx = options.crop_x.unwrap_or(0);
            let cy = options.crop_y.unwrap_or(0);
            filters.push(format!("crop={cw}:{ch}:{cx}:{cy}"));
        }
    }

    match options.resolution.as_str() {
        "1080p" => filters.push("scale=-2:1080".to_string()),
        "720p" => filters.push("scale=-2:720".to_string()),
        "480p" => filters.push("scale=-2:480".to_string()),
        "custom" => {
            let w = options.custom_width.map(|v| v as i32).unwrap_or(-2);
            let h = options.custom_height.map(|v| v as i32).unwrap_or(-2);
            if w > 0 || h > 0 {
                filters.push(format!("scale={w}:{h}"));
            }
        }
        _ => {}
    }

    if let Some(fps_num) = options.fps.as_u64() {
        filters.push(format!("fps={fps_num}"));
    } else if options.fps.as_str() == Some("custom") {
        if let Some(cfps) = options.custom_fps {
            if cfps > 0 {
                filters.push(format!("fps={cfps}"));
            }
        }
    }

    match options.rotate {
        90 => filters.push("transpose=1".to_string()),
        180 => {
            filters.push("hflip".to_string());
            filters.push("vflip".to_string());
        }
        270 => filters.push("transpose=2".to_string()),
        _ => {}
    }

    if options.flip_horizontal {
        filters.push("hflip".to_string());
    }
    if options.flip_vertical {
        filters.push("vflip".to_string());
    }

    if options.subtitle_mode == "burn-in" {
        if let Some(srt_path) = options.external_srt_path.as_deref().filter(|s| !s.is_empty()) {
            let escaped = srt_path.replace('\\', "/").replace(':', "\\:");
            filters.push(format!("subtitles='{escaped}'"));
        }
    }

    filters
}

pub fn build_ffmpeg_args(
    input_path: &Path,
    part_output: &Path,
    options: &VideoOptions,
    capabilities: &Capabilities,
    force_software: bool,
    pass: Option<u8>,
    pass_log_prefix: Option<&Path>,
) -> Result<Vec<String>, AppError> {
    let mut args = vec![
        "-y".to_string(),
        "-hide_banner".to_string(),
        "-progress".to_string(),
        "pipe:2".to_string(),
        "-nostats".to_string(),
    ];

    if let Some(sec) = options.extract_thumbnail_sec {
        args.push("-ss".to_string());
        args.push(format!("{sec:.3}"));
        args.push("-i".to_string());
        args.push(input_path.to_string_lossy().to_string());
        args.push("-vframes".to_string());
        args.push("1".to_string());
        args.push("-q:v".to_string());
        args.push("2".to_string());
        args.push("-f".to_string());
        args.push("image2".to_string());
        args.push(part_output.to_string_lossy().to_string());
        return Ok(args);
    }

    let trim_start = options.trim_start_sec.filter(|&s| s > 0.0);
    let trim_end = options.trim_end_sec.filter(|&e| e >= 0.0);
    let trim_duration = match (trim_start, trim_end) {
        (Some(s), Some(e)) if e > s => Some(e - s),
        (None, Some(e)) if e > 0.0 => Some(e),
        _ => None,
    };

    if let Some(start) = trim_start {
        args.push("-ss".to_string());
        args.push(format!("{start:.3}"));
    }

    args.push("-i".to_string());
    args.push(input_path.to_string_lossy().to_string());

    if let Some(dur) = trim_duration {
        args.push("-t".to_string());
        args.push(format!("{dur:.3}"));
    }

    if options.subtitle_mode == "extract-srt" {
        let idx = options.subtitle_track_index.unwrap_or(0);
        args.push("-map".to_string());
        args.push(format!("0:s:{idx}"));
        args.push("-c:s".to_string());
        args.push("srt".to_string());
        args.push("-f".to_string());
        args.push("srt".to_string());
        args.push(part_output.to_string_lossy().to_string());
        return Ok(args);
    }

    let ext = target_extension_for_video(options);

    // Audio-only outputs
    if ext == "mp3" || ext == "aac" {
        args.push("-vn".to_string());
        if ext == "mp3" {
            args.push("-c:a".to_string());
            args.push("libmp3lame".to_string());
        } else {
            args.push("-c:a".to_string());
            args.push("aac".to_string());
        }
        let kbps = options.target_bitrate_kbps.unwrap_or(192);
        args.push("-b:a".to_string());
        args.push(format!("{kbps}k"));
        if options.strip_metadata {
            args.push("-map_metadata".to_string());
            args.push("-1".to_string());
        }
        args.push("-f".to_string());
        args.push(muxer_for_extension(ext).to_string());
        args.push(part_output.to_string_lossy().to_string());
        return Ok(args);
    }

    // GIF output with high-quality palettegen/paletteuse
    if ext == "gif" {
        let mut filters = build_video_filters(options);
        if filters.iter().all(|f| !f.starts_with("fps=")) {
            filters.insert(0, "fps=15".to_string());
        }
        let chain = format!(
            "{},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
            filters.join(",")
        );
        args.push("-vf".to_string());
        args.push(chain);
        args.push("-an".to_string());
        args.push("-f".to_string());
        args.push("gif".to_string());
        args.push(part_output.to_string_lossy().to_string());
        return Ok(args);
    }

    // Standard video encoding
    let use_hw = options.hw_accel && !force_software;
    let (encoder, is_hw) = select_video_encoder(
        &options.video_codec,
        use_hw,
        &options.rate_control,
        capabilities,
    );

    let filters = build_video_filters(options);
    if !filters.is_empty() {
        args.push("-vf".to_string());
        args.push(filters.join(","));
    }

    args.push("-c:v".to_string());
    args.push(encoder.to_string());

    if is_hw {
        if options.rate_control == "bitrate" {
            let kbps = options.target_bitrate_kbps.unwrap_or(2500);
            args.push("-b:v".to_string());
            args.push(format!("{kbps}k"));
        } else if encoder.ends_with("nvenc") {
            args.push("-rc".to_string());
            args.push("vbr".to_string());
            args.push("-cq".to_string());
            args.push(options.crf.to_string());
        } else if encoder.ends_with("qsv") {
            args.push("-global_quality".to_string());
            args.push(options.crf.to_string());
        } else if encoder.ends_with("videotoolbox") {
            let qv = (100u32.saturating_sub(options.crf * 2)).clamp(20, 85);
            args.push("-q:v".to_string());
            args.push(qv.to_string());
        } else {
            args.push("-b:v".to_string());
            args.push("2500k".to_string());
        }
    } else {
        match options.rate_control.as_str() {
            "bitrate" => {
                let kbps = options.target_bitrate_kbps.unwrap_or(2500);
                args.push("-b:v".to_string());
                args.push(format!("{kbps}k"));
            }
            "two-pass" => {
                let kbps = options.target_bitrate_kbps.unwrap_or(2500);
                args.push("-b:v".to_string());
                args.push(format!("{kbps}k"));
                if let Some(p) = pass {
                    args.push("-pass".to_string());
                    args.push(p.to_string());
                }
                if let Some(prefix) = pass_log_prefix {
                    args.push("-passlogfile".to_string());
                    args.push(prefix.to_string_lossy().to_string());
                }
            }
            _ => {
                // CRF mode
                args.push("-crf".to_string());
                args.push(options.crf.to_string());
                if encoder == "libvpx-vp9" {
                    args.push("-b:v".to_string());
                    args.push("0".to_string());
                }
            }
        }

        if encoder == "libx264" || encoder == "libx265" {
            args.push("-preset".to_string());
            args.push(options.encoder_preset.clone());
        }
    }

    if pass == Some(1) {
        args.push("-an".to_string());
        args.push("-f".to_string());
        args.push("null".to_string());
        #[cfg(windows)]
        args.push("NUL".to_string());
        #[cfg(not(windows))]
        args.push("/dev/null".to_string());
        return Ok(args);
    }

    // Audio & subtitles for final pass
    if ext == "webm" {
        args.push("-c:a".to_string());
        args.push("libopus".to_string());
    } else {
        args.push("-c:a".to_string());
        args.push("aac".to_string());
        args.push("-b:a".to_string());
        args.push("128k".to_string());
    }

    if options.subtitle_mode == "strip" || options.subtitle_mode == "burn-in" {
        args.push("-sn".to_string());
    } else if options.subtitle_mode == "keep" && (ext == "mkv" || ext == "mp4" || ext == "mov") {
        if ext == "mp4" || ext == "mov" {
            args.push("-c:s".to_string());
            args.push("mov_text".to_string());
        } else {
            args.push("-c:s".to_string());
            args.push("copy".to_string());
        }
    }

    if options.strip_metadata {
        args.push("-map_metadata".to_string());
        args.push("-1".to_string());
    }

    if ext == "mp4" || ext == "mov" {
        args.push("-movflags".to_string());
        args.push("+faststart".to_string());
    }

    args.push("-f".to_string());
    args.push(muxer_for_extension(ext).to_string());
    args.push(part_output.to_string_lossy().to_string());

    Ok(args)
}

fn parse_progress_line(line: &str) -> Option<u64> {
    if let Some(rest) = line.strip_prefix("out_time_us=") {
        if let Ok(us) = rest.trim().parse::<u64>() {
            return Some(us / 1000);
        }
    }
    if let Some(rest) = line.strip_prefix("out_time=") {
        let parts: Vec<&str> = rest.trim().split(':').collect();
        if parts.len() == 3 {
            let h: f64 = parts[0].parse().ok()?;
            let m: f64 = parts[1].parse().ok()?;
            let s: f64 = parts[2].parse().ok()?;
            return Some(((h * 3600.0 + m * 60.0 + s) * 1000.0) as u64);
        }
    }
    None
}

pub(crate) async fn run_ffmpeg_once<F>(
    ffmpeg_path: &Path,
    args: &[String],
    job_id: &str,
    duration_ms: Option<u64>,
    pass_offset: f64,
    pass_scale: f64,
    registry: &Arc<ActiveProcessRegistry>,
    on_progress: &mut F,
) -> Result<(), (i32, String)>
where
    F: FnMut(f64, Option<u64>),
{
    let mut cmd = Command::new(ffmpeg_path);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    apply_no_window_tokio(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| (-1, format!("Failed to spawn ffmpeg: {e}")))?;

    if let Some(pid) = child.id() {
        registry.register(job_id, pid);
    }

    let stderr = child.stderr.take();
    let mut error_tail: Vec<String> = Vec::new();
    let started = std::time::Instant::now();

    if let Some(err_stream) = stderr {
        let mut lines = BufReader::new(err_stream).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(current_ms) = parse_progress_line(&line) {
                if let Some(total_ms) = duration_ms.filter(|&d| d > 0) {
                    let ratio = (current_ms as f64 / total_ms as f64).clamp(0.0, 1.0);
                    let pct = (pass_offset + ratio * pass_scale).clamp(0.0, 99.5);
                    let elapsed = started.elapsed().as_secs_f64();
                    let eta = if ratio > 0.02 {
                        Some(((elapsed / ratio) * (1.0 - ratio)).round() as u64)
                    } else {
                        None
                    };
                    on_progress(pct, eta);
                }
            } else if !line.starts_with("frame=")
                && !line.starts_with("fps=")
                && !line.starts_with("stream_")
                && !line.starts_with("bitrate=")
                && !line.starts_with("total_size=")
                && !line.starts_with("out_time_")
                && !line.starts_with("dup_frames=")
                && !line.starts_with("drop_frames=")
                && !line.starts_with("speed=")
                && !line.starts_with("progress=")
            {
                if error_tail.len() >= 15 {
                    error_tail.remove(0);
                }
                error_tail.push(line);
            }
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| (-1, format!("Failed waiting on ffmpeg: {e}")))?;
    registry.unregister(job_id);

    if status.success() {
        Ok(())
    } else {
        let code = status.code().unwrap_or(-1);
        Err((code, error_tail.join("\n")))
    }
}

pub async fn process_video_job<F>(
    job_id: &str,
    ffmpeg_path: &Path,
    input_path: &Path,
    options: &VideoOptions,
    global_output_dir: Option<&str>,
    capabilities: &Capabilities,
    probe: Option<&MediaProbeInfo>,
    registry: &Arc<ActiveProcessRegistry>,
    mut on_progress: F,
) -> Result<VideoProcessResult, AppError>
where
    F: FnMut(f64, Option<u64>),
{
    if !input_path.is_file() {
        return Err(AppError::IoError(format!(
            "Input video not found: {}",
            input_path.display()
        )));
    }

    let original_size = std::fs::metadata(input_path)?.len();
    let target_ext = target_extension_for_video(options);
    let effective_output_dir = options.output_dir.as_deref().or(global_output_dir);

    let output_path = resolve_output_path(
        input_path,
        effective_output_dir,
        &options.naming_pattern,
        target_ext,
        probe.and_then(|p| p.width),
        probe.and_then(|p| p.height),
        options.overwrite_existing,
    );

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let part_path = part_path_for(&output_path);
    let duration_ms = effective_trimmed_duration_ms(probe.and_then(|p| p.duration_ms), options);

    let result = if options.rate_control == "two-pass"
        && options.extract_thumbnail_sec.is_none()
        && options.subtitle_mode != "extract-srt"
        && target_ext != "gif"
        && target_ext != "mp3"
        && target_ext != "aac"
    {
        let temp_dir = std::env::temp_dir().join(format!("renium_2pass_{job_id}"));
        std::fs::create_dir_all(&temp_dir)?;
        let log_prefix = temp_dir.join("ffmpeg2pass");

        let pass1_args = build_ffmpeg_args(
            input_path,
            &part_path,
            options,
            capabilities,
            true,
            Some(1),
            Some(&log_prefix),
        )?;
        let p1 = run_ffmpeg_once(
            ffmpeg_path,
            &pass1_args,
            job_id,
            duration_ms,
            0.0,
            50.0,
            registry,
            &mut on_progress,
        )
        .await;

        if let Err((code, stderr)) = p1 {
            let _ = std::fs::remove_dir_all(&temp_dir);
            cleanup_part_file(&part_path);
            return Err(AppError::EncodeFailed(format!(
                "FFmpeg two-pass (pass 1) failed (exit {code}): {stderr}"
            )));
        }

        let pass2_args = build_ffmpeg_args(
            input_path,
            &part_path,
            options,
            capabilities,
            true,
            Some(2),
            Some(&log_prefix),
        )?;
        let p2 = run_ffmpeg_once(
            ffmpeg_path,
            &pass2_args,
            job_id,
            duration_ms,
            50.0,
            50.0,
            registry,
            &mut on_progress,
        )
        .await;
        let _ = std::fs::remove_dir_all(&temp_dir);
        p2
    } else {
        let args = build_ffmpeg_args(
            input_path,
            &part_path,
            options,
            capabilities,
            false,
            None,
            None,
        )?;
        let attempt = run_ffmpeg_once(
            ffmpeg_path,
            &args,
            job_id,
            duration_ms,
            0.0,
            100.0,
            registry,
            &mut on_progress,
        )
        .await;

        // Graceful fallback to software encoder if HW accel fails
        match attempt {
            Err(_) if options.hw_accel => {
                cleanup_part_file(&part_path);
                let sw_args = build_ffmpeg_args(
                    input_path,
                    &part_path,
                    options,
                    capabilities,
                    true,
                    None,
                    None,
                )?;
                run_ffmpeg_once(
                    ffmpeg_path,
                    &sw_args,
                    job_id,
                    duration_ms,
                    0.0,
                    100.0,
                    registry,
                    &mut on_progress,
                )
                .await
            }
            other => other,
        }
    };

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

    Ok(VideoProcessResult {
        output_path,
        output_size,
        original_size,
        size_larger_warning,
    })
}

pub fn effective_trimmed_duration_ms(
    orig_duration_ms: Option<u64>,
    options: &VideoOptions,
) -> Option<u64> {
    let start_ms = options
        .trim_start_sec
        .filter(|&s| s > 0.0)
        .map(|s| (s * 1000.0).round() as u64)
        .unwrap_or(0);

    match (options.trim_end_sec.filter(|&e| e >= 0.0), orig_duration_ms) {
        (Some(end_sec), _) => {
            let end_ms = (end_sec * 1000.0).round() as u64;
            let capped_end = orig_duration_ms.map(|d| end_ms.min(d)).unwrap_or(end_ms);
            if capped_end > start_ms {
                Some(capped_end - start_ms)
            } else {
                orig_duration_ms
            }
        }
        (None, Some(total)) if start_ms > 0 && total > start_ms => Some(total - start_ms),
        _ => orig_duration_ms,
    }
}

fn round_even_dim(val: f64) -> u32 {
    let n = val.round().max(2.0) as u32;
    if n % 2 == 1 {
        n + 1
    } else {
        n
    }
}

pub fn compute_video_output_dimensions(
    orig_w: u32,
    orig_h: u32,
    options: &VideoOptions,
) -> (u32, u32) {
    let mut w = orig_w.max(2);
    let mut h = orig_h.max(2);

    if let (Some(cw), Some(ch)) = (options.crop_width, options.crop_height) {
        if cw > 0 && ch > 0 {
            let cx = options.crop_x.unwrap_or(0).min(w.saturating_sub(1));
            let cy = options.crop_y.unwrap_or(0).min(h.saturating_sub(1));
            w = cw.min(w - cx).max(2);
            h = ch.min(h - cy).max(2);
        }
    }

    match options.resolution.as_str() {
        "1080p" => {
            w = round_even_dim((w as f64) * 1080.0 / (h as f64));
            h = 1080;
        }
        "720p" => {
            w = round_even_dim((w as f64) * 720.0 / (h as f64));
            h = 720;
        }
        "480p" => {
            w = round_even_dim((w as f64) * 480.0 / (h as f64));
            h = 480;
        }
        "custom" => match (
            options.custom_width.filter(|&v| v > 0),
            options.custom_height.filter(|&v| v > 0),
        ) {
            (Some(tw), Some(th)) => {
                w = tw;
                h = th;
            }
            (Some(tw), None) => {
                h = round_even_dim((h as f64) * (tw as f64) / (w as f64));
                w = tw;
            }
            (None, Some(th)) => {
                w = round_even_dim((w as f64) * (th as f64) / (h as f64));
                h = th;
            }
            (None, None) => {}
        },
        _ => {}
    }

    if options.rotate == 90 || options.rotate == 270 {
        std::mem::swap(&mut w, &mut h);
    }

    (w, h)
}

fn estimate_video_output_size(
    original_size: u64,
    orig_w: u32,
    orig_h: u32,
    proc_w: u32,
    proc_h: u32,
    orig_duration_ms: Option<u64>,
    effective_duration_ms: Option<u64>,
    options: &VideoOptions,
) -> Option<u64> {
    let eff_ms = effective_duration_ms.or(orig_duration_ms)?;
    let dur_sec = (eff_ms as f64) / 1000.0;
    if dur_sec <= 0.0 {
        return None;
    }

    let ext = target_extension_for_video(options);
    if ext == "mp3" || ext == "aac" {
        let kbps = options.target_bitrate_kbps.unwrap_or(192) as f64;
        return Some(((kbps * 1000.0 / 8.0) * dur_sec).round().max(1.0) as u64);
    }

    if options.rate_control == "cbr" || options.rate_control == "two-pass" {
        let video_kbps = options.target_bitrate_kbps.unwrap_or(2500) as f64;
        let audio_kbps = 128.0;
        return Some((((video_kbps + audio_kbps) * 1000.0 / 8.0) * dur_sec).round().max(1.0) as u64);
    }

    let orig_dur_ms = orig_duration_ms.unwrap_or(eff_ms).max(1) as f64;
    let dur_ratio = (eff_ms as f64 / orig_dur_ms).clamp(0.01, 1.0);
    let area_ratio = ((proc_w as f64 * proc_h as f64) / (orig_w.max(1) as f64 * orig_h.max(1) as f64))
        .clamp(0.05, 4.0);
    let crf_factor = 2.0_f64.powf((23.0 - options.crf as f64) / 6.0).clamp(0.15, 3.0);
    let codec_factor = match options.video_codec.as_str() {
        "h265" | "av1" => 0.72,
        "vp9" => 0.78,
        _ => 1.0,
    };

    let estimated = (original_size as f64) * dur_ratio * area_ratio * 0.65 * crf_factor * codec_factor;
    Some(estimated.round().max(1024.0) as u64)
}

fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() >= 24 && &bytes[0..8] == b"\x89PNG\r\n\x1a\n" {
        let w = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
        let h = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
        if w > 0 && h > 0 {
            return Some((w, h));
        }
    }
    None
}

async fn extract_ffmpeg_frame_png(
    ffmpeg_path: &Path,
    input_path: &Path,
    seek_sec: f64,
    vf_chain: Option<&str>,
) -> Result<Vec<u8>, AppError> {
    async fn run_once(
        ffmpeg_path: &Path,
        input_path: &Path,
        seek: f64,
        vf_chain: Option<&str>,
    ) -> Result<std::process::Output, AppError> {
        let mut cmd = Command::new(ffmpeg_path);
        cmd.arg("-y")
            .arg("-hide_banner")
            .arg("-loglevel")
            .arg("error");
        if seek > 0.0 {
            cmd.arg("-ss").arg(format!("{seek:.3}"));
        }
        cmd.arg("-i").arg(input_path);
        if let Some(vf) = vf_chain.filter(|s| !s.is_empty()) {
            cmd.arg("-vf").arg(vf);
        }
        cmd.args([
            "-vframes",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "png",
            "pipe:1",
        ]);
        apply_no_window_tokio(&mut cmd);
        Ok(cmd.output().await?)
    }

    let mut out = run_once(ffmpeg_path, input_path, seek_sec, vf_chain).await?;
    if (!out.status.success() || out.stdout.is_empty()) && seek_sec > 0.0 {
        out = run_once(ffmpeg_path, input_path, 0.0, vf_chain).await?;
    }

    if !out.status.success() || out.stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(AppError::EncodeFailed(if stderr.is_empty() {
            "Failed to extract video preview frame".to_string()
        } else {
            format!("Preview frame extraction failed: {stderr}")
        }));
    }

    Ok(out.stdout)
}

pub async fn generate_video_preview(
    ffmpeg_path: &Path,
    input_path: &Path,
    probe: Option<&MediaProbeInfo>,
    options: &VideoOptions,
    preview_time_sec: Option<f64>,
) -> Result<MediaPreviewResponse, AppError> {
    if !input_path.is_file() {
        return Err(AppError::IoError(format!(
            "Input video not found: {}",
            input_path.display()
        )));
    }

    let original_size = std::fs::metadata(input_path)?.len();
    let orig_duration_ms = probe.and_then(|p| p.duration_ms);
    let duration_sec = orig_duration_ms.map(|d| (d as f64) / 1000.0).unwrap_or(0.0);

    let default_seek = if let Some(start) = options.trim_start_sec.filter(|&s| s > 0.0) {
        start
    } else if duration_sec > 0.5 {
        (duration_sec * 0.25).min(2.0)
    } else {
        0.0
    };

    let seek_sec = preview_time_sec
        .unwrap_or(default_seek)
        .max(0.0)
        .min(if duration_sec > 0.1 {
            (duration_sec - 0.05).max(0.0)
        } else {
            f64::MAX
        });

    let probed_w = probe.and_then(|p| p.width);
    let probed_h = probe.and_then(|p| p.height);
    let orig_vf = if probed_w.unwrap_or(0) > 1280 {
        Some("scale=1280:-2")
    } else {
        None
    };

    let orig_png = extract_ffmpeg_frame_png(ffmpeg_path, input_path, seek_sec, orig_vf).await?;
    let (orig_w, orig_h) = match (probed_w, probed_h) {
        (Some(w), Some(h)) if w > 0 && h > 0 => (w, h),
        _ => png_dimensions(&orig_png).unwrap_or((1920, 1080)),
    };

    let (processed_width, processed_height) =
        compute_video_output_dimensions(orig_w, orig_h, options);

    let mut proc_filters: Vec<String> = build_video_filters(options)
        .into_iter()
        .filter(|f| !f.starts_with("subtitles="))
        .collect();
    if processed_width > 1280 {
        proc_filters.push("scale=1280:-2".to_string());
    }
    let proc_vf_str = proc_filters.join(",");
    let proc_png = extract_ffmpeg_frame_png(
        ffmpeg_path,
        input_path,
        seek_sec,
        if proc_vf_str.is_empty() {
            None
        } else {
            Some(proc_vf_str.as_str())
        },
    )
    .await?;

    let eff_dur_ms = effective_trimmed_duration_ms(orig_duration_ms, options);
    let estimated_output_size = estimate_video_output_size(
        original_size,
        orig_w,
        orig_h,
        processed_width,
        processed_height,
        orig_duration_ms,
        eff_dur_ms,
        options,
    );

    Ok(MediaPreviewResponse {
        original_data_url: to_data_url("image/png", &orig_png),
        processed_data_url: to_data_url("image/png", &proc_png),
        original_width: orig_w,
        original_height: orig_h,
        processed_width,
        processed_height,
        original_size,
        processed_size: estimated_output_size.unwrap_or(proc_png.len() as u64),
        estimated_output_size,
        duration_ms: orig_duration_ms,
        preview_time_sec: seek_sec,
        processed_format: target_extension_for_video(options).to_string(),
    })
}

pub async fn compare_video_files(
    ffmpeg_path: &Path,
    input_path: &Path,
    output_path: &Path,
    orig_probe: Option<&MediaProbeInfo>,
    out_probe: Option<&MediaProbeInfo>,
    preview_time_sec: Option<f64>,
) -> Result<MediaPreviewResponse, AppError> {
    if !input_path.is_file() {
        return Err(AppError::IoError(format!(
            "Input video not found: {}",
            input_path.display()
        )));
    }
    if !output_path.is_file() {
        return Err(AppError::IoError(format!(
            "Output video not found: {}",
            output_path.display()
        )));
    }

    let original_size = std::fs::metadata(input_path)?.len();
    let processed_size = std::fs::metadata(output_path)?.len();

    let orig_duration_ms = orig_probe.and_then(|p| p.duration_ms);
    let orig_dur_sec = orig_duration_ms.map(|d| (d as f64) / 1000.0).unwrap_or(0.0);
    let out_dur_sec = out_probe
        .and_then(|p| p.duration_ms)
        .map(|d| (d as f64) / 1000.0)
        .unwrap_or(orig_dur_sec);

    let default_seek = if orig_dur_sec > 0.5 {
        (orig_dur_sec * 0.25).min(2.0)
    } else {
        0.0
    };
    let seek_sec = preview_time_sec
        .unwrap_or(default_seek)
        .max(0.0)
        .min(if orig_dur_sec > 0.1 {
            (orig_dur_sec - 0.05).max(0.0)
        } else {
            f64::MAX
        });
    let out_seek_sec = if out_dur_sec > 0.1 {
        seek_sec.min((out_dur_sec - 0.05).max(0.0))
    } else {
        seek_sec
    };

    let orig_probed_w = orig_probe.and_then(|p| p.width);
    let orig_probed_h = orig_probe.and_then(|p| p.height);
    let orig_vf = if orig_probed_w.unwrap_or(0) > 1280 {
        Some("scale=1280:-2")
    } else {
        None
    };
    let orig_png = extract_ffmpeg_frame_png(ffmpeg_path, input_path, seek_sec, orig_vf).await?;
    let (orig_w, orig_h) = match (orig_probed_w, orig_probed_h) {
        (Some(w), Some(h)) if w > 0 && h > 0 => (w, h),
        _ => png_dimensions(&orig_png).unwrap_or((1920, 1080)),
    };

    let out_probed_w = out_probe.and_then(|p| p.width);
    let out_probed_h = out_probe.and_then(|p| p.height);
    let out_vf = if out_probed_w.unwrap_or(0) > 1280 {
        Some("scale=1280:-2")
    } else {
        None
    };
    let out_png = extract_ffmpeg_frame_png(ffmpeg_path, output_path, out_seek_sec, out_vf).await?;
    let (out_w, out_h) = match (out_probed_w, out_probed_h) {
        (Some(w), Some(h)) if w > 0 && h > 0 => (w, h),
        _ => png_dimensions(&out_png).unwrap_or((orig_w, orig_h)),
    };

    let out_ext = output_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4")
        .to_ascii_lowercase();

    Ok(MediaPreviewResponse {
        original_data_url: to_data_url("image/png", &orig_png),
        processed_data_url: to_data_url("image/png", &out_png),
        original_width: orig_w,
        original_height: orig_h,
        processed_width: out_w,
        processed_height: out_h,
        original_size,
        processed_size,
        estimated_output_size: Some(processed_size),
        duration_ms: orig_duration_ms,
        preview_time_sec: seek_sec,
        processed_format: out_ext,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_h264_crf_and_hw_fallback_args() {
        let mut caps = Capabilities::default();
        caps.has_nvenc = true;
        caps.hw_encoders.push("h264_nvenc".to_string());

        let opts = VideoOptions {
            resolution: "1080p".to_string(),
            rotate: 90,
            strip_metadata: true,
            ..VideoOptions::default()
        };

        let args = build_ffmpeg_args(
            Path::new("input.mp4"),
            Path::new("out.mp4.part"),
            &opts,
            &caps,
            false,
            None,
            None,
        )
        .unwrap();

        assert!(args.contains(&"h264_nvenc".to_string()));
        assert!(args.contains(&"scale=-2:1080,transpose=1".to_string()));
        assert!(args.contains(&"-map_metadata".to_string()));
        assert!(args.contains(&"-f".to_string()));
        assert!(args.contains(&"mp4".to_string()));

        let sw_args = build_ffmpeg_args(
            Path::new("input.mp4"),
            Path::new("out.mp4.part"),
            &opts,
            &caps,
            true,
            None,
            None,
        )
        .unwrap();
        assert!(sw_args.contains(&"libx264".to_string()));
    }

    #[test]
    fn builds_two_pass_gif_and_extract_srt_args() {
        let caps = Capabilities::default();

        // Two-pass pass 1
        let two_pass = VideoOptions {
            rate_control: "two-pass".to_string(),
            target_bitrate_kbps: Some(1800),
            ..VideoOptions::default()
        };
        let p1 = build_ffmpeg_args(
            Path::new("in.mp4"),
            Path::new("out.mp4.part"),
            &two_pass,
            &caps,
            true,
            Some(1),
            Some(Path::new("/tmp/2pass")),
        )
        .unwrap();
        assert!(p1.contains(&"-pass".to_string()));
        assert!(p1.contains(&"1".to_string()));
        assert!(p1.contains(&"null".to_string()));

        // GIF palettegen
        let gif_opts = VideoOptions {
            output_format: "gif".to_string(),
            resolution: "720p".to_string(),
            ..VideoOptions::default()
        };
        let gif_args = build_ffmpeg_args(
            Path::new("in.mp4"),
            Path::new("out.gif.part"),
            &gif_opts,
            &caps,
            false,
            None,
            None,
        )
        .unwrap();
        assert!(gif_args.iter().any(|a| a.contains("palettegen")));

        // Extract SRT
        let srt_opts = VideoOptions {
            subtitle_mode: "extract-srt".to_string(),
            subtitle_track_index: Some(1),
            ..VideoOptions::default()
        };
        let srt_args = build_ffmpeg_args(
            Path::new("in.mkv"),
            Path::new("out.srt.part"),
            &srt_opts,
            &caps,
            false,
            None,
            None,
        )
        .unwrap();
        assert!(srt_args.contains(&"0:s:1".to_string()));
        assert!(srt_args.contains(&"srt".to_string()));
    }

    #[test]
    fn builds_crop_and_trim_ffmpeg_args_and_dimensions() {
        let caps = Capabilities::default();
        let opts = VideoOptions {
            crop_x: Some(100),
            crop_y: Some(50),
            crop_width: Some(640),
            crop_height: Some(360),
            trim_start_sec: Some(5.5),
            trim_end_sec: Some(15.5),
            resolution: "480p".to_string(),
            ..VideoOptions::default()
        };

        let args = build_ffmpeg_args(
            Path::new("input.mp4"),
            Path::new("out.mp4.part"),
            &opts,
            &caps,
            true,
            None,
            None,
        )
        .unwrap();

        let ss_idx = args.iter().position(|a| a == "-ss").unwrap();
        let in_idx = args.iter().position(|a| a == "-i").unwrap();
        let t_idx = args.iter().position(|a| a == "-t").unwrap();
        assert!(ss_idx < in_idx);
        assert!(t_idx > in_idx);
        assert_eq!(args[ss_idx + 1], "5.500");
        assert_eq!(args[t_idx + 1], "10.000");

        let vf_idx = args.iter().position(|a| a == "-vf").unwrap();
        assert!(args[vf_idx + 1].starts_with("crop=640:360:100:50,scale=-2:480"));

        assert_eq!(effective_trimmed_duration_ms(Some(30_000), &opts), Some(10_000));
        let (pw, ph) = compute_video_output_dimensions(1920, 1080, &opts);
        assert_eq!((pw, ph), (854, 480));
    }
}
