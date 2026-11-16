use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use crate::error::AppError;
use crate::models::{AppSettings, Capabilities, FfmpegStatus};
use crate::storage::{save_settings, StoragePaths};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegDownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub stage: String,
    pub sha256: Option<String>,
}

pub fn apply_no_window_std(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

pub fn apply_no_window_tokio(cmd: &mut tokio::process::Command) {
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

pub fn binary_names() -> (&'static str, &'static str) {
    #[cfg(windows)]
    {
        ("ffmpeg.exe", "ffprobe.exe")
    }
    #[cfg(not(windows))]
    {
        ("ffmpeg", "ffprobe")
    }
}

fn verify_executable_version(path: &Path) -> Option<String> {
    let mut cmd = Command::new(path);
    cmd.arg("-version");
    apply_no_window_std(&mut cmd);
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.lines().next().map(|l| l.trim().to_string())
}

fn find_on_system_path(bin_name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(bin_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

pub fn resolve_binaries(
    storage: &StoragePaths,
    settings: &AppSettings,
) -> Option<(PathBuf, PathBuf, String)> {
    let (ffmpeg_name, ffprobe_name) = binary_names();

    // 1. Custom located binaries
    if let (Some(ff), Some(fp)) = (&settings.custom_ffmpeg_path, &settings.custom_ffprobe_path) {
        let f_path = PathBuf::from(ff);
        let p_path = PathBuf::from(fp);
        if f_path.is_file() && p_path.is_file() {
            return Some((f_path, p_path, "custom".to_string()));
        }
    }

    // 2. AppData downloaded binaries
    let app_ffmpeg = storage.bin_dir.join(ffmpeg_name);
    let app_ffprobe = storage.bin_dir.join(ffprobe_name);
    if app_ffmpeg.is_file() && app_ffprobe.is_file() {
        return Some((app_ffmpeg, app_ffprobe, "appdata".to_string()));
    }

    // 3. System PATH binaries
    if let (Some(sys_f), Some(sys_p)) = (
        find_on_system_path(ffmpeg_name),
        find_on_system_path(ffprobe_name),
    ) {
        return Some((sys_f, sys_p, "system".to_string()));
    }

    None
}

pub fn check_ffmpeg(storage: &StoragePaths, settings: &AppSettings) -> FfmpegStatus {
    if let Some((ffmpeg_path, ffprobe_path, source)) = resolve_binaries(storage, settings) {
        if let Some(version) = verify_executable_version(&ffmpeg_path) {
            if verify_executable_version(&ffprobe_path).is_some() {
                return FfmpegStatus {
                    installed: true,
                    version: Some(version),
                    ffmpeg_path: Some(ffmpeg_path.to_string_lossy().to_string()),
                    ffprobe_path: Some(ffprobe_path.to_string_lossy().to_string()),
                    source: Some(source),
                };
            }
        }
    }

    FfmpegStatus {
        installed: false,
        version: None,
        ffmpeg_path: None,
        ffprobe_path: None,
        source: None,
    }
}

pub fn locate_local_ffmpeg(
    storage: &StoragePaths,
    settings: &mut AppSettings,
    ffmpeg_path: &str,
    ffprobe_path: &str,
) -> Result<FfmpegStatus, AppError> {
    let f_path = PathBuf::from(ffmpeg_path.trim());
    let p_path = PathBuf::from(ffprobe_path.trim());

    if !f_path.is_file() {
        return Err(AppError::FfmpegMissing(format!(
            "FFmpeg binary not found at: {}",
            f_path.display()
        )));
    }
    if !p_path.is_file() {
        return Err(AppError::FfmpegMissing(format!(
            "FFprobe binary not found at: {}",
            p_path.display()
        )));
    }

    let version = verify_executable_version(&f_path).ok_or_else(|| {
        AppError::FfmpegMissing("Selected ffmpeg binary failed '-version' validation".to_string())
    })?;
    if verify_executable_version(&p_path).is_none() {
        return Err(AppError::FfmpegMissing(
            "Selected ffprobe binary failed '-version' validation".to_string(),
        ));
    }

    settings.custom_ffmpeg_path = Some(f_path.to_string_lossy().to_string());
    settings.custom_ffprobe_path = Some(p_path.to_string_lossy().to_string());
    save_settings(storage, settings)?;

    Ok(FfmpegStatus {
        installed: true,
        version: Some(version),
        ffmpeg_path: settings.custom_ffmpeg_path.clone(),
        ffprobe_path: settings.custom_ffprobe_path.clone(),
        source: Some("custom".to_string()),
    })
}

pub fn verify_sha256_bytes(data: &[u8], expected_hex: &str) -> Result<String, AppError> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let actual = hex::encode(hasher.finalize());
    if !expected_hex.is_empty() && actual != expected_hex.to_ascii_lowercase() {
        return Err(AppError::ChecksumMismatch(format!(
            "Expected SHA-256 {expected_hex}, got {actual}"
        )));
    }
    Ok(actual)
}

fn platform_download_spec() -> Result<(Vec<&'static str>, Option<&'static str>), AppError> {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        Ok((
            vec![
                "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
                "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
            ],
            None,
        ))
    }
    #[cfg(all(target_os = "macos"))]
    {
        Ok((
            vec!["https://evermeet.cx/ffmpeg/getrelease/zip"],
            None,
        ))
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        Ok((
            vec![
                "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz",
            ],
            None,
        ))
    }
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        target_os = "macos",
        all(target_os = "linux", target_arch = "x86_64")
    )))]
    {
        Err(AppError::UnsupportedFormat(
            "Automatic FFmpeg download is not available for this CPU architecture. Please use 'Locate Local FFmpeg Binary'.".to_string(),
        ))
    }
}

async fn download_archive_to_file(
    app: &AppHandle,
    client: &reqwest::Client,
    url: &str,
    dest_path: &Path,
) -> Result<String, AppError> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::IoError(format!("Failed to connect to {url}: {e}")))?;

    if !response.status().is_success() {
        return Err(AppError::IoError(format!(
            "Download server returned HTTP {}",
            response.status()
        )));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let mut downloaded_bytes = 0u64;
    let mut file = fs::File::create(dest_path)?;
    let mut hasher = Sha256::new();
    let mut stream = response.bytes_stream();
    let mut last_emitted = 0u64;

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| AppError::IoError(format!("Stream error: {e}")))?;
        file.write_all(&chunk)?;
        hasher.update(&chunk);
        downloaded_bytes += chunk.len() as u64;

        if downloaded_bytes - last_emitted >= 256 * 1024 || downloaded_bytes == total_bytes {
            last_emitted = downloaded_bytes;
            let _ = app.emit(
                "ffmpeg-download-progress",
                FfmpegDownloadProgress {
                    downloaded_bytes,
                    total_bytes,
                    stage: "downloading".to_string(),
                    sha256: None,
                },
            );
        }
    }

    let digest = hex::encode(hasher.finalize());
    let _ = app.emit(
        "ffmpeg-download-progress",
        FfmpegDownloadProgress {
            downloaded_bytes,
            total_bytes,
            stage: "verifying".to_string(),
            sha256: Some(digest.clone()),
        },
    );

    Ok(digest)
}

fn extract_zip_binaries(archive_path: &Path, bin_dir: &Path) -> Result<(), AppError> {
    let (ffmpeg_name, ffprobe_name) = binary_names();
    let file = fs::File::open(archive_path)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::EncodeFailed(format!("Invalid zip archive: {e}")))?;

    let mut found_ffmpeg = false;
    let mut found_ffprobe = false;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| AppError::IoError(e.to_string()))?;
        if entry.is_dir() {
            continue;
        }
        let entry_name = Path::new(entry.name())
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        let target = if entry_name.eq_ignore_ascii_case(ffmpeg_name) {
            found_ffmpeg = true;
            Some(bin_dir.join(ffmpeg_name))
        } else if entry_name.eq_ignore_ascii_case(ffprobe_name) {
            found_ffprobe = true;
            Some(bin_dir.join(ffprobe_name))
        } else {
            None
        };

        if let Some(dest) = target {
            let mut out = fs::File::create(&dest)?;
            std::io::copy(&mut entry, &mut out)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = fs::metadata(&dest)?.permissions();
                perms.set_mode(0o755);
                fs::set_permissions(&dest, perms)?;
            }
        }
    }

    if !found_ffmpeg && !found_ffprobe {
        return Err(AppError::FfmpegMissing(
            "Downloaded archive did not contain ffmpeg/ffprobe binaries".to_string(),
        ));
    }

    Ok(())
}

pub async fn download_ffmpeg(
    app: &AppHandle,
    storage: &StoragePaths,
    settings: &AppSettings,
) -> Result<FfmpegStatus, AppError> {
    storage.ensure_dirs()?;
    let (urls, expected_sha) = platform_download_spec()?;

    let client = reqwest::Client::builder()
        .user_agent("Renium/1.0")
        .build()
        .map_err(|e| AppError::IoError(e.to_string()))?;

    let tmp_archive = storage.bin_dir.join("ffmpeg-download.tmp");
    let mut last_err = None;
    let mut actual_sha = String::new();

    for url in urls {
        match download_archive_to_file(app, &client, url, &tmp_archive).await {
            Ok(sha) => {
                actual_sha = sha;
                last_err = None;
                break;
            }
            Err(err) => {
                last_err = Some(err);
            }
        }
    }

    if let Some(err) = last_err {
        let _ = fs::remove_file(&tmp_archive);
        return Err(err);
    }

    if let Some(expected) = expected_sha {
        if actual_sha != expected.to_ascii_lowercase() {
            let _ = fs::remove_file(&tmp_archive);
            return Err(AppError::ChecksumMismatch(format!(
                "FFmpeg archive checksum mismatch: expected {expected}, got {actual_sha}"
            )));
        }
    }

    let _ = app.emit(
        "ffmpeg-download-progress",
        FfmpegDownloadProgress {
            downloaded_bytes: 0,
            total_bytes: 0,
            stage: "extracting".to_string(),
            sha256: Some(actual_sha.clone()),
        },
    );

    #[cfg(target_os = "linux")]
    {
        let status = Command::new("tar")
            .args([
                "-xf",
                &tmp_archive.to_string_lossy(),
                "-C",
                &storage.bin_dir.to_string_lossy(),
                "--strip-components=2",
                "--wildcards",
                "*/bin/ffmpeg",
                "*/bin/ffprobe",
            ])
            .status()
            .map_err(|e| AppError::IoError(format!("tar extraction failed: {e}")))?;
        if !status.success() {
            let _ = fs::remove_file(&tmp_archive);
            return Err(AppError::IoError("Failed to extract FFmpeg archive with tar".to_string()));
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        extract_zip_binaries(&tmp_archive, &storage.bin_dir)?;
    }

    // On macOS, evermeet distributes ffmpeg and ffprobe as separate zips
    #[cfg(target_os = "macos")]
    {
        let (_, ffprobe_name) = binary_names();
        if !storage.bin_dir.join(ffprobe_name).exists() {
            let probe_tmp = storage.bin_dir.join("ffprobe-download.tmp");
            let _ = download_archive_to_file(
                app,
                &client,
                "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip",
                &probe_tmp,
            )
            .await?;
            extract_zip_binaries(&probe_tmp, &storage.bin_dir)?;
            let _ = fs::remove_file(&probe_tmp);
        }
    }

    let _ = fs::remove_file(&tmp_archive);

    let status = check_ffmpeg(storage, settings);
    if !status.installed {
        return Err(AppError::FfmpegMissing(
            "Extraction completed, but ffmpeg/ffprobe verification failed".to_string(),
        ));
    }

    let _ = app.emit(
        "ffmpeg-download-progress",
        FfmpegDownloadProgress {
            downloaded_bytes: 0,
            total_bytes: 0,
            stage: "done".to_string(),
            sha256: Some(actual_sha),
        },
    );

    Ok(status)
}

pub fn detect_capabilities(ffmpeg_path: Option<&Path>) -> Capabilities {
    let cpu_cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let platform = std::env::consts::OS.to_string();

    let mut caps = Capabilities {
        platform,
        cpu_cores,
        ..Default::default()
    };

    let Some(ffmpeg) = ffmpeg_path else {
        return caps;
    };

    let mut cmd = Command::new(ffmpeg);
    cmd.arg("-encoders");
    apply_no_window_std(&mut cmd);

    let Ok(output) = cmd.output() else {
        return caps;
    };

    let text = String::from_utf8_lossy(&output.stdout);
    let candidates = [
        "h264_nvenc",
        "hevc_nvenc",
        "av1_nvenc",
        "h264_qsv",
        "hevc_qsv",
        "av1_qsv",
        "h264_amf",
        "hevc_amf",
        "h264_videotoolbox",
        "hevc_videotoolbox",
        "h264_vaapi",
        "hevc_vaapi",
    ];

    for enc in candidates {
        if text.contains(enc) {
            caps.hw_encoders.push(enc.to_string());
        }
    }

    caps.has_nvenc = caps.hw_encoders.iter().any(|e| e.contains("nvenc"));
    caps.has_qsv = caps.hw_encoders.iter().any(|e| e.contains("qsv"));
    caps.has_amf = caps.hw_encoders.iter().any(|e| e.contains("amf"));
    caps.has_videotoolbox = caps.hw_encoders.iter().any(|e| e.contains("videotoolbox"));
    caps.has_vaapi = caps.hw_encoders.iter().any(|e| e.contains("vaapi"));

    caps
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_sha256_checksum_match_and_mismatch() {
        let payload = b"renium-ffmpeg-test";
        let mut hasher = Sha256::new();
        hasher.update(payload);
        let expected = hex::encode(hasher.finalize());

        assert!(verify_sha256_bytes(payload, &expected).is_ok());
        assert!(matches!(
            verify_sha256_bytes(payload, "0000000000000000"),
            Err(AppError::ChecksumMismatch(_))
        ));
    }
}
