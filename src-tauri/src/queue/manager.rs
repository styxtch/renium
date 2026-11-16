use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, Semaphore};
use uuid::Uuid;

use crate::error::AppError;
use crate::ffmpeg::downloader::{detect_capabilities, resolve_binaries};
use crate::ffmpeg::probe::{probe_image, probe_video};
use crate::models::{
    AppSettings, Capabilities, HistoryItem, Job, JobOptions, JobStatus,
    MediaProbeInfo, MediaType, Preset,
};
use crate::processors::audio::process_audio_job;
use crate::processors::image::process_image_job;
use crate::processors::video::process_video_job;
use crate::queue::process_control::{kill_process, resume_process, suspend_process, ActiveProcessRegistry};
use crate::storage::{
    built_in_presets, load_custom_presets, load_history, load_recovery_jobs, load_settings,
    save_history, save_recovery_jobs, StoragePaths,
};
use crate::utils::fs::{cleanup_part_file, part_path_for};
use crate::utils::walker::expand_media_paths;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobProgressEvent {
    pub id: String,
    #[serde(rename = "type")]
    pub media_type: MediaType,
    pub progress: f64,
    pub eta_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStatusChangedEvent {
    pub id: String,
    #[serde(rename = "type")]
    pub media_type: MediaType,
    pub status: JobStatus,
    pub output_path: Option<String>,
    pub output_size: Option<u64>,
    pub size_larger_warning: Option<bool>,
    pub error: Option<String>,
    pub finished_at: Option<u64>,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub struct AppState {
    pub storage: StoragePaths,
    pub settings: Arc<RwLock<AppSettings>>,
    pub presets: Arc<RwLock<Vec<Preset>>>,
    pub history: Arc<RwLock<Vec<HistoryItem>>>,
    pub capabilities: Arc<RwLock<Capabilities>>,
    pub process_registry: Arc<ActiveProcessRegistry>,
    pub queue: Arc<QueueManager>,
}

impl AppState {
    pub fn initialize(root_dir: PathBuf) -> Self {
        let storage = StoragePaths::from_root(root_dir);
        let _ = storage.ensure_dirs();
        let settings = load_settings(&storage);

        let mut presets = built_in_presets();
        presets.extend(load_custom_presets(&storage));

        let history = load_history(&storage);
        let ffmpeg_path = resolve_binaries(&storage, &settings).map(|(f, _, _)| f);
        let capabilities = detect_capabilities(ffmpeg_path.as_deref());

        let mut recovered = load_recovery_jobs(&storage);
        let mut video_jobs = Vec::new();
        let mut image_jobs = Vec::new();
        let mut audio_jobs = Vec::new();
        for mut job in recovered.drain(..) {
            if let Some(ref out) = job.output_path {
                cleanup_part_file(&part_path_for(&PathBuf::from(out)));
            }
            if matches!(job.status, JobStatus::Processing | JobStatus::Paused) {
                job.status = JobStatus::Queued;
                job.progress = 0.0;
                job.eta_seconds = None;
            }
            if matches!(job.status, JobStatus::Queued) {
                match job.media_type {
                    MediaType::Video => video_jobs.push(job),
                    MediaType::Image => image_jobs.push(job),
                    MediaType::Audio => audio_jobs.push(job),
                }
            }
        }

        let settings_arc = Arc::new(RwLock::new(settings));
        let history_arc = Arc::new(RwLock::new(history));
        let capabilities_arc = Arc::new(RwLock::new(capabilities));
        let registry_arc = Arc::new(ActiveProcessRegistry::default());

        let queue = Arc::new(QueueManager::new(
            storage.clone(),
            settings_arc.clone(),
            history_arc.clone(),
            capabilities_arc.clone(),
            registry_arc.clone(),
            video_jobs,
            image_jobs,
            audio_jobs,
        ));

        Self {
            storage,
            settings: settings_arc,
            presets: Arc::new(RwLock::new(presets)),
            history: history_arc,
            capabilities: capabilities_arc,
            process_registry: registry_arc,
            queue,
        }
    }
}

pub struct QueueManager {
    storage: StoragePaths,
    settings: Arc<RwLock<AppSettings>>,
    history: Arc<RwLock<Vec<HistoryItem>>>,
    capabilities: Arc<RwLock<Capabilities>>,
    process_registry: Arc<ActiveProcessRegistry>,
    video_jobs: Mutex<Vec<Job>>,
    image_jobs: Mutex<Vec<Job>>,
    audio_jobs: Mutex<Vec<Job>>,
    video_running: AtomicBool,
    image_running: AtomicBool,
    audio_running: AtomicBool,
    video_paused: AtomicBool,
    image_paused: AtomicBool,
    audio_paused: AtomicBool,
    large_image_sem: Arc<Semaphore>,
    cancelled_ids: Mutex<HashSet<String>>,
    video_target_ids: Mutex<Option<HashSet<String>>>,
    image_target_ids: Mutex<Option<HashSet<String>>>,
    audio_target_ids: Mutex<Option<HashSet<String>>>,
}

impl QueueManager {
    pub fn new(
        storage: StoragePaths,
        settings: Arc<RwLock<AppSettings>>,
        history: Arc<RwLock<Vec<HistoryItem>>>,
        capabilities: Arc<RwLock<Capabilities>>,
        process_registry: Arc<ActiveProcessRegistry>,
        initial_video: Vec<Job>,
        initial_image: Vec<Job>,
        initial_audio: Vec<Job>,
    ) -> Self {
        Self {
            storage,
            settings,
            history,
            capabilities,
            process_registry,
            video_jobs: Mutex::new(initial_video),
            image_jobs: Mutex::new(initial_image),
            audio_jobs: Mutex::new(initial_audio),
            video_running: AtomicBool::new(false),
            image_running: AtomicBool::new(false),
            audio_running: AtomicBool::new(false),
            video_paused: AtomicBool::new(false),
            image_paused: AtomicBool::new(false),
            audio_paused: AtomicBool::new(false),
            large_image_sem: Arc::new(Semaphore::new(1)),
            cancelled_ids: Mutex::new(HashSet::new()),
            video_target_ids: Mutex::new(None),
            image_target_ids: Mutex::new(None),
            audio_target_ids: Mutex::new(None),
        }
    }

    fn queue_mutex(&self, media_type: MediaType) -> &Mutex<Vec<Job>> {
        match media_type {
            MediaType::Video => &self.video_jobs,
            MediaType::Image => &self.image_jobs,
            MediaType::Audio => &self.audio_jobs,
        }
    }

    fn target_ids_mutex(&self, media_type: MediaType) -> &Mutex<Option<HashSet<String>>> {
        match media_type {
            MediaType::Video => &self.video_target_ids,
            MediaType::Image => &self.image_target_ids,
            MediaType::Audio => &self.audio_target_ids,
        }
    }

    async fn persist_recovery(&self) {
        let mut active = Vec::new();
        for mt in [MediaType::Video, MediaType::Image, MediaType::Audio] {
            let guard = self.queue_mutex(mt).lock().await;
            active.extend(
                guard
                    .iter()
                    .filter(|j| matches!(j.status, JobStatus::Queued | JobStatus::Processing | JobStatus::Paused))
                    .cloned(),
            );
        }
        let _ = save_recovery_jobs(&self.storage, &active);
    }

    pub async fn get_jobs(&self, media_type: MediaType) -> Vec<Job> {
        self.queue_mutex(media_type).lock().await.clone()
    }

    pub async fn add_jobs(
        &self,
        paths: Vec<String>,
        media_type: MediaType,
        options: JobOptions,
    ) -> Result<Vec<Job>, AppError> {
        let expanded = expand_media_paths(&paths, media_type);
        let settings_snapshot = self.settings.read().map(|s| s.clone()).unwrap_or_default();
        let ffprobe_path = resolve_binaries(&self.storage, &settings_snapshot).map(|(_, p, _)| p);

        let mut added = Vec::new();
        for path in expanded {
            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            let original_size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

            let probe_info: Option<MediaProbeInfo> = match media_type {
                MediaType::Video | MediaType::Audio => {
                    if let Some(ref fp) = ffprobe_path {
                        probe_video(fp, &path).ok()
                    } else {
                        None
                    }
                }
                MediaType::Image => Some(probe_image(&path)),
            };

            let job = Job {
                id: Uuid::new_v4().to_string(),
                media_type,
                input_path: path.to_string_lossy().to_string(),
                output_path: None,
                file_name,
                original_size,
                output_size: None,
                size_larger_warning: None,
                progress: 0.0,
                eta_seconds: None,
                status: JobStatus::Queued,
                error: None,
                probe_info,
                options: options.clone(),
                created_at: now_ms(),
                started_at: None,
                finished_at: None,
            };
            added.push(job);
        }

        if !added.is_empty() {
            let mut guard = self.queue_mutex(media_type).lock().await;
            guard.extend(added.clone());
        }
        self.persist_recovery().await;
        Ok(added)
    }

    pub async fn update_queued_jobs_options(
        &self,
        media_type: MediaType,
        options: JobOptions,
    ) -> Result<(), AppError> {
        let mut guard = self.queue_mutex(media_type).lock().await;
        for job in guard.iter_mut() {
            if job.status == JobStatus::Queued {
                job.options = options.clone();
            }
        }
        drop(guard);
        self.persist_recovery().await;
        Ok(())
    }

    pub async fn start_queue(
        self: &Arc<Self>,
        app: AppHandle,
        media_type: MediaType,
        job_ids: Option<Vec<String>>,
    ) -> Result<(), AppError> {
        if matches!(media_type, MediaType::Video | MediaType::Audio) {
            let settings_snapshot = self.settings.read().map(|s| s.clone()).unwrap_or_default();
            if resolve_binaries(&self.storage, &settings_snapshot).is_none() {
                return Err(AppError::FfmpegMissing(
                    "Please download or locate FFmpeg before processing video or audio.".to_string(),
                ));
            }
        }

        let flag = match media_type {
            MediaType::Video => &self.video_running,
            MediaType::Image => &self.image_running,
            MediaType::Audio => &self.audio_running,
        };
        let paused_flag = match media_type {
            MediaType::Video => &self.video_paused,
            MediaType::Image => &self.image_paused,
            MediaType::Audio => &self.audio_paused,
        };
        paused_flag.store(false, Ordering::SeqCst);

        {
            let mut target_guard = self.target_ids_mutex(media_type).lock().await;
            let already_running = flag.load(Ordering::SeqCst);
            match (already_running, job_ids) {
                (true, Some(ids)) => {
                    if let Some(existing) = target_guard.as_mut() {
                        existing.extend(ids);
                    }
                }
                (_, Some(ids)) => {
                    *target_guard = Some(ids.into_iter().collect());
                }
                (_, None) => {
                    *target_guard = None;
                }
            }
        }

        if flag
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Ok(());
        }

        let mgr = Arc::clone(self);
        tokio::spawn(async move {
            mgr.run_dispatcher(app, media_type).await;
        });

        Ok(())
    }

    async fn run_dispatcher(self: Arc<Self>, app: AppHandle, media_type: MediaType) {
        let active_workers = Arc::new(AtomicUsize::new(0));

        loop {
            let max_concurrent = self
                .settings
                .read()
                .map(|s| match media_type {
                    MediaType::Video | MediaType::Audio => s.max_concurrent_video_jobs.max(1),
                    MediaType::Image => s.max_concurrent_image_jobs.max(1),
                })
                .unwrap_or(1);

            let is_paused = match media_type {
                MediaType::Video => self.video_paused.load(Ordering::SeqCst),
                MediaType::Image => self.image_paused.load(Ordering::SeqCst),
                MediaType::Audio => self.audio_paused.load(Ordering::SeqCst),
            };

            let target_snapshot = self.target_ids_mutex(media_type).lock().await.clone();
            let target_allows = |id: &str| {
                target_snapshot
                    .as_ref()
                    .map_or(true, |set| set.contains(id))
            };

            let mut spawned_any = false;
            if !is_paused && active_workers.load(Ordering::SeqCst) < max_concurrent {
                let next_job = {
                    let mut guard = self.queue_mutex(media_type).lock().await;
                    if let Some(job) = guard
                        .iter_mut()
                        .find(|j| j.status == JobStatus::Queued && target_allows(&j.id))
                    {
                        job.status = JobStatus::Processing;
                        job.started_at = Some(now_ms());
                        job.error = None;
                        Some(job.clone())
                    } else {
                        None
                    }
                };

                if let Some(job) = next_job {
                    spawned_any = true;
                    active_workers.fetch_add(1, Ordering::SeqCst);
                    let _ = app.emit(
                        "job-status-changed",
                        JobStatusChangedEvent {
                            id: job.id.clone(),
                            media_type,
                            status: JobStatus::Processing,
                            output_path: None,
                            output_size: None,
                            size_larger_warning: None,
                            error: None,
                            finished_at: None,
                        },
                    );
                    self.persist_recovery().await;

                    let mgr = Arc::clone(&self);
                    let app_clone = app.clone();
                    let active_clone = Arc::clone(&active_workers);
                    tokio::spawn(async move {
                        mgr.execute_job(app_clone, job).await;
                        active_clone.fetch_sub(1, Ordering::SeqCst);
                    });
                }
            }

            let has_pending_or_active = {
                let guard = self.queue_mutex(media_type).lock().await;
                let has_queued_or_paused = guard.iter().any(|j| {
                    matches!(j.status, JobStatus::Paused | JobStatus::Processing)
                        || (j.status == JobStatus::Queued && target_allows(&j.id))
                });
                has_queued_or_paused || active_workers.load(Ordering::SeqCst) > 0
            };

            if !has_pending_or_active {
                break;
            }

            if !spawned_any {
                tokio::time::sleep(std::time::Duration::from_millis(120)).await;
            }
        }

        *self.target_ids_mutex(media_type).lock().await = None;
        let flag = match media_type {
            MediaType::Video => &self.video_running,
            MediaType::Image => &self.image_running,
            MediaType::Audio => &self.audio_running,
        };
        flag.store(false, Ordering::SeqCst);
    }

    async fn execute_job(&self, app: AppHandle, job: Job) {
        let job_id = job.id.clone();
        let media_type = job.media_type;
        let settings_snapshot = self.settings.read().map(|s| s.clone()).unwrap_or_default();

        let outcome: Result<(PathBuf, u64, u64, bool), AppError> = match job.options.clone() {
            JobOptions::Image(img_opts) => {
                let pixels = job
                    .probe_info
                    .as_ref()
                    .and_then(|p| match (p.width, p.height) {
                        (Some(w), Some(h)) => Some((w as u64) * (h as u64)),
                        _ => None,
                    })
                    .unwrap_or(0);

                let _large_permit = if pixels > 24_000_000 {
                    Some(self.large_image_sem.acquire().await.ok())
                } else {
                    None
                };

                let input = PathBuf::from(&job.input_path);
                let out_dir = settings_snapshot.default_output_dir.clone();
                let probe = job.probe_info.clone();
                let app_ev = app.clone();
                let jid = job_id.clone();

                let join_res = tokio::task::spawn_blocking(move || {
                    process_image_job(
                        &input,
                        &img_opts,
                        out_dir.as_deref(),
                        probe.as_ref(),
                        |pct| {
                            let _ = app_ev.emit(
                                "job-progress",
                                JobProgressEvent {
                                    id: jid.clone(),
                                    media_type: MediaType::Image,
                                    progress: pct,
                                    eta_seconds: None,
                                },
                            );
                        },
                    )
                })
                .await;

                match join_res {
                    Ok(Ok(r)) => Ok((
                        r.output_path,
                        r.output_size,
                        r.original_size,
                        r.size_larger_warning,
                    )),
                    Ok(Err(e)) => Err(e),
                    Err(e) => Err(AppError::EncodeFailed(format!("Worker panicked: {e}"))),
                }
            }
            JobOptions::Video(vid_opts) => {
                let ffmpeg_bin = resolve_binaries(&self.storage, &settings_snapshot)
                    .map(|(f, _, _)| f);
                let Some(ffmpeg_path) = ffmpeg_bin else {
                    self.finalize_failed(&app, &job, AppError::FfmpegMissing("FFmpeg not installed".into())).await;
                    return;
                };
                let caps = self.capabilities.read().map(|c| c.clone()).unwrap_or_default();
                let input = PathBuf::from(&job.input_path);
                let out_dir = settings_snapshot.default_output_dir.clone();
                let probe = job.probe_info.clone();
                let app_ev = app.clone();
                let jid = job_id.clone();

                let res = process_video_job(
                    &job_id,
                    &ffmpeg_path,
                    &input,
                    &vid_opts,
                    out_dir.as_deref(),
                    &caps,
                    probe.as_ref(),
                    &self.process_registry,
                    |pct, eta| {
                        let _ = app_ev.emit(
                            "job-progress",
                            JobProgressEvent {
                                id: jid.clone(),
                                media_type: MediaType::Video,
                                progress: pct,
                                eta_seconds: eta,
                            },
                        );
                    },
                )
                .await;

                res.map(|r| {
                    (
                        r.output_path,
                        r.output_size,
                        r.original_size,
                        r.size_larger_warning,
                    )
                })
            }
            JobOptions::Audio(aud_opts) => {
                let ffmpeg_bin = resolve_binaries(&self.storage, &settings_snapshot)
                    .map(|(f, _, _)| f);
                let Some(ffmpeg_path) = ffmpeg_bin else {
                    self.finalize_failed(&app, &job, AppError::FfmpegMissing("FFmpeg not installed".into())).await;
                    return;
                };
                let input = PathBuf::from(&job.input_path);
                let out_dir = settings_snapshot.default_output_dir.clone();
                let probe = job.probe_info.clone();
                let app_ev = app.clone();
                let jid = job_id.clone();

                let res = process_audio_job(
                    &job_id,
                    &ffmpeg_path,
                    &input,
                    &aud_opts,
                    out_dir.as_deref(),
                    probe.as_ref(),
                    &self.process_registry,
                    |pct, eta| {
                        let _ = app_ev.emit(
                            "job-progress",
                            JobProgressEvent {
                                id: jid.clone(),
                                media_type: MediaType::Audio,
                                progress: pct,
                                eta_seconds: eta,
                            },
                        );
                    },
                )
                .await;

                res.map(|r| {
                    (
                        r.output_path,
                        r.output_size,
                        r.original_size,
                        r.size_larger_warning,
                    )
                })
            }
        };

        let was_cancelled = self.cancelled_ids.lock().await.remove(&job_id);
        if was_cancelled {
            if let Ok((out_path, _, _, _)) = outcome {
                let _ = std::fs::remove_file(&out_path);
                cleanup_part_file(&part_path_for(&out_path));
            }
            return;
        }

        match outcome {
            Ok((output_path, output_size, original_size, size_larger_warning)) => {
                let finished = now_ms();
                let out_str = output_path.to_string_lossy().to_string();
                {
                    let mut guard = self.queue_mutex(media_type).lock().await;
                    if let Some(j) = guard.iter_mut().find(|x| x.id == job_id) {
                        j.status = JobStatus::Completed;
                        j.progress = 100.0;
                        j.eta_seconds = Some(0);
                        j.output_path = Some(out_str.clone());
                        j.output_size = Some(output_size);
                        j.size_larger_warning = Some(size_larger_warning);
                        j.finished_at = Some(finished);
                    }
                }

                let _ = app.emit(
                    "job-status-changed",
                    JobStatusChangedEvent {
                        id: job_id.clone(),
                        media_type,
                        status: JobStatus::Completed,
                        output_path: Some(out_str.clone()),
                        output_size: Some(output_size),
                        size_larger_warning: Some(size_larger_warning),
                        error: None,
                        finished_at: Some(finished),
                    },
                );

                self.record_history(HistoryItem {
                    id: job_id,
                    media_type,
                    file_name: job.file_name,
                    input_path: job.input_path,
                    output_path: out_str,
                    original_size,
                    output_size,
                    saved_bytes: (original_size as i64) - (output_size as i64),
                    status: "completed".to_string(),
                    error: None,
                    finished_at: finished,
                });
            }
            Err(err) => {
                self.finalize_failed(&app, &job, err).await;
            }
        }

        self.persist_recovery().await;
    }

    async fn finalize_failed(&self, app: &AppHandle, job: &Job, err: AppError) {
        let finished = now_ms();
        let err_msg = err.to_string();
        {
            let mut guard = self.queue_mutex(job.media_type).lock().await;
            if let Some(j) = guard.iter_mut().find(|x| x.id == job.id) {
                j.status = JobStatus::Failed;
                j.error = Some(err_msg.clone());
                j.finished_at = Some(finished);
            }
        }
        let _ = app.emit(
            "job-status-changed",
            JobStatusChangedEvent {
                id: job.id.clone(),
                media_type: job.media_type,
                status: JobStatus::Failed,
                output_path: None,
                output_size: None,
                size_larger_warning: None,
                error: Some(err_msg.clone()),
                finished_at: Some(finished),
            },
        );
        self.record_history(HistoryItem {
            id: job.id.clone(),
            media_type: job.media_type,
            file_name: job.file_name.clone(),
            input_path: job.input_path.clone(),
            output_path: String::new(),
            original_size: job.original_size,
            output_size: 0,
            saved_bytes: 0,
            status: "failed".to_string(),
            error: Some(err_msg),
            finished_at: finished,
        });
    }

    fn record_history(&self, item: HistoryItem) {
        if let Ok(mut hist) = self.history.write() {
            hist.insert(0, item);
            if hist.len() > 1000 {
                hist.truncate(1000);
            }
            let _ = save_history(&self.storage, &hist);
        }
    }

    pub async fn pause_job(&self, app: &AppHandle, id: &str) -> Result<(), AppError> {
        for mt in [MediaType::Video, MediaType::Image, MediaType::Audio] {
            let mut guard = self.queue_mutex(mt).lock().await;
            if let Some(job) = guard.iter_mut().find(|j| j.id == id) {
                if job.status == JobStatus::Processing {
                    if matches!(mt, MediaType::Video | MediaType::Audio) {
                        if let Some(pid) = self.process_registry.get_pid(id) {
                            suspend_process(pid)?;
                        }
                    }
                    job.status = JobStatus::Paused;
                } else if job.status == JobStatus::Queued {
                    job.status = JobStatus::Paused;
                }
                let _ = app.emit(
                    "job-status-changed",
                    JobStatusChangedEvent {
                        id: id.to_string(),
                        media_type: mt,
                        status: job.status,
                        output_path: None,
                        output_size: None,
                        size_larger_warning: None,
                        error: None,
                        finished_at: None,
                    },
                );
                drop(guard);
                self.persist_recovery().await;
                return Ok(());
            }
        }
        Err(AppError::InvalidState(format!("Job {id} not found")))
    }

    pub async fn resume_job(self: &Arc<Self>, app: AppHandle, id: &str) -> Result<(), AppError> {
        for mt in [MediaType::Video, MediaType::Image, MediaType::Audio] {
            let mut guard = self.queue_mutex(mt).lock().await;
            if let Some(job) = guard.iter_mut().find(|j| j.id == id) {
                if job.status != JobStatus::Paused {
                    return Ok(());
                }
                let new_status = if matches!(mt, MediaType::Video | MediaType::Audio) && self.process_registry.get_pid(id).is_some() {
                    if let Some(pid) = self.process_registry.get_pid(id) {
                        resume_process(pid)?;
                    }
                    JobStatus::Processing
                } else {
                    JobStatus::Queued
                };
                job.status = new_status;
                let _ = app.emit(
                    "job-status-changed",
                    JobStatusChangedEvent {
                        id: id.to_string(),
                        media_type: mt,
                        status: new_status,
                        output_path: None,
                        output_size: None,
                        size_larger_warning: None,
                        error: None,
                        finished_at: None,
                    },
                );
                drop(guard);
                self.persist_recovery().await;
                if new_status == JobStatus::Queued {
                    self.start_queue(app, mt, None).await?;
                }
                return Ok(());
            }
        }
        Err(AppError::InvalidState(format!("Job {id} not found")))
    }

    pub async fn cancel_job(&self, app: &AppHandle, id: &str) -> Result<(), AppError> {
        self.cancelled_ids.lock().await.insert(id.to_string());
        for mt in [MediaType::Video, MediaType::Image, MediaType::Audio] {
            let mut guard = self.queue_mutex(mt).lock().await;
            if let Some(job) = guard.iter_mut().find(|j| j.id == id) {
                if let Some(pid) = self.process_registry.get_pid(id) {
                    let _ = kill_process(pid);
                    self.process_registry.unregister(id);
                }
                job.status = JobStatus::Cancelled;
                job.finished_at = Some(now_ms());
                let _ = app.emit(
                    "job-status-changed",
                    JobStatusChangedEvent {
                        id: id.to_string(),
                        media_type: mt,
                        status: JobStatus::Cancelled,
                        output_path: None,
                        output_size: None,
                        size_larger_warning: None,
                        error: None,
                        finished_at: job.finished_at,
                    },
                );
                drop(guard);
                self.persist_recovery().await;
                return Ok(());
            }
        }
        Ok(())
    }

    pub async fn pause_all_jobs(&self, app: &AppHandle, media_type: MediaType) -> Result<(), AppError> {
        match media_type {
            MediaType::Video => self.video_paused.store(true, Ordering::SeqCst),
            MediaType::Image => self.image_paused.store(true, Ordering::SeqCst),
            MediaType::Audio => self.audio_paused.store(true, Ordering::SeqCst),
        }

        let mut guard = self.queue_mutex(media_type).lock().await;
        for job in guard.iter_mut() {
            if job.status == JobStatus::Processing {
                if matches!(media_type, MediaType::Video | MediaType::Audio) {
                    if let Some(pid) = self.process_registry.get_pid(&job.id) {
                        let _ = suspend_process(pid);
                    }
                }
                job.status = JobStatus::Paused;
                let _ = app.emit(
                    "job-status-changed",
                    JobStatusChangedEvent {
                        id: job.id.clone(),
                        media_type,
                        status: JobStatus::Paused,
                        output_path: None,
                        output_size: None,
                        size_larger_warning: None,
                        error: None,
                        finished_at: None,
                    },
                );
            }
        }
        drop(guard);
        self.persist_recovery().await;
        Ok(())
    }

    pub async fn resume_all_jobs(self: &Arc<Self>, app: AppHandle, media_type: MediaType) -> Result<(), AppError> {
        match media_type {
            MediaType::Video => self.video_paused.store(false, Ordering::SeqCst),
            MediaType::Image => self.image_paused.store(false, Ordering::SeqCst),
            MediaType::Audio => self.audio_paused.store(false, Ordering::SeqCst),
        }

        let mut need_start_queue = false;
        let mut guard = self.queue_mutex(media_type).lock().await;
        for job in guard.iter_mut() {
            if job.status == JobStatus::Paused {
                let new_status = if matches!(media_type, MediaType::Video | MediaType::Audio)
                    && self.process_registry.get_pid(&job.id).is_some()
                {
                    if let Some(pid) = self.process_registry.get_pid(&job.id) {
                        let _ = resume_process(pid);
                    }
                    JobStatus::Processing
                } else {
                    need_start_queue = true;
                    JobStatus::Queued
                };
                job.status = new_status;
                let _ = app.emit(
                    "job-status-changed",
                    JobStatusChangedEvent {
                        id: job.id.clone(),
                        media_type,
                        status: new_status,
                        output_path: None,
                        output_size: None,
                        size_larger_warning: None,
                        error: None,
                        finished_at: None,
                    },
                );
            } else if job.status == JobStatus::Queued {
                need_start_queue = true;
            }
        }
        drop(guard);
        self.persist_recovery().await;
        if need_start_queue {
            self.start_queue(app, media_type, None).await?;
        }
        Ok(())
    }

    pub async fn cancel_all_jobs(&self, app: &AppHandle, media_type: MediaType) -> Result<(), AppError> {
        let ids: Vec<String> = {
            let guard = self.queue_mutex(media_type).lock().await;
            guard
                .iter()
                .filter(|j| matches!(j.status, JobStatus::Queued | JobStatus::Processing | JobStatus::Paused))
                .map(|j| j.id.clone())
                .collect()
        };
        for id in ids {
            let _ = self.cancel_job(app, &id).await;
        }
        Ok(())
    }

    pub async fn remove_job(&self, id: &str) -> Result<(), AppError> {
        for mt in [MediaType::Video, MediaType::Image, MediaType::Audio] {
            let mut guard = self.queue_mutex(mt).lock().await;
            let len_before = guard.len();
            guard.retain(|j| !(j.id == id && j.status != JobStatus::Processing));
            if guard.len() != len_before {
                drop(guard);
                self.persist_recovery().await;
                return Ok(());
            }
        }
        Ok(())
    }

    pub async fn clear_completed_jobs(&self, media_type: MediaType) -> Result<(), AppError> {
        let mut guard = self.queue_mutex(media_type).lock().await;
        guard.retain(|j| {
            !matches!(
                j.status,
                JobStatus::Completed | JobStatus::Failed | JobStatus::Cancelled
            )
        });
        drop(guard);
        self.persist_recovery().await;
        Ok(())
    }

    pub async fn reorder_jobs(
        &self,
        media_type: MediaType,
        job_ids: Vec<String>,
    ) -> Result<Vec<Job>, AppError> {
        let mut guard = self.queue_mutex(media_type).lock().await;
        let mut remaining: Vec<Job> = std::mem::take(&mut *guard);
        let mut reordered = Vec::with_capacity(remaining.len());

        for target_id in job_ids {
            if let Some(pos) = remaining.iter().position(|j| j.id == target_id) {
                reordered.push(remaining.remove(pos));
            }
        }
        reordered.extend(remaining);

        *guard = reordered.clone();
        drop(guard);
        self.persist_recovery().await;
        Ok(reordered)
    }

    pub async fn retry_job(&self, app: &AppHandle, id: &str) -> Result<(), AppError> {
        for mt in [MediaType::Video, MediaType::Image, MediaType::Audio] {
            let mut guard = self.queue_mutex(mt).lock().await;
            if let Some(job) = guard.iter_mut().find(|j| j.id == id) {
                if matches!(job.status, JobStatus::Failed | JobStatus::Cancelled) {
                    job.status = JobStatus::Queued;
                    job.progress = 0.0;
                    job.error = None;
                    job.eta_seconds = None;
                    job.finished_at = None;
                    let _ = app.emit(
                        "job-status-changed",
                        JobStatusChangedEvent {
                            id: id.to_string(),
                            media_type: mt,
                            status: JobStatus::Queued,
                            output_path: None,
                            output_size: None,
                            size_larger_warning: None,
                            error: None,
                            finished_at: None,
                        },
                    );
                    drop(guard);
                    self.persist_recovery().await;
                }
                return Ok(());
            }
        }
        Ok(())
    }

    pub async fn keep_original(&self, id: &str) -> Result<(), AppError> {
        for mt in [MediaType::Video, MediaType::Image, MediaType::Audio] {
            let mut guard = self.queue_mutex(mt).lock().await;
            if let Some(job) = guard.iter_mut().find(|j| j.id == id) {
                if let Some(ref out_path) = job.output_path {
                    if out_path != &job.input_path {
                        let p = PathBuf::from(out_path);
                        if p.exists() {
                            let _ = std::fs::remove_file(&p);
                        }
                    }
                }
                job.output_path = None;
                job.output_size = None;
                job.size_larger_warning = Some(false);
                return Ok(());
            }
        }
        Ok(())
    }
}
