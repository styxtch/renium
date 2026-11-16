use tauri::State;

use crate::error::AppError;
use crate::models::HistoryItem;
use crate::queue::manager::AppState;
use crate::storage::save_history;

#[tauri::command]
pub fn get_history(state: State<'_, AppState>) -> Result<Vec<HistoryItem>, AppError> {
    let guard = state
        .history
        .read()
        .map_err(|_| AppError::InvalidState("History lock poisoned".into()))?;
    Ok(guard.clone())
}

#[tauri::command]
pub fn remove_history_item(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let mut guard = state
        .history
        .write()
        .map_err(|_| AppError::InvalidState("History lock poisoned".into()))?;
    guard.retain(|item| item.id != id);
    save_history(&state.storage, &guard)?;
    Ok(())
}

#[tauri::command]
pub fn clear_history(state: State<'_, AppState>) -> Result<(), AppError> {
    let mut guard = state
        .history
        .write()
        .map_err(|_| AppError::InvalidState("History lock poisoned".into()))?;
    guard.clear();
    save_history(&state.storage, &guard)?;
    Ok(())
}
