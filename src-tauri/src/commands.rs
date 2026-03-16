use std::path::Path;
use std::process::Command;

use tauri::State;

use crate::db::{
    self, CreateProject, DashboardStats, Project, ProjectScan, UpdateProject,
};
use crate::git;
use crate::AppState;

// ── Projects ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::fetch_projects(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_project(id: i64, state: State<'_, AppState>) -> Result<Project, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::fetch_project(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_project(
    project: CreateProject,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::insert_project(&conn, project).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_project(
    id: i64,
    project: UpdateProject,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_project_record(&conn, id, project).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_project_status(
    id: i64,
    status: String,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    let valid = ["active", "blocked", "paused", "done"];
    if !valid.contains(&status.as_str()) {
        return Err(format!("Invalid status: {status}"));
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_status(&conn, id, &status).map_err(|e| e.to_string())
}

/// Relink: update only the local_repo_path without touching other metadata.
#[tauri::command]
pub fn relink_repo_path(
    id: i64,
    path: String,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_repo_path(&conn, id, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_project(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_project_record(&conn, id).map_err(|e| e.to_string())
}

// ── Git scanning ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn scan_project(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<ProjectScan, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let project = db::fetch_project(&conn, project_id).map_err(|e| e.to_string())?;

    // Scan even for invalid/missing paths — the scan records the error
    let git_status = git::scan_repo(&project.local_repo_path);

    let scan = db::insert_scan(&conn, project_id, &git_status).map_err(|e| e.to_string())?;
    db::update_last_scanned(&conn, project_id).map_err(|e| e.to_string())?;

    Ok(scan)
}

#[tauri::command]
pub fn get_project_scans(
    project_id: i64,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<ProjectScan>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::fetch_scans(&conn, project_id, limit.unwrap_or(10)).map_err(|e| e.to_string())
}

/// Validate whether a path is an accessible git repo without saving a scan.
#[tauri::command]
pub fn validate_repo_path(path: String) -> bool {
    git::is_valid_repo(&path)
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_dashboard_stats(state: State<'_, AppState>) -> Result<DashboardStats, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::fetch_dashboard_stats(&conn).map_err(|e| e.to_string())
}

// ── File system helpers ───────────────────────────────────────────────────────

/// Open a folder in macOS Finder.
#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Open a folder in a code editor. Tries VS Code, Cursor, Zed, BBEdit, and
/// Windsurf by name (using `open -a` which checks exit status properly), then
/// falls back to CLI candidates in PATH and common locations.
#[tauri::command]
pub fn open_in_vscode(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }

    // `open -a <AppName> <path>` exits 0 on success, non-zero if app not found.
    // IMPORTANT: use .status() (waits for exit code), NOT .spawn() (always succeeds).
    let app_names = [
        "Visual Studio Code",
        "Cursor",
        "Windsurf",
        "Zed",
        "BBEdit",
        "Nova",
        "Sublime Text",
    ];

    for app in &app_names {
        if let Ok(status) = Command::new("open")
            .args(["-a", app, path.as_str()])
            .status()
        {
            if status.success() {
                return Ok(());
            }
        }
    }

    // Fallback: CLI binaries (useful in tauri dev where PATH includes homebrew)
    let cli_candidates = [
        "code",
        "cursor",
        "zed",
        "/usr/local/bin/code",
        "/opt/homebrew/bin/code",
        "/opt/homebrew/bin/cursor",
    ];

    for candidate in &cli_candidates {
        if let Ok(_) = Command::new(candidate).arg(&path).spawn() {
            return Ok(());
        }
    }

    Err("No supported editor found (tried VS Code, Cursor, Windsurf, Zed, BBEdit). Install one and try again.".to_string())
}

// ── Repo discovery ────────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct BulkImportItem {
    pub name: String,
    pub path: String,
}

const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", "dist", "build", ".next", "target",
    ".cache", "vendor", "__pycache__", ".tox", ".venv", "venv",
    "coverage", ".nyc_output", "out",
];
const MAX_DEPTH: usize = 6;

fn find_git_repos(dir: &std::path::Path, depth: usize) -> Vec<std::path::PathBuf> {
    if depth > MAX_DEPTH {
        return vec![];
    }
    if dir.join(".git").exists() {
        return vec![dir.to_path_buf()];
    }
    let mut repos = vec![];
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if SKIP_DIRS.contains(&name) {
            continue;
        }
        repos.extend(find_git_repos(&path, depth + 1));
    }
    repos
}

#[tauri::command]
pub fn discover_repos(
    root_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<db::DiscoveredRepo>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let existing = db::fetch_all_repo_paths(&conn).map_err(|e| e.to_string())?;

    let root = Path::new(&root_path);
    if !root.exists() || !root.is_dir() {
        return Err(format!("Not a directory: {}", root_path));
    }

    let repo_paths = find_git_repos(root, 0);
    let result = repo_paths
        .into_iter()
        .map(|p| {
            let name = p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            let path_str = p.to_string_lossy().to_string();
            let already_tracked = existing.contains(&path_str);
            let gs = git::scan_repo(&path_str);
            db::DiscoveredRepo {
                name,
                path: path_str,
                is_valid_git: gs.is_valid_repo,
                current_branch: gs.current_branch,
                is_dirty: gs.is_dirty,
                last_commit_date: gs.last_commit_date,
                last_commit_message: gs.last_commit_message,
                already_tracked,
            }
        })
        .collect();
    Ok(result)
}

#[tauri::command]
pub fn bulk_import_repos(
    repos: Vec<BulkImportItem>,
    state: State<'_, AppState>,
) -> Result<Vec<db::Project>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let existing = db::fetch_all_repo_paths(&conn).map_err(|e| e.to_string())?;
    let mut created = vec![];
    for item in repos {
        if existing.contains(&item.path) {
            continue;
        }
        let project = db::insert_project(
            &conn,
            db::CreateProject {
                name: item.name,
                description: String::new(),
                local_repo_path: item.path,
                status: "active".to_string(),
                phase: "planning".to_string(),
                priority: "medium".to_string(),
                ai_tool: "other".to_string(),
                current_task: String::new(),
                next_task: String::new(),
                blocker: String::new(),
                notes: String::new(),
            },
        )
        .map_err(|e| e.to_string())?;
        created.push(project);
    }
    Ok(created)
}

#[tauri::command]
pub fn choose_folder_mac() -> Result<Option<String>, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(r#"POSIX path of (choose folder with prompt "Select a folder to scan for git repositories")"#)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(if path.is_empty() { None } else { Some(path) })
    } else {
        Ok(None)
    }
}

// ── Terminal integration ───────────────────────────────────────────────────────

/// Escape a filesystem path for embedding as a POSIX-shell single-quoted
/// argument inside an AppleScript double-quoted string.
///
/// Escaping order (matters):
///   1. POSIX single-quote escape  — so the shell treats the path literally
///   2. Backslash-double           — AppleScript: \ → \\
///   3. Double-quote escape        — AppleScript: " → \"
fn posix_shell_arg_for_applescript(path: &str) -> String {
    path.replace('\'', r"'\''") // POSIX: ' → '\''
        .replace('\\', r"\\")   // AppleScript: \ → \\
        .replace('"', r#"\""#)  // AppleScript: " → \"
}

/// Open a directory in Terminal.app.
#[tauri::command]
pub fn open_in_terminal(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    let arg = posix_shell_arg_for_applescript(&path);
    let script = format!(
        "tell application \"Terminal\"\nactivate\ndo script \"cd '{arg}'\"\nend tell"
    );
    Command::new("osascript").arg("-e").arg(&script).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Open a directory in iTerm2. Returns an error if iTerm2 is not installed.
#[tauri::command]
pub fn open_in_iterm(path: String) -> Result<(), String> {
    if !Path::new("/Applications/iTerm.app").exists() {
        return Err("iTerm2 is not installed at /Applications/iTerm.app.".to_string());
    }
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    let arg = posix_shell_arg_for_applescript(&path);
    let script = format!(
        "tell application \"iTerm\"\nactivate\ncreate window with default profile\ntell current session of current window\nwrite text \"cd '{arg}'\"\nend tell\nend tell"
    );
    Command::new("osascript").arg("-e").arg(&script).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Open the project directory in the best available terminal and run `claude`.
/// Prefers iTerm2; falls back to Terminal.app.
#[tauri::command]
pub fn run_claude_here(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    let arg = posix_shell_arg_for_applescript(&path);
    if Path::new("/Applications/iTerm.app").exists() {
        let script = format!(
            "tell application \"iTerm\"\nactivate\ncreate window with default profile\ntell current session of current window\nwrite text \"cd '{arg}' && claude\"\nend tell\nend tell"
        );
        if Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
        {
            return Ok(());
        }
    }
    let script = format!(
        "tell application \"Terminal\"\nactivate\ndo script \"cd '{arg}' && claude\"\nend tell"
    );
    Command::new("osascript").arg("-e").arg(&script).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Run `git status --short -b` in a directory and return the raw output.
#[tauri::command]
pub fn run_git_status(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    let out = Command::new("git")
        .args(["-C", &path, "status", "--short", "-b"])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).into_owned())
    }
}

/// Return true if iTerm2 is installed at /Applications/iTerm.app.
#[tauri::command]
pub fn is_iterm_available() -> bool {
    Path::new("/Applications/iTerm.app").exists()
}

// ── Export / Import ───────────────────────────────────────────────────────────

/// Export all project metadata to a JSON string.
/// The caller is responsible for saving the string to a file.
#[tauri::command]
pub fn export_projects(state: State<'_, AppState>) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let projects = db::export_all_projects(&conn).map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&projects).map_err(|e| e.to_string())
}

/// Import projects from a JSON string previously produced by export_projects.
/// Returns the number of projects imported.
#[tauri::command]
pub fn import_projects(json: String, state: State<'_, AppState>) -> Result<usize, String> {
    let projects: Vec<db::Project> =
        serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {e}"))?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::import_projects(&conn, projects).map_err(|e| e.to_string())
}
