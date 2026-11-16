use tauri::State;

use crate::error::AppError;
use crate::ffmpeg::downloader::{detect_capabilities, resolve_binaries};
use crate::models::Capabilities;
use crate::queue::manager::AppState;

#[tauri::command]
pub fn get_capabilities(state: State<'_, AppState>) -> Result<Capabilities, AppError> {
    let settings = state
        .settings
        .read()
        .map_err(|_| AppError::InvalidState("Settings lock poisoned".into()))?;
    let ff = resolve_binaries(&state.storage, &settings).map(|(f, _, _)| f);
    let caps = detect_capabilities(ff.as_deref());
    if let Ok(mut guard) = state.capabilities.write() {
        *guard = caps.clone();
    }
    Ok(caps)
}
