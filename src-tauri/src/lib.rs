use std::sync::Mutex;
use tauri::Manager;

mod commands;
mod db;
mod git;
mod project_init;
mod scaffold;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
}

/// Install a panic hook that appends crash info to errors.log in the app data
/// directory before deferring to the default hook (which prints to stderr).
fn install_panic_hook() {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());
        let entry = format!("\n=== PANIC ===\nLocation: {location}\n{info}\n");

        if let Ok(home) = std::env::var("HOME") {
            let log_path = format!(
                "{}/Library/Application Support/com.glen.projecttracker/errors.log",
                home
            );
            use std::io::Write;
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
            {
                let _ = f.write_all(entry.as_bytes());
            }
        }

        prev(info);
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_hook();

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
            commands::get_latest_scans,
            commands::validate_repo_path,
            commands::get_dashboard_stats,
            commands::open_folder,
            commands::open_in_vscode,
            commands::open_in_terminal,
            commands::open_in_iterm,
            commands::run_claude_here,
            commands::run_claude_bootstrap,
            commands::copy_bootstrap_prompt,
            commands::run_git_status,
            commands::is_iterm_available,
            commands::export_projects,
            commands::import_projects,
            commands::discover_repos,
            commands::bulk_import_repos,
            commands::choose_folder_mac,
            // Planning
            commands::get_project_documents,
            commands::update_project_document,
            commands::update_document_status,
            commands::regenerate_scaffold,
            commands::get_methodology_blocks,
            commands::update_methodology_block,
            commands::assemble_planning_prompt,
            commands::import_plan_response,
            commands::run_plan_with_claude_cli,
            commands::get_project_plan,
            commands::update_task_status,
            commands::update_task_progress_note,
            commands::update_phase_status,
            commands::get_ai_plan_runs,
            commands::get_in_progress_tasks,
            // Claude session
            commands::get_opener_prompt,
            commands::start_claude_session,
            commands::send_session_message,
            commands::reset_claude_session,
            commands::update_session_notes,
            // Settings
            commands::get_settings,
            commands::update_setting,
            // Scaffold
            commands::check_gh_cli,
            commands::scaffold_new_project,
            // Project init
            commands::init_new_project,
            commands::scaffold_full_project,
            // Audits
            commands::assemble_audit_prompt,
            commands::run_audit_with_claude_cli,
            commands::store_audit_result,
            commands::get_project_audits,
            commands::get_audit_detail,
            commands::update_finding_status,
            commands::create_task_from_finding,
            // Skills library
            commands::fetch_skills_index,
            commands::fetch_skill_content,
            commands::get_installed_skills,
            commands::install_skill,
            // Update check
            commands::check_for_update,
            commands::publish_current_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
