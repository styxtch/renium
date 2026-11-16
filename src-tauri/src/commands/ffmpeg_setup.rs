use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::ffmpeg::downloader::{
    check_ffmpeg as do_check_ffmpeg, detect_capabilities, download_ffmpeg as do_download_ffmpeg,
    locate_local_ffmpeg, resolve_binaries,
};
use crate::models::FfmpegStatus;
use crate::queue::manager::AppState;

#[tauri::command]
pub fn check_ffmpeg(state: State<'_, AppState>) -> Result<FfmpegStatus, AppError> {
    let settings = state
        .settings
        .read()
        .map_err(|_| AppError::InvalidState("Settings lock poisoned".into()))?;
    Ok(do_check_ffmpeg(&state.storage, &settings))
}

#[tauri::command]
pub async fn download_ffmpeg(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<FfmpegStatus, AppError> {
    let settings = state
        .settings
        .read()
        .map(|s| s.clone())
        .map_err(|_| AppError::InvalidState("Settings lock poisoned".into()))?;

    let status = do_download_ffmpeg(&app, &state.storage, &settings).await?;

    // Refresh hardware capabilities after downloading FFmpeg
    let ff = resolve_binaries(&state.storage, &settings).map(|(f, _, _)| f);
    let caps = detect_capabilities(ff.as_deref());
    if let Ok(mut guard) = state.capabilities.write() {
        *guard = caps;
    }

    Ok(status)
}

#[tauri::command]
pub fn locate_ffmpeg(
    state: State<'_, AppState>,
    ffmpeg_path: String,
    ffprobe_path: String,
) -> Result<FfmpegStatus, AppError> {
    let mut settings = state
        .settings
        .write()
        .map_err(|_| AppError::InvalidState("Settings lock poisoned".into()))?;
    let status = locate_local_ffmpeg(&state.storage, &mut settings, &ffmpeg_path, &ffprobe_path)?;

    let ff = resolve_binaries(&state.storage, &settings).map(|(f, _, _)| f);
    let caps = detect_capabilities(ff.as_deref());
    if let Ok(mut guard) = state.capabilities.write() {
        *guard = caps;
    }

    Ok(status)
}
