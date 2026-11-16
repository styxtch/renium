use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::ffmpeg::downloader::resolve_binaries;
use crate::ffmpeg::probe::probe_video;
use crate::models::{Job, JobOptions, MediaPreviewResponse, MediaType};
use crate::processors::image::{compare_image_files, generate_image_preview};
use crate::processors::video::{compare_video_files, generate_video_preview};
use crate::queue::manager::AppState;

#[tauri::command]
pub async fn get_jobs(state: State<'_, AppState>, media_type: MediaType) -> Result<Vec<Job>, AppError> {
    Ok(state.queue.get_jobs(media_type).await)
}

#[tauri::command]
pub async fn add_jobs(
    state: State<'_, AppState>,
    paths: Vec<String>,
    media_type: MediaType,
    options: JobOptions,
) -> Result<Vec<Job>, AppError> {
    state.queue.add_jobs(paths, media_type, options).await
}

#[tauri::command]
pub async fn update_queued_jobs_options(
    state: State<'_, AppState>,
    media_type: MediaType,
    options: JobOptions,
) -> Result<(), AppError> {
    state.queue.update_queued_jobs_options(media_type, options).await
}

#[tauri::command]
pub async fn start_queue(
    app: AppHandle,
    state: State<'_, AppState>,
    media_type: MediaType,
    job_ids: Option<Vec<String>>,
) -> Result<(), AppError> {
    state.queue.start_queue(app, media_type, job_ids).await
}

#[tauri::command]
pub async fn pause_job(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    state.queue.pause_job(&app, &id).await
}

#[tauri::command]
pub async fn resume_job(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    state.queue.resume_job(app, &id).await
}

#[tauri::command]
pub async fn cancel_job(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    state.queue.cancel_job(&app, &id).await
}

#[tauri::command]
pub async fn pause_all_jobs(
    app: AppHandle,
    state: State<'_, AppState>,
    media_type: MediaType,
) -> Result<(), AppError> {
    state.queue.pause_all_jobs(&app, media_type).await
}

#[tauri::command]
pub async fn resume_all_jobs(
    app: AppHandle,
    state: State<'_, AppState>,
    media_type: MediaType,
) -> Result<(), AppError> {
    state.queue.resume_all_jobs(app, media_type).await
}

#[tauri::command]
pub async fn cancel_all_jobs(
    app: AppHandle,
    state: State<'_, AppState>,
    media_type: MediaType,
) -> Result<(), AppError> {
    state.queue.cancel_all_jobs(&app, media_type).await
}

#[tauri::command]
pub async fn remove_job(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    state.queue.remove_job(&id).await
}

#[tauri::command]
pub async fn clear_completed_jobs(
    state: State<'_, AppState>,
    media_type: MediaType,
) -> Result<(), AppError> {
    state.queue.clear_completed_jobs(media_type).await
}

#[tauri::command]
pub async fn reorder_jobs(
    state: State<'_, AppState>,
    media_type: MediaType,
    job_ids: Vec<String>,
) -> Result<Vec<Job>, AppError> {
    state.queue.reorder_jobs(media_type, job_ids).await
}

#[tauri::command]
pub async fn retry_job(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    state.queue.retry_job(&app, &id).await
}

#[tauri::command]
pub async fn keep_original(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    state.queue.keep_original(&id).await
}

#[tauri::command]
pub fn open_output_folder(path: String) -> Result<(), AppError> {
    let target = PathBuf::from(&path);
    let folder = if target.is_file() {
        target.parent().unwrap_or(&target).to_path_buf()
    } else {
        target
    };

    if !folder.exists() {
        return Err(AppError::IoError(format!(
            "Folder does not exist: {}",
            folder.display()
        )));
    }

    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(&folder)
            .spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&folder).spawn()?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&folder)
            .spawn()?;
    }

    Ok(())
}

#[tauri::command]
pub async fn generate_preview(
    state: State<'_, AppState>,
    input_path: String,
    media_type: MediaType,
    options: JobOptions,
    preview_time_sec: Option<f64>,
    output_path: Option<String>,
) -> Result<MediaPreviewResponse, AppError> {
    let path = PathBuf::from(&input_path);
    let out_path = output_path.filter(|s| !s.trim().is_empty()).map(PathBuf::from);
    match (media_type, options) {
        (MediaType::Image, JobOptions::Image(img_opts)) => {
            let p = path.clone();
            tokio::task::spawn_blocking(move || match out_path {
                Some(out) => compare_image_files(&p, &out),
                None => generate_image_preview(&p, &img_opts),
            })
            .await
            .map_err(|e| AppError::EncodeFailed(format!("Preview worker join failed: {e}")))?
        }
        (MediaType::Video, JobOptions::Video(vid_opts)) => {
            let settings = state
                .settings
                .read()
                .map_err(|_| AppError::IoError("Failed to read settings lock".into()))?
                .clone();
            let (ffmpeg_path, ffprobe_path, _) = resolve_binaries(&state.storage, &settings)
                .ok_or_else(|| AppError::FfmpegMissing("FFmpeg binaries are missing".into()))?;
            let probe = probe_video(&ffprobe_path, &path).ok();
            match out_path {
                Some(out) => {
                    let out_probe = probe_video(&ffprobe_path, &out).ok();
                    compare_video_files(
                        &ffmpeg_path,
                        &path,
                        &out,
                        probe.as_ref(),
                        out_probe.as_ref(),
                        preview_time_sec,
                    )
                    .await
                }
                None => {
                    generate_video_preview(
                        &ffmpeg_path,
                        &path,
                        probe.as_ref(),
                        &vid_opts,
                        preview_time_sec,
                    )
                    .await
                }
            }
        }
        _ => Err(AppError::InvalidState(
            "Mismatched mediaType and JobOptions for preview".to_string(),
        )),
    }
}
