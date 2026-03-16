use std::sync::Mutex;
use tauri::Manager;

mod commands;
mod db;
mod git;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Use the platform's standard app-data directory so the DB persists
            // across app updates and is in the expected macOS location:
            //   ~/Library/Application Support/com.glen.projecttracker/
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory");

            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data directory");

            let db_path = app_data_dir.join("projects.db");
            let conn =
                db::init_database(&db_path).expect("Failed to initialise SQLite database");

            app.manage(AppState {
                db: Mutex::new(conn),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_projects,
            commands::get_project,
            commands::create_project,
            commands::update_project,
            commands::update_project_status,
            commands::relink_repo_path,
            commands::delete_project,
            commands::scan_project,
            commands::get_project_scans,
            commands::validate_repo_path,
            commands::get_dashboard_stats,
            commands::open_folder,
            commands::open_in_vscode,
            commands::open_in_terminal,
            commands::open_in_iterm,
            commands::run_claude_here,
            commands::run_git_status,
            commands::is_iterm_available,
            commands::export_projects,
            commands::import_projects,
            commands::discover_repos,
            commands::bulk_import_repos,
            commands::choose_folder_mac,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
