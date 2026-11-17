pub mod commands;
pub mod error;
pub mod ffmpeg;
pub mod models;
pub mod processors;
pub mod queue;
pub mod storage;
pub mod utils;

use tauri::Manager;

use crate::queue::manager::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("renium"));
            let state = AppState::initialize(app_data_dir);
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::jobs::get_jobs,
            commands::jobs::add_jobs,
            commands::jobs::update_queued_jobs_options,
            commands::jobs::start_queue,
            commands::jobs::pause_job,
            commands::jobs::resume_job,
            commands::jobs::cancel_job,
            commands::jobs::pause_all_jobs,
            commands::jobs::resume_all_jobs,
            commands::jobs::cancel_all_jobs,
            commands::jobs::remove_job,
            commands::jobs::clear_completed_jobs,
            commands::jobs::reorder_jobs,
            commands::jobs::retry_job,
            commands::jobs::keep_original,
            commands::jobs::open_output_folder,
            commands::jobs::open_output_file,
            commands::jobs::generate_preview,
            commands::ffmpeg_setup::check_ffmpeg,
            commands::ffmpeg_setup::download_ffmpeg,
            commands::ffmpeg_setup::locate_ffmpeg,
            commands::capabilities::get_capabilities,
            commands::history::get_history,
            commands::history::remove_history_item,
            commands::history::clear_history,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::get_presets,
            commands::settings::save_preset,
            commands::settings::delete_preset,
            commands::settings::export_presets_json,
            commands::settings::import_presets_json,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Renium Tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<AppState>() {
                state.process_registry.kill_all();
            }
        }
    });
}
