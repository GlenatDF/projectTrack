use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use tauri::State;

use crate::db::{
    self, AiPlanRun, AssembledPrompt, CreateProject, DashboardStats, ImportPlanResult,
    InProgressTask, MethodologyBlock, Project, ProjectDocument, ProjectPhase, ProjectPlan,
    ProjectTask, ProjectScan, UpdateProject,
};
use serde::Serialize;
use crate::git;
use crate::scaffold::{self, ScaffoldRequest, ScaffoldResult};
use crate::project_init::{self, ProjectInitRequest, ProjectInitResult};

/// Combined result for the full "build from scratch" flow.
#[derive(Debug, Serialize)]
pub struct FullScaffoldResult {
    pub project_id:           i64,
    pub project_path:         String,
    pub files_created:        Vec<String>,
    pub github_url:           Option<String>,
    pub vercel_project_url:   Option<String>,
    pub supabase_project_id:  Option<String>,
    pub supabase_db_password: Option<String>,
    pub scaffold_steps:       Vec<scaffold::ScaffoldStep>,
}
use crate::AppState;

/// Acquire the DB lock. If the mutex is poisoned (only possible if a thread
/// panicked while holding it), recover the guard — the underlying Connection
/// is almost certainly still valid since all DB errors are returned, not panicked.
macro_rules! db_conn {
    ($state:expr) => {
        $state.db.lock().unwrap_or_else(|e| e.into_inner())
    };
}

// ── Projects ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    let conn = db_conn!(state);
    db::fetch_projects(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_project(id: i64, state: State<'_, AppState>) -> Result<Project, String> {
    let conn = db_conn!(state);
    db::fetch_project(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_project(
    project: CreateProject,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    let conn = db_conn!(state);
    db::insert_project(&conn, project).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_project(
    id: i64,
    project: UpdateProject,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    let conn = db_conn!(state);
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
    let conn = db_conn!(state);
    db::update_status(&conn, id, &status).map_err(|e| e.to_string())
}

/// Relink: update only the local_repo_path without touching other metadata.
#[tauri::command]
pub fn relink_repo_path(
    id: i64,
    path: String,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    let conn = db_conn!(state);
    db::update_repo_path(&conn, id, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_project(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let conn = db_conn!(state);
    db::delete_project_record(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn archive_github_repo(id: i64, state: State<'_, AppState>) -> Result<String, String> {
    let conn = db_conn!(state);
    let project = db::fetch_project(&conn, id).map_err(|e: rusqlite::Error| e.to_string())?;
    if project.local_repo_path.trim().is_empty() {
        return Err("Project has no local repo path configured".to_string());
    }
    scaffold::archive_github_repo(&project.local_repo_path, &augmented_path())
}

// ── Git scanning ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn scan_project(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<ProjectScan, String> {
    let conn = db_conn!(state);

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
    let conn = db_conn!(state);
    db::fetch_scans(&conn, project_id, limit.unwrap_or(10)).map_err(|e| e.to_string())
}

/// Return the latest scan for every project in a single query.
/// Used by the dashboard to build its health/dirty map without N+1 round-trips.
#[tauri::command]
pub fn get_latest_scans(state: State<'_, AppState>) -> Result<Vec<ProjectScan>, String> {
    let conn = db_conn!(state);
    db::fetch_latest_scans_all(&conn).map_err(|e| e.to_string())
}

/// Validate whether a path is an accessible git repo without saving a scan.
#[tauri::command]
pub fn validate_repo_path(path: String) -> bool {
    git::is_valid_repo(&path)
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_dashboard_stats(state: State<'_, AppState>) -> Result<DashboardStats, String> {
    let conn = db_conn!(state);
    db::fetch_dashboard_stats(&conn).map_err(|e| e.to_string())
}

// ── File system helpers ───────────────────────────────────────────────────────

/// Open a URL in the system default browser.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

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

    // Fallback: CLI binaries (useful in tauri dev where PATH includes homebrew).
    // IMPORTANT: use .spawn() here (fire-and-forget), NOT .status().
    // Editors are long-running processes; .status() would block until the editor closes.
    // .spawn() returns Err only if the binary cannot be found/launched at all, which
    // is exactly the signal we need to try the next candidate.
    let cli_candidates = [
        "code",
        "cursor",
        "zed",
        "/usr/local/bin/code",
        "/opt/homebrew/bin/code",
        "/opt/homebrew/bin/cursor",
    ];

    for candidate in &cli_candidates {
        if Command::new(candidate).arg(&path).spawn().is_ok() {
            return Ok(());
        }
    }

    Err("No supported editor found (tried VS Code, Cursor, Windsurf, Zed, BBEdit). Install one and try again.".to_string())
}

// ── Project file read ─────────────────────────────────────────────────────────

/// Read up to 5 000 bytes from a file inside the project's repo root.
/// Returns distinct error strings so the frontend can classify the result:
///   "not_found"   — path does not exist
///   "unsafe_path" — resolved path escapes the project root
///   "not_a_file"  — path points to a directory
/// All other errors are passed through as-is.
#[tauri::command]
pub fn read_project_file(repo_path: String, relative_path: String) -> Result<String, String> {
    use std::io::Read;

    // Reject obviously empty inputs up-front.
    if repo_path.trim().is_empty() {
        return Err("not_found".to_string());
    }

    let root = std::fs::canonicalize(&repo_path)
        .map_err(|_| "not_found".to_string())?;

    // Normalise the requested path:
    // - if it looks absolute, try stripping the repo root prefix so it becomes relative
    // - otherwise join directly
    let rel = {
        let rp = std::path::Path::new(&relative_path);
        if rp.is_absolute() {
            match rp.strip_prefix(&root) {
                Ok(stripped) => stripped.to_path_buf(),
                // absolute path that doesn't share our root → reject
                Err(_) => return Err("unsafe_path".to_string()),
            }
        } else {
            rp.to_path_buf()
        }
    };

    let full = root.join(&rel);

    // Canonicalize collapses any "../" sequences.
    let resolved = std::fs::canonicalize(&full)
        .map_err(|_| "not_found".to_string())?;

    // Safety: resolved path must stay inside the project root.
    if !resolved.starts_with(&root) {
        return Err("unsafe_path".to_string());
    }

    let meta = std::fs::metadata(&resolved).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("not_a_file".to_string());
    }

    let f = std::fs::File::open(&resolved).map_err(|e| e.to_string())?;
    let mut buf = Vec::with_capacity(5001);
    f.take(5000).read_to_end(&mut buf).map_err(|e| e.to_string())?;

    Ok(String::from_utf8_lossy(&buf).into_owned())
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
    let conn = db_conn!(state);
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
            let gs = git::scan_repo_light(&path_str);
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
    let conn = db_conn!(state);
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
                claude_startup_prompt: String::new(),
                claude_prompt_mode: "append".to_string(),
                claude_priority_files: String::new(),
                session_handoff_notes: String::new(),
                startup_command: "claude".to_string(),
                preferred_terminal: String::new(),
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
/// Escaping order (matters — AppleScript escapes must come before the POSIX step):
///   1. Backslash-double    — AppleScript: \ → \\ (must be first, before any new \ are introduced)
///   2. Double-quote escape — AppleScript: " → \"
///   3. POSIX single-quote  — shell:       ' → '\'' (last, so the \ introduced above are not re-escaped)
fn posix_shell_arg_for_applescript(path: &str) -> String {
    path.replace('\\', r"\\")   // 1. AppleScript: \ → \\ (must precede POSIX step)
        .replace('"', r#"\""#)  // 2. AppleScript: " → \"
        .replace('\'', r"'\''") // 3. POSIX: ' → '\'' (last, so these \ are not re-escaped)
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

/// Global bootstrap prompt used as the base for all projects.
const GLOBAL_BOOTSTRAP_PROMPT: &str = "\
You are helping me continue work on this project. Before touching any code, please:

1. Inspect the repo structure — look at the directory tree and key config files
2. Check git status and review recent commits (git log --oneline -10)
3. Read any important docs: README, CLAUDE.md, TODO, NOTES, or similar files
4. Summarize the current project state concisely
5. Identify the most likely next steps based on what you see

Do NOT modify any files until I explicitly ask you to. Just orient yourself and wait for my instruction.";

/// Compose the full bootstrap prompt for a project from its settings.
fn compose_bootstrap_prompt(project: &db::Project) -> String {
    let mode = project.claude_prompt_mode.as_str();
    let mut prompt = if mode == "replace" {
        if project.claude_startup_prompt.is_empty() {
            GLOBAL_BOOTSTRAP_PROMPT.to_string()
        } else {
            project.claude_startup_prompt.clone()
        }
    } else {
        // append (default)
        let mut base = GLOBAL_BOOTSTRAP_PROMPT.to_string();
        if !project.claude_startup_prompt.is_empty() {
            base.push_str("\n\n---\nProject-specific instructions:\n");
            base.push_str(&project.claude_startup_prompt);
        }
        base
    };

    if !project.claude_priority_files.is_empty() {
        prompt.push_str("\n\nPriority files to read first:\n");
        prompt.push_str(&project.claude_priority_files);
    }

    if !project.session_handoff_notes.is_empty() {
        prompt.push_str("\n\nSession handoff notes:\n");
        prompt.push_str(&project.session_handoff_notes);
    }

    prompt
}

fn copy_to_clipboard_pbcopy(text: &str) -> bool {
    (|| -> std::io::Result<()> {
        let mut child = Command::new("pbcopy").stdin(Stdio::piped()).spawn()?;
        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(text.as_bytes())?;
        }
        child.wait()?;
        Ok(())
    })()
    .is_ok()
}

fn notice(clipboard_ok: bool) -> String {
    if clipboard_ok {
        "Bootstrap prompt copied to clipboard — paste it in Claude (⌘V)".to_string()
    } else {
        "Claude opened — clipboard copy failed, type the prompt manually".to_string()
    }
}

fn open_terminal_with_command(path: &str, cmd: &str, preferred_terminal: &str) -> Result<(), String> {
    let arg = posix_shell_arg_for_applescript(path);
    let use_iterm = match preferred_terminal {
        "iterm" => Path::new("/Applications/iTerm.app").exists(),
        "terminal" => false,
        _ => Path::new("/Applications/iTerm.app").exists(), // auto
    };

    if use_iterm {
        let script = format!(
            "tell application \"iTerm\"\nactivate\ncreate window with default profile\n\
             tell current session of current window\nwrite text \"cd '{arg}' && {cmd}\"\n\
             end tell\nend tell"
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
        "tell application \"Terminal\"\nactivate\ndo script \"cd '{arg}' && {cmd}\"\nend tell"
    );
    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Open Claude in the best available terminal with the working directory set to
/// the project's repo path, and copy the composed bootstrap prompt to the
/// macOS clipboard. Returns a confirmation message to display in the UI.
#[tauri::command]
pub fn run_claude_bootstrap(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let conn = db_conn!(state);
    let project = db::fetch_project(&conn, project_id).map_err(|e| e.to_string())?;

    if project.local_repo_path.is_empty() {
        return Err("No repository path configured for this project.".to_string());
    }
    let p = Path::new(&project.local_repo_path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", project.local_repo_path));
    }

    let prompt = compose_bootstrap_prompt(&project);
    let clipboard_ok = copy_to_clipboard_pbcopy(&prompt);

    let cmd = if project.startup_command.is_empty() { "claude" } else { &project.startup_command };
    open_terminal_with_command(&project.local_repo_path, cmd, &project.preferred_terminal)?;

    Ok(notice(clipboard_ok))
}

/// Compose and copy the bootstrap prompt for a project to the clipboard
/// without opening a terminal. Returns a user-facing notice string.
#[tauri::command]
pub fn copy_bootstrap_prompt(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let conn = db_conn!(state);
    let project = db::fetch_project(&conn, project_id).map_err(|e| e.to_string())?;
    let prompt = compose_bootstrap_prompt(&project);
    let clipboard_ok = copy_to_clipboard_pbcopy(&prompt);
    Ok(notice(clipboard_ok))
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
    let conn = db_conn!(state);
    let projects = db::export_all_projects(&conn).map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&projects).map_err(|e| e.to_string())
}

/// Import projects from a JSON string previously produced by export_projects.
/// Returns the number of projects imported.
#[tauri::command]
pub fn import_projects(json: String, state: State<'_, AppState>) -> Result<usize, String> {
    let projects: Vec<db::Project> =
        serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {e}"))?;

    const VALID_STATUS:   &[&str] = &["active", "blocked", "paused", "done", "idea"];
    const VALID_PHASE:    &[&str] = &["idea", "planning", "scaffolding", "core_build",
                                      "debugging", "testing", "polishing", "shipped"];
    const VALID_PRIORITY: &[&str] = &["low", "medium", "high"];
    const VALID_AI_TOOL:  &[&str] = &["claude", "chatgpt", "both", "other"];

    for (i, p) in projects.iter().enumerate() {
        let n = i + 1;
        if p.name.trim().is_empty() {
            return Err(format!("Project {n}: name must not be empty"));
        }
        if !VALID_STATUS.contains(&p.status.as_str()) {
            return Err(format!("Project {n} \"{}\": invalid status {:?}", p.name, p.status));
        }
        if !VALID_PHASE.contains(&p.phase.as_str()) {
            return Err(format!("Project {n} \"{}\": invalid phase {:?}", p.name, p.phase));
        }
        if !VALID_PRIORITY.contains(&p.priority.as_str()) {
            return Err(format!("Project {n} \"{}\": invalid priority {:?}", p.name, p.priority));
        }
        if !VALID_AI_TOOL.contains(&p.ai_tool.as_str()) {
            return Err(format!("Project {n} \"{}\": invalid ai_tool {:?}", p.name, p.ai_tool));
        }
        if !p.local_repo_path.is_empty() {
            if !p.local_repo_path.starts_with('/') {
                return Err(format!(
                    "Project {n} \"{}\": local_repo_path must be an absolute path (starting with /)",
                    p.name
                ));
            }
            if p.local_repo_path.contains('\0') {
                return Err(format!(
                    "Project {n} \"{}\": local_repo_path contains invalid characters",
                    p.name
                ));
            }
        }
    }

    let conn = db_conn!(state);

    // Check for duplicate names against existing projects.
    let existing = db::fetch_project_names(&conn).map_err(|e| e.to_string())?;
    let duplicates: Vec<&str> = projects
        .iter()
        .filter(|p| existing.contains(p.name.trim()))
        .map(|p| p.name.as_str())
        .collect();
    if !duplicates.is_empty() {
        return Err(format!(
            "The following project names already exist in the database: {}. \
             Delete them first, or rename before importing.",
            duplicates.join(", ")
        ));
    }

    db::import_projects(&conn, projects).map_err(|e| e.to_string())
}

// ── Planning: Documents ───────────────────────────────────────────────────────

#[tauri::command]
pub fn get_project_documents(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<ProjectDocument>, String> {
    let conn = db_conn!(state);
    db::fetch_project_documents(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_project_document(
    project_id: i64,
    doc_type: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<ProjectDocument, String> {
    let conn = db_conn!(state);
    db::update_project_document(&conn, project_id, &doc_type, &content)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_document_status(
    project_id: i64,
    doc_type: String,
    status: String,
    state: State<'_, AppState>,
) -> Result<ProjectDocument, String> {
    let valid = ["draft", "reviewed", "final"];
    if !valid.contains(&status.as_str()) {
        return Err(format!("Invalid document status: {status}"));
    }
    let conn = db_conn!(state);
    db::update_document_status(&conn, project_id, &doc_type, &status)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn regenerate_scaffold(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<ProjectDocument>, String> {
    let conn = db_conn!(state);
    db::regenerate_scaffold(&conn, project_id).map_err(|e| e.to_string())
}

// ── Planning: Methodology blocks ──────────────────────────────────────────────

#[tauri::command]
pub fn get_methodology_blocks(
    state: State<'_, AppState>,
) -> Result<Vec<MethodologyBlock>, String> {
    let conn = db_conn!(state);
    db::fetch_methodology_blocks(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_methodology_block(
    slug: String,
    content: String,
    is_active: bool,
    state: State<'_, AppState>,
) -> Result<MethodologyBlock, String> {
    let conn = db_conn!(state);
    db::update_methodology_block(&conn, &slug, &content, is_active)
        .map_err(|e| e.to_string())
}

// ── Planning: Prompt assembly & plan import ───────────────────────────────────

/// Assemble the planning prompt for a project and return the prompt text +
/// any warnings. Clipboard copying is handled by the frontend.
#[tauri::command]
pub fn assemble_planning_prompt(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<AssembledPrompt, String> {
    let conn = db_conn!(state);
    db::assemble_prompt(&conn, project_id).map_err(|e| e.to_string())
}

/// Import an AI-generated plan response into the database.
/// Takes the prompt that was sent (for logging) and the raw AI response.
#[tauri::command]
pub fn import_plan_response(
    project_id: i64,
    prompt_sent: String,
    raw_response: String,
    state: State<'_, AppState>,
) -> Result<ImportPlanResult, String> {
    let mut conn = db_conn!(state);
    db::import_plan(&mut conn, project_id, &prompt_sent, &raw_response)
}

// ── Planning: Run prompt via Claude CLI ───────────────────────────────────────

/// Build an augmented PATH that includes common Node.js and Homebrew
/// locations. Tauri apps launch with a restricted environment (no shell
/// profile sourced), so node/claude may not be on the inherited PATH.
fn augmented_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    let extras = [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ];
    let mut parts: Vec<&str> = extras.iter().copied().collect();
    if !current.is_empty() {
        parts.push(&current);
    }
    parts.join(":")
}

/// Assemble the planning prompt for a project, pipe it to `claude --print`
/// via stdin, and return the raw response text for import.
/// The DB lock is held only briefly (prompt assembly), then released before
/// the slow CLI call so other commands are not blocked.
#[tauri::command]
pub fn run_plan_with_claude_cli(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Assemble prompt under a short-lived lock
    let prompt = {
        let conn = db_conn!(state);
        db::assemble_prompt(&conn, project_id)
            .map_err(|e| e.to_string())?
            .prompt
    };

    let path = augmented_path();

    // Try claude in PATH first, then common install locations
    let candidates = [
        "claude",
        "/usr/local/bin/claude",
        "/opt/homebrew/bin/claude",
        "/usr/bin/claude",
    ];

    let mut last_err = String::new();
    for candidate in &candidates {
        match Command::new(candidate)
            .arg("--print")
            .env("PATH", &path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(mut child) => {
                if let Some(stdin) = child.stdin.as_mut() {
                    stdin
                        .write_all(prompt.as_bytes())
                        .map_err(|e| e.to_string())?;
                }
                let out = child.wait_with_output().map_err(|e| e.to_string())?;
                if out.status.success() {
                    return Ok(String::from_utf8_lossy(&out.stdout).into_owned());
                }
                return Err(format!(
                    "Claude CLI exited with an error:\n{}",
                    String::from_utf8_lossy(&out.stderr)
                ));
            }
            Err(e) => last_err = e.to_string(),
        }
    }

    Err(format!(
        "Claude CLI not found. Install it with:\n  npm install -g @anthropic-ai/claude-code\n\n({last_err})"
    ))
}

// ── Planning: Plan read / status updates ──────────────────────────────────────

#[tauri::command]
pub fn get_project_plan(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<ProjectPlan, String> {
    let conn = db_conn!(state);
    db::fetch_project_plan(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_task_status(
    task_id: i64,
    project_id: i64,
    status: String,
    state: State<'_, AppState>,
) -> Result<ProjectTask, String> {
    let valid = ["pending", "in_progress", "paused", "blocked", "done", "skipped"];
    if !valid.contains(&status.as_str()) {
        return Err(format!("Invalid task status: {status}"));
    }
    let conn = db_conn!(state);
    db::update_task_status_record(&conn, task_id, project_id, &status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_task_progress_note(
    task_id: i64,
    project_id: i64,
    note: String,
    state: State<'_, AppState>,
) -> Result<ProjectTask, String> {
    let conn = db_conn!(state);
    db::update_task_progress_note_record(&conn, task_id, project_id, &note).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_phase_status(
    phase_id: i64,
    project_id: i64,
    status: String,
    state: State<'_, AppState>,
) -> Result<ProjectPhase, String> {
    let valid = ["pending", "in_progress", "done", "skipped"];
    if !valid.contains(&status.as_str()) {
        return Err(format!("Invalid phase status: {status}"));
    }
    let conn = db_conn!(state);
    db::update_phase_status_record(&conn, phase_id, project_id, &status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ai_plan_runs(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<AiPlanRun>, String> {
    let conn = db_conn!(state);
    db::fetch_ai_plan_runs(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_in_progress_tasks(state: State<'_, AppState>) -> Result<Vec<InProgressTask>, String> {
    let conn = db_conn!(state);
    db::fetch_in_progress_tasks(&conn).map_err(|e| e.to_string())
}

// ── Claude session management ──────────────────────────────────────────────────

/// The project opener prompt plus the session UUID that will be used.
#[derive(Debug, Serialize)]
pub struct OpenerPrompt {
    pub prompt: String,
    pub session_id: String,
}

/// A single turn in a Claude session: the response text and the active session UUID.
#[derive(Debug, Serialize)]
pub struct SessionTurn {
    pub response: String,
    pub session_id: String,
}

/// Return the assembled opener prompt and the current session UUID (if any).
/// Returns an empty `session_id` when no session is active — does NOT auto-generate
/// a new UUID, so this call is always side-effect-free.
#[tauri::command]
pub fn get_opener_prompt(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<OpenerPrompt, String> {
    let conn = db_conn!(state);
    let prompt = db::assemble_opener_prompt(&conn, project_id).map_err(|e| e.to_string())?;
    let session_id: String = conn
        .query_row(
            "SELECT claude_session_id FROM projects WHERE id = ?1",
            rusqlite::params![project_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(OpenerPrompt { prompt, session_id })
}

/// Start a brand-new Claude session: generate a fresh UUID, send the project opener
/// via `claude --print --session-id <uuid>`, and return the response.
/// Refuses if a session_id is already stored — caller must reset first.
/// The DB lock is released before spawning the subprocess.
#[tauri::command]
pub fn start_claude_session(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<SessionTurn, String> {
    let (session_id, repo_path, prompt) = {
        let conn = db_conn!(state);
        // Guard: refuse if a session is already active — use send_session_message to
        // continue it, or reset_claude_session + start_claude_session for a fresh one.
        let existing: String = conn
            .query_row(
                "SELECT claude_session_id FROM projects WHERE id = ?1",
                rusqlite::params![project_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !existing.is_empty() {
            return Err(format!(
                "Session {} is already active. Use 'New Session' to reset it first.",
                &existing[..8.min(existing.len())]
            ));
        }
        let project = db::fetch_project(&conn, project_id).map_err(|e| e.to_string())?;
        let prompt =
            db::assemble_opener_prompt(&conn, project_id).map_err(|e| e.to_string())?;
        let session_id =
            db::ensure_project_session_id(&conn, project_id).map_err(|e| e.to_string())?;
        (session_id, project.local_repo_path, prompt)
    }; // DB lock released here

    let response = invoke_claude(&session_id, &repo_path, &prompt, false)?;
    Ok(SessionTurn { response, session_id })
}

/// Send a follow-up message in an existing Claude session.
/// Uses --resume so the Claude CLI continues the existing conversation.
#[tauri::command]
pub fn send_session_message(
    project_id: i64,
    message: String,
    state: State<'_, AppState>,
) -> Result<SessionTurn, String> {
    let (session_id, repo_path) = {
        let conn = db_conn!(state);
        let project = db::fetch_project(&conn, project_id).map_err(|e| e.to_string())?;
        // Read the stored session ID — do NOT generate a new one here.
        // If no session is active, the caller should have called start_claude_session first.
        let session_id: String = conn
            .query_row(
                "SELECT claude_session_id FROM projects WHERE id = ?1",
                rusqlite::params![project_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if session_id.is_empty() {
            return Err("No active session. Start a session first.".to_string());
        }
        (session_id, project.local_repo_path)
    };

    let response = invoke_claude(&session_id, &repo_path, &message, true)?;
    Ok(SessionTurn { response, session_id })
}

/// Clear the stored session UUID. The next `start_claude_session` call will
/// generate a fresh UUID, beginning a new Claude conversation.
#[tauri::command]
pub fn reset_claude_session(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = db_conn!(state);
    db::clear_project_session_id(&conn, project_id).map_err(|e| e.to_string())
}

/// Update the session handoff notes for a project.
/// These notes are included in every opener prompt.
#[tauri::command]
pub fn update_session_notes(
    project_id: i64,
    notes: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = db_conn!(state);
    db::update_session_notes(&conn, project_id, &notes).map_err(|e| e.to_string())
}

/// Spawn `claude --print` with the given prompt via stdin.
///
/// `resume` controls the session flag:
///   - `false` (new session):  `--session-id <uuid>`  — creates a session with this ID
///   - `true`  (follow-up):    `--resume <uuid>`       — continues the existing session
///
/// CWD is set to the project repo directory if it exists; falls back to $HOME.
/// Tries common install locations if `claude` is not on PATH.
fn invoke_claude(session_id: &str, repo_path: &str, prompt: &str, resume: bool) -> Result<String, String> {
    let cwd = if !repo_path.is_empty() && Path::new(repo_path).exists() {
        repo_path.to_string()
    } else {
        std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string())
    };

    let path = augmented_path();
    let candidates = [
        "claude",
        "/usr/local/bin/claude",
        "/opt/homebrew/bin/claude",
        "/usr/bin/claude",
    ];

    let mut last_err = String::new();
    for candidate in &candidates {
        let session_flag = if resume { "--resume" } else { "--session-id" };
        match Command::new(candidate)
            .arg("--print")
            .arg(session_flag)
            .arg(session_id)
            .current_dir(&cwd)
            .env("PATH", &path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(mut child) => {
                if let Some(stdin) = child.stdin.as_mut() {
                    stdin.write_all(prompt.as_bytes()).map_err(|e| e.to_string())?;
                }
                let out = child.wait_with_output().map_err(|e| e.to_string())?;
                if out.status.success() {
                    return Ok(String::from_utf8_lossy(&out.stdout).trim().to_string());
                }
                return Err(format!(
                    "Claude CLI error:\n{}",
                    String::from_utf8_lossy(&out.stderr)
                ));
            }
            Err(e) => last_err = e.to_string(),
        }
    }

    Err(format!(
        "Claude CLI not found. Install with:\n  npm install -g @anthropic-ai/claude-code\n\n({last_err})"
    ))
}

// ── App settings ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_settings(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, String>, String> {
    let conn = db_conn!(state);
    db::get_all_settings(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_setting(
    key: String,
    value: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let allowed = ["projects_dir", "vercel_token", "supabase_access_token", "supabase_org_id", "scaffold_template_repo"];
    if !allowed.contains(&key.as_str()) {
        return Err(format!("Unknown setting key: {key}"));
    }
    let conn = db_conn!(state);
    db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

// ── Scaffold ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn check_gh_cli() -> bool {
    scaffold::check_gh_cli(&augmented_path())
}

#[tauri::command]
pub fn scaffold_new_project(
    project_name: String,
    description: String,
    create_github: bool,
    create_vercel: bool,
    create_supabase: bool,
    state: State<'_, AppState>,
) -> Result<ScaffoldResult, String> {
    // Read settings (needs lock only briefly)
    let (projects_dir, vercel_token, supabase_token, supabase_org_id) = {
        let conn = db_conn!(state);
        let projects_dir = db::get_setting(&conn, "projects_dir").map_err(|e| e.to_string())?;
        let vercel_token = db::get_setting(&conn, "vercel_token").map_err(|e| e.to_string())?;
        let supabase_token =
            db::get_setting(&conn, "supabase_access_token").map_err(|e| e.to_string())?;
        let supabase_org_id =
            db::get_setting(&conn, "supabase_org_id").map_err(|e| e.to_string())?;
        (projects_dir, vercel_token, supabase_token, supabase_org_id)
    };

    if projects_dir.is_empty() {
        return Err("No default projects directory configured. Set one in Settings.".to_string());
    }

    let result = scaffold::scaffold_project(ScaffoldRequest {
        project_name,
        description,
        projects_dir,
        create_github,
        create_vercel,
        create_supabase,
        vercel_token,
        supabase_token,
        supabase_org_id,
        path_env: augmented_path(),
    });

    Ok(result)
}

// ── Project init ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn init_new_project(
    config: ProjectInitRequest,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<ProjectInitResult, String> {
    let conn = db_conn!(state);
    project_init::init_project(&conn, config, &app)
}

// ── Full scaffold (scratch → docs/skills → git → cloud → DB) ──────────────────

#[tauri::command]
pub fn scaffold_full_project(
    project_name: String,
    description: String,
    main_goal: String,
    create_github: bool,
    create_vercel: bool,
    create_supabase: bool,
    create_claude_skills: bool,
    project_level: String, // "bare_bones" | "standard" | "fuller"

    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<FullScaffoldResult, String> {
    // Read settings (brief DB lock — released before long-running ops)
    let (projects_dir, vercel_token, supabase_token, supabase_org_id, claude_md_template) = {
        let conn = db_conn!(state);
        let projects_dir =
            db::get_setting(&conn, "projects_dir").map_err(|e| e.to_string())?;
        let vercel_token =
            db::get_setting(&conn, "vercel_token").map_err(|e| e.to_string())?;
        let supabase_token =
            db::get_setting(&conn, "supabase_access_token").map_err(|e| e.to_string())?;
        let supabase_org_id =
            db::get_setting(&conn, "supabase_org_id").map_err(|e| e.to_string())?;
        let claude_md_template = db::get_setting(&conn, "claude_md_template").ok()
            .filter(|s| !s.trim().is_empty());
        (projects_dir, vercel_token, supabase_token, supabase_org_id, claude_md_template)
    };

    if projects_dir.is_empty() {
        return Err(
            "No default projects directory configured. Set one in Settings.".to_string(),
        );
    }

    let path_env = augmented_path();
    let slug = scaffold::to_slug(&project_name);
    let expanded_dir =
        projects_dir.replace('~', &std::env::var("HOME").unwrap_or_default());
    let project_dir = std::path::PathBuf::from(&expanded_dir).join(&slug);
    let project_path = project_dir.to_string_lossy().to_string();

    let mut scaffold_steps: Vec<scaffold::ScaffoldStep> = Vec::new();
    let mut files_created: Vec<String> = Vec::new();
    let mut github_url: Option<String> = None;
    let mut vercel_url: Option<String> = None;
    let mut supabase_id: Option<String> = None;
    let mut supabase_pass: Option<String> = None;

    // 1. Create Next.js scaffold files
    project_init::emit_progress(&app, "files", "Creating project files", "running");
    match scaffold::create_local_files(&project_dir, &project_name, &slug, &description) {
        Ok(()) => {
            project_init::emit_progress(&app, "files", "Creating project files", "done");
            scaffold_steps.push(scaffold::ScaffoldStep {
                label:  "Created project files".to_string(),
                status: "ok".to_string(),
                detail: None,
            });
        }
        Err(e) => {
            project_init::emit_progress(&app, "files", "Creating project files", "error");
            return Err(e);
        }
    }

    // 2. Write markdown docs + Claude skills (before git, included in initial commit)
    let init_req = ProjectInitRequest {
        name:                 project_name.clone(),
        description:          description.clone(),
        project_type:         "web_app".to_string(),
        main_goal:            main_goal.clone(),
        starter_template:     "next-supabase".to_string(),
        add_ons:              vec![],
        constraints:          String::new(),
        coding_style:         String::new(),
        ui_style:             String::new(),
        create_git_repo:      false,
        create_claude_skills,
        template_mode:        project_level.clone(),
    };
    let doc_files = project_init::write_docs_and_skills(&project_dir, &init_req, &app, claude_md_template)?;
    files_created.extend(doc_files);

    // 3. Git init — commits scaffold files + docs + skills together
    project_init::emit_progress(&app, "git", "Initialising git repo", "running");
    let git_step = scaffold::run_git_init(&project_dir, &path_env);
    let git_ok = git_step.status == "ok";
    project_init::emit_progress(
        &app,
        "git",
        "Initialising git repo",
        if git_ok { "done" } else { "error" },
    );
    scaffold_steps.push(git_step);

    // 4. GitHub
    if create_github {
        project_init::emit_progress(&app, "github", "Creating GitHub repo", "running");
        let (step, url) = scaffold::create_github_repo(&project_dir, &slug, &path_env);
        let ok = step.status == "ok";
        project_init::emit_progress(
            &app,
            "github",
            "Creating GitHub repo",
            if ok { "done" } else { "error" },
        );
        github_url = url;
        scaffold_steps.push(step);
    }

    // 5. Vercel
    if create_vercel {
        project_init::emit_progress(&app, "vercel", "Creating Vercel project", "running");
        let (step, url) = scaffold::create_vercel_project(&project_name, &slug, &vercel_token);
        let ok = step.status == "ok";
        project_init::emit_progress(
            &app,
            "vercel",
            "Creating Vercel project",
            if ok { "done" } else { "error" },
        );
        vercel_url = url;
        scaffold_steps.push(step);
    }

    // 6. Supabase
    if create_supabase {
        project_init::emit_progress(&app, "supabase", "Creating Supabase project", "running");
        let (step, id, pass) =
            scaffold::create_supabase_project(&project_name, &slug, &supabase_org_id, &supabase_token);
        let ok = step.status == "ok";
        project_init::emit_progress(
            &app,
            "supabase",
            "Creating Supabase project",
            if ok { "done" } else { "error" },
        );
        supabase_id = id;
        supabase_pass = pass;
        scaffold_steps.push(step);
    }

    // 7. Save to DB
    project_init::emit_progress(&app, "database", "Saving to database", "running");
    let goal_note = if main_goal.trim().is_empty() {
        String::new()
    } else {
        format!("Goal: {}", main_goal)
    };
    let create = CreateProject {
        name:                  project_name.clone(),
        description:           description.clone(),
        local_repo_path:       project_path.clone(),
        status:                "active".to_string(),
        phase:                 "planning".to_string(),
        priority:              "medium".to_string(),
        ai_tool:               "claude".to_string(),
        current_task:          String::new(),
        next_task:             String::new(),
        blocker:               String::new(),
        notes:                 goal_note,
        claude_startup_prompt: String::new(),
        claude_prompt_mode:    "append".to_string(),
        claude_priority_files: String::new(),
        session_handoff_notes: String::new(),
        startup_command:       String::new(),
        preferred_terminal:    String::new(),
    };
    let project = {
        let conn = db_conn!(state);
        db::insert_project(&conn, create).map_err(|e| {
            project_init::emit_progress(&app, "database", "Saving to database", "error");
            e.to_string()
        })?
    };
    project_init::emit_progress(&app, "database", "Saving to database", "done");

    Ok(FullScaffoldResult {
        project_id:           project.id,
        project_path,
        files_created,
        github_url,
        vercel_project_url:   vercel_url,
        supabase_project_id:  supabase_id,
        supabase_db_password: supabase_pass,
        scaffold_steps,
    })
}

// ── Scaffold from GitHub template ─────────────────────────────────────────────

/// Create a new project by cloning from a GitHub template repo, then applying
/// per-project customisation (token substitution + docs/skills), committing,
/// and pushing.  Vercel and Supabase provisioning are optional extras.
///
/// Requires `scaffold_template_repo` to be set in Settings (e.g. "org/repo").
/// The new GitHub repo is created under the same owner as the template repo.
#[tauri::command]
pub fn scaffold_from_github_template(
    project_name: String,
    description: String,
    main_goal: String,
    create_vercel: bool,
    create_supabase: bool,
    create_claude_skills: bool,
    project_level: String, // "bare_bones" | "standard" | "fuller"
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<FullScaffoldResult, String> {
    let (projects_dir, template_repo, vercel_token, supabase_token, supabase_org_id, claude_md_template) = {
        let conn = db_conn!(state);
        (
            db::get_setting(&conn, "projects_dir").map_err(|e| e.to_string())?,
            db::get_setting(&conn, "scaffold_template_repo").map_err(|e| e.to_string())?,
            db::get_setting(&conn, "vercel_token").map_err(|e| e.to_string())?,
            db::get_setting(&conn, "supabase_access_token").map_err(|e| e.to_string())?,
            db::get_setting(&conn, "supabase_org_id").map_err(|e| e.to_string())?,
            db::get_setting(&conn, "claude_md_template").ok().filter(|s| !s.trim().is_empty()),
        )
    };

    if projects_dir.is_empty() {
        return Err("No default projects directory configured. Set one in Settings.".to_string());
    }
    if template_repo.is_empty() {
        return Err("No template repository configured. Set one in Settings.".to_string());
    }

    let path_env = augmented_path();
    let slug = scaffold::to_slug(&project_name);
    if slug.is_empty() {
        return Err("Project name produces an empty slug".to_string());
    }
    let expanded_base = projects_dir.replace('~', &std::env::var("HOME").unwrap_or_default());
    let projects_path = std::path::Path::new(&expanded_base);
    let project_dir  = projects_path.join(&slug);
    let project_path = project_dir.to_string_lossy().to_string();

    // Derive new repo owner from the template repo (e.g. "org/template" → "org/slug")
    let new_repo_name = match template_repo.split_once('/') {
        Some((owner, _)) => format!("{}/{}", owner, slug),
        None             => slug.clone(),
    };

    let mut scaffold_steps: Vec<scaffold::ScaffoldStep> = Vec::new();
    let mut files_created: Vec<String> = Vec::new();
    let github_url: Option<String>;
    let mut vercel_url: Option<String> = None;
    let mut supabase_id: Option<String> = None;
    let mut supabase_pass: Option<String> = None;

    // 1. Clone from template (creates GitHub repo + local clone in one step)
    project_init::emit_progress(&app, "files", "Cloning from template", "running");
    let clone_out = std::process::Command::new("gh")
        .args([
            "repo", "create", &new_repo_name,
            "--template", &template_repo,
            "--private",
            "--clone",
        ])
        .current_dir(projects_path)
        .env("PATH", &path_env)
        .output();

    match clone_out {
        Err(e) => {
            project_init::emit_progress(&app, "files", "Cloning from template", "error");
            return Err(format!("gh CLI not found: {e}"));
        }
        Ok(o) if !o.status.success() => {
            project_init::emit_progress(&app, "files", "Cloning from template", "error");
            return Err(String::from_utf8_lossy(&o.stderr).into_owned());
        }
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).into_owned();
            github_url = stdout.lines()
                .find(|l| l.contains("github.com"))
                .map(|l| l.trim().to_string());
            let detail = github_url.clone().unwrap_or_else(|| new_repo_name.clone());
            project_init::emit_progress(&app, "files", "Cloning from template", "done");
            scaffold_steps.push(scaffold::ScaffoldStep {
                label:  "Cloned from template".to_string(),
                status: "ok".to_string(),
                detail: Some(detail),
            });
        }
    }

    // 2. Substitute project tokens in the 4 token-bearing template files
    if let Err(e) = scaffold::apply_project_customization(&project_dir, &project_name, &slug, &description) {
        return Err(format!("Token substitution failed: {e}"));
    }
    scaffold_steps.push(scaffold::ScaffoldStep {
        label:  "Applied project customisation".to_string(),
        status: "ok".to_string(),
        detail: None,
    });

    // 3. Write markdown docs + Claude skills
    let init_req = ProjectInitRequest {
        name:                 project_name.clone(),
        description:          description.clone(),
        project_type:         "web_app".to_string(),
        main_goal:            main_goal.clone(),
        starter_template:     "next-supabase".to_string(),
        add_ons:              vec![],
        constraints:          String::new(),
        coding_style:         String::new(),
        ui_style:             String::new(),
        create_git_repo:      false,
        create_claude_skills,
        template_mode:        project_level,
    };
    let doc_files = project_init::write_docs_and_skills(&project_dir, &init_req, &app, claude_md_template)?;
    files_created.extend(doc_files);

    // 4. Commit customisations and push to the newly created GitHub repo
    project_init::emit_progress(&app, "git", "Committing and pushing", "running");
    let git_step = scaffold::commit_and_push(&project_dir, &path_env);
    let git_ok   = git_step.status == "ok";
    project_init::emit_progress(
        &app, "git", "Committing and pushing",
        if git_ok { "done" } else { "error" },
    );
    scaffold_steps.push(git_step);

    // 5. Vercel
    if create_vercel {
        project_init::emit_progress(&app, "vercel", "Creating Vercel project", "running");
        if vercel_token.is_empty() {
            project_init::emit_progress(&app, "vercel", "Creating Vercel project", "error");
            scaffold_steps.push(scaffold::ScaffoldStep {
                label: "Vercel project".to_string(), status: "skipped".to_string(),
                detail: Some("no token in Settings".to_string()),
            });
        } else {
            let (step, url) = scaffold::create_vercel_project(&project_name, &slug, &vercel_token);
            let ok = step.status == "ok";
            project_init::emit_progress(&app, "vercel", "Creating Vercel project", if ok { "done" } else { "error" });
            vercel_url = url;
            scaffold_steps.push(step);
        }
    }

    // 6. Supabase
    if create_supabase {
        project_init::emit_progress(&app, "supabase", "Creating Supabase project", "running");
        if supabase_token.is_empty() || supabase_org_id.is_empty() {
            project_init::emit_progress(&app, "supabase", "Creating Supabase project", "error");
            scaffold_steps.push(scaffold::ScaffoldStep {
                label: "Supabase project".to_string(), status: "skipped".to_string(),
                detail: Some("token or org ID missing in Settings".to_string()),
            });
        } else {
            let (step, id, pass) =
                scaffold::create_supabase_project(&project_name, &slug, &supabase_org_id, &supabase_token);
            let ok = step.status == "ok";
            project_init::emit_progress(&app, "supabase", "Creating Supabase project", if ok { "done" } else { "error" });
            supabase_id = id;
            supabase_pass = pass;
            scaffold_steps.push(step);
        }
    }

    // 7. Save to DB
    project_init::emit_progress(&app, "database", "Saving to database", "running");
    let goal_note = if main_goal.trim().is_empty() {
        String::new()
    } else {
        format!("Goal: {}", main_goal)
    };
    let create = CreateProject {
        name:                  project_name.clone(),
        description:           description.clone(),
        local_repo_path:       project_path.clone(),
        status:                "active".to_string(),
        phase:                 "planning".to_string(),
        priority:              "medium".to_string(),
        ai_tool:               "claude".to_string(),
        current_task:          String::new(),
        next_task:             String::new(),
        blocker:               String::new(),
        notes:                 goal_note,
        claude_startup_prompt: String::new(),
        claude_prompt_mode:    "append".to_string(),
        claude_priority_files: String::new(),
        session_handoff_notes: String::new(),
        startup_command:       String::new(),
        preferred_terminal:    String::new(),
    };
    let project = {
        let conn = db_conn!(state);
        db::insert_project(&conn, create).map_err(|e| {
            project_init::emit_progress(&app, "database", "Saving to database", "error");
            e.to_string()
        })?
    };
    project_init::emit_progress(&app, "database", "Saving to database", "done");

    Ok(FullScaffoldResult {
        project_id:           project.id,
        project_path,
        files_created,
        github_url,
        vercel_project_url:   vercel_url,
        supabase_project_id:  supabase_id,
        supabase_db_password: supabase_pass,
        scaffold_steps,
    })
}

// ── Audits ─────────────────────────────────────────────────────────────────────

/// Assemble a codebase audit prompt for the project and return it (+ any warnings).
/// audit_kind: "full_codebase" | "security" | "performance" | "reliability"
/// audit_depth: "quick" | "full"
#[tauri::command]
pub fn assemble_audit_prompt(
    project_id: i64,
    audit_kind: String,
    audit_depth: String,
    state: State<'_, AppState>,
) -> Result<db::AssembledPrompt, String> {
    let conn = db_conn!(state);
    db::assemble_audit_prompt(&conn, project_id, &audit_kind, &audit_depth).map_err(|e| e.to_string())
}

/// Assemble the audit prompt and pipe it to `claude --print`, returning the raw response.
/// The DB lock is held only briefly (prompt assembly), then released before the slow CLI call.
#[tauri::command]
pub fn run_audit_with_claude_cli(
    project_id: i64,
    audit_kind: String,
    audit_depth: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Assemble under a short-lived lock
    let prompt = {
        let conn = db_conn!(state);
        db::assemble_audit_prompt(&conn, project_id, &audit_kind, &audit_depth)
            .map_err(|e| e.to_string())?
            .prompt
    };

    let path = augmented_path();
    let candidates = [
        "claude",
        "/usr/local/bin/claude",
        "/opt/homebrew/bin/claude",
        "/usr/bin/claude",
    ];

    let mut last_err = String::new();
    for candidate in &candidates {
        match Command::new(candidate)
            .arg("--print")
            .env("PATH", &path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(mut child) => {
                if let Some(stdin) = child.stdin.as_mut() {
                    stdin
                        .write_all(prompt.as_bytes())
                        .map_err(|e| e.to_string())?;
                }
                let out = child.wait_with_output().map_err(|e| e.to_string())?;
                if out.status.success() {
                    return Ok(String::from_utf8_lossy(&out.stdout).into_owned());
                }
                return Err(format!(
                    "Claude CLI exited with an error:\n{}",
                    String::from_utf8_lossy(&out.stderr)
                ));
            }
            Err(e) => last_err = e.to_string(),
        }
    }

    Err(format!(
        "Claude CLI not found. Install it with:\n  npm install -g @anthropic-ai/claude-code\n\n({last_err})"
    ))
}

/// Parse a raw Claude audit response and store it in the database.
/// Returns the new audit's id and the count of findings stored.
#[tauri::command]
pub fn store_audit_result(
    project_id: i64,
    audit_kind: String,
    audit_depth: String,
    raw_output: String,
    state: State<'_, AppState>,
) -> Result<db::AuditStoredResult, String> {
    let mut conn = db_conn!(state);
    db::parse_and_store_audit(&mut conn, project_id, &audit_kind, &audit_depth, &raw_output)
}

/// Return all audit records for a project, newest first. Findings are not included.
#[tauri::command]
pub fn get_project_audits(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<db::AuditRecord>, String> {
    let conn = db_conn!(state);
    db::fetch_project_audits(&conn, project_id).map_err(|e| e.to_string())
}

/// Return a single audit record and all its findings.
#[tauri::command]
pub fn get_audit_detail(
    audit_id: i64,
    state: State<'_, AppState>,
) -> Result<Option<db::AuditWithFindings>, String> {
    let conn = db_conn!(state);
    db::fetch_audit_with_findings(&conn, audit_id).map_err(|e| e.to_string())
}

/// Update the resolution status of a single finding.
#[tauri::command]
pub fn update_finding_status(
    finding_id: i64,
    project_id: i64,
    status: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = db_conn!(state);
    db::update_finding_status(&conn, finding_id, project_id, &status)
}

/// Create a project task from an audit finding and link them together.
/// Returns the new task id.
#[tauri::command]
pub fn create_task_from_finding(
    finding_id: i64,
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let mut conn = db_conn!(state);
    db::create_task_from_finding(&mut conn, finding_id, project_id)
}

// ── Update check ───────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct UpdateInfo {
    pub version:     String,
    pub released:    String,
    pub notes:       Option<String>,
    pub folder_path: String,
}

/// Parse a semver string "x.y.z" into a comparable tuple.
fn parse_semver(v: &str) -> (u32, u32, u32) {
    let mut parts = v.split('.');
    let major = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let minor = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let patch = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    (major, minor, patch)
}

/// Read version.json from the configured update folder and return info if a
/// newer version is available. Returns null if no folder is configured, the
/// file doesn't exist, or the current version is already up to date.
#[tauri::command]
pub fn check_for_update(state: State<'_, AppState>) -> Result<Option<UpdateInfo>, String> {
    let folder = {
        let conn = db_conn!(state);
        db::get_setting(&conn, "update_folder_path").unwrap_or_default()
    };

    if folder.trim().is_empty() {
        return Ok(None);
    }

    let expanded = folder.replace('~', &std::env::var("HOME").unwrap_or_default());
    let version_path = std::path::PathBuf::from(&expanded).join("version.json");

    if !version_path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&version_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid version.json: {e}"))?;

    let remote_version = json["version"].as_str().unwrap_or("").to_string();
    let released       = json["released"].as_str().unwrap_or("").to_string();
    let notes          = json["notes"].as_str().map(|s| s.to_string());

    if remote_version.is_empty() {
        return Ok(None);
    }

    let current = env!("CARGO_PKG_VERSION");
    if parse_semver(&remote_version) > parse_semver(current) {
        Ok(Some(UpdateInfo { version: remote_version, released, notes, folder_path: expanded }))
    } else {
        Ok(None)
    }
}

// ── Skills library ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SkillEntry {
    pub category: String,
    pub name:     String,
    pub path:     String,
}

const SKILL_CATEGORIES: &[&str] = &[
    "business-growth",
    "c-level-advisor",
    "engineering",
    "engineering-team",
    "finance",
    "marketing-skill",
    "product-team",
    "project-management",
];

/// Fetch the skills index from the alirezarezvani/claude-skills GitHub repo.
/// Returns only entries whose category is in the whitelist.
#[tauri::command]
pub fn fetch_skills_index() -> Result<Vec<SkillEntry>, String> {
    let resp = ureq::get(
        "https://api.github.com/repos/alirezarezvani/claude-skills/git/trees/main?recursive=1",
    )
    .set("User-Agent", "Launchpad-App")
    .call()
    .map_err(|e| e.to_string())?;

    let json: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;

    let tree = json["tree"]
        .as_array()
        .ok_or_else(|| "No tree in response".to_string())?;

    let mut skills = Vec::new();
    for entry in tree {
        if entry["type"].as_str() != Some("blob") {
            continue;
        }
        let path = match entry["path"].as_str() {
            Some(p) => p,
            None => continue,
        };
        // Must match exactly {category}/{name}/SKILL.md
        let parts: Vec<&str> = path.splitn(3, '/').collect();
        if parts.len() != 3 || parts[2] != "SKILL.md" {
            continue;
        }
        let category = parts[0];
        let name = parts[1];
        if !SKILL_CATEGORIES.contains(&category) {
            continue;
        }
        skills.push(SkillEntry {
            category: category.to_string(),
            name:     name.to_string(),
            path:     path.to_string(),
        });
    }

    Ok(skills)
}

/// Fetch the raw SKILL.md content for a given path.
#[tauri::command]
pub fn fetch_skill_content(path: String) -> Result<String, String> {
    let url = format!(
        "https://raw.githubusercontent.com/alirezarezvani/claude-skills/main/{}",
        path
    );
    let resp = ureq::get(&url)
        .set("User-Agent", "Launchpad-App")
        .call()
        .map_err(|e| e.to_string())?;
    resp.into_string().map_err(|e| e.to_string())
}

/// Return list of skill directory names in {repo}/.claude/skills/
#[tauri::command]
pub fn get_installed_skills(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let repo_path = {
        let conn = db_conn!(state);
        let project = db::fetch_project(&conn, project_id).map_err(|e| e.to_string())?;
        project.local_repo_path
    };

    if repo_path.trim().is_empty() {
        return Ok(vec![]);
    }

    let expanded = repo_path.replace('~', &std::env::var("HOME").unwrap_or_default());
    let skills_dir = std::path::PathBuf::from(&expanded)
        .join(".claude")
        .join("skills");

    if !skills_dir.exists() {
        return Ok(vec![]);
    }

    let mut names = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                if let Some(name) = entry.file_name().to_str() {
                    names.push(name.to_string());
                }
            }
        }
    }
    Ok(names)
}

/// A safe skill name contains only characters that are safe as a single
/// directory component.  Rejects empty strings, absolute paths, traversal
/// components, and null bytes — all of which would cause `PathBuf::join` to
/// escape the intended `.claude/skills/` directory.
fn is_safe_skill_name(name: &str) -> bool {
    !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains('\0')
}

/// Write a skill to {repo}/.claude/skills/{skill_name}/SKILL.md and
/// update the project's CLAUDE.md skills table.
#[tauri::command]
pub fn install_skill(
    project_id: i64,
    skill_name: String,
    category: String,
    content: String,
    description: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let _ = category; // stored on disk in the path hierarchy; not needed here

    if !is_safe_skill_name(&skill_name) {
        return Err(format!("Invalid skill name: {skill_name:?}"));
    }

    let repo_path = {
        let conn = db_conn!(state);
        let project = db::fetch_project(&conn, project_id).map_err(|e| e.to_string())?;
        project.local_repo_path
    };

    if repo_path.trim().is_empty() {
        return Err("No repository path configured for this project.".to_string());
    }

    let expanded = repo_path.replace('~', &std::env::var("HOME").unwrap_or_default());
    let base = std::path::PathBuf::from(&expanded);

    // Write SKILL.md
    let skill_dir = base.join(".claude").join("skills").join(&skill_name);
    std::fs::create_dir_all(&skill_dir).map_err(|e| e.to_string())?;
    std::fs::write(skill_dir.join("SKILL.md"), &content).map_err(|e| e.to_string())?;

    // Update CLAUDE.md
    let claude_md_path = base.join("CLAUDE.md");
    let existing = if claude_md_path.exists() {
        std::fs::read_to_string(&claude_md_path).map_err(|e| e.to_string())?
    } else {
        String::new()
    };
    let updated = update_claude_md_skills(&existing, &skill_name, &description);
    std::fs::write(&claude_md_path, updated).map_err(|e| e.to_string())?;

    Ok(())
}

/// Pure helper: insert or update a skill row in the CLAUDE.md skills table.
fn update_claude_md_skills(text: &str, skill_name: &str, description: &str) -> String {
    let row = format!("| `{}` | {} |", skill_name, description);
    let skill_header = "### Skills in this project";
    let when_to_use_header = "## When to use skills";
    let needle = format!("`{}`", skill_name);

    if text.contains(skill_header) {
        let lines: Vec<&str> = text.lines().collect();
        let trailing_newline = text.ends_with('\n');

        if text.contains(&needle) {
            // Update existing row in place
            let result: Vec<&str> = lines
                .iter()
                .map(|l| {
                    if l.contains(&needle) && l.starts_with('|') {
                        row.as_str()
                    } else {
                        l
                    }
                })
                .collect();
            return result.join("\n") + if trailing_newline { "\n" } else { "" };
        }

        // Find last table row inside this section and insert after it
        let mut last_table_idx = 0;
        let mut found_header = false;
        for (i, line) in lines.iter().enumerate() {
            if line.trim() == skill_header {
                found_header = true;
                continue;
            }
            if found_header {
                if line.starts_with("## ") {
                    break; // next section
                }
                if line.starts_with('|') {
                    last_table_idx = i;
                }
            }
        }
        let _ = found_header;
        let mut result = lines.to_vec();
        result.insert(last_table_idx + 1, row.as_str());
        return result.join("\n") + if trailing_newline { "\n" } else { "" };
    }

    // No skills table yet — build the new section
    let new_section = format!(
        "\n### Skills in this project\n\n| Skill | When to use it |\n|-------|----------------|\n{}\n",
        row
    );

    if text.contains(when_to_use_header) {
        let lines: Vec<&str> = text.lines().collect();
        let trailing_newline = text.ends_with('\n');

        // Find the last line of the "When to use skills" section
        let mut insert_after = lines.len().saturating_sub(1);
        let mut in_section = false;
        for (i, line) in lines.iter().enumerate() {
            if line.trim() == when_to_use_header {
                in_section = true;
                continue;
            }
            if in_section {
                if line.starts_with("## ") {
                    insert_after = i.saturating_sub(1);
                    break;
                }
                insert_after = i;
            }
        }
        let mut result = lines.to_vec();
        // Insert the section header + table as individual lines after insert_after
        let new_lines: Vec<&str> = new_section.lines().collect();
        for (offset, new_line) in new_lines.iter().enumerate() {
            result.insert(insert_after + 1 + offset, new_line);
        }
        return result.join("\n") + if trailing_newline { "\n" } else { "" };
    }

    // Append to end of file
    let mut result = text.to_string();
    if !result.ends_with('\n') {
        result.push('\n');
    }
    result.push_str(&new_section);
    result
}

/// Write version.json for the current app version to the configured update folder.
/// Returns the path written to.
#[tauri::command]
pub fn publish_current_version(
    notes: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let (folder, today) = {
        let conn = db_conn!(state);
        let folder = db::get_setting(&conn, "update_folder_path").unwrap_or_default();
        let today  = conn
            .query_row("SELECT date('now')", [], |r| r.get::<_, String>(0))
            .unwrap_or_else(|_| "unknown".to_string());
        (folder, today)
    };

    if folder.trim().is_empty() {
        return Err("No update folder configured in Settings.".to_string());
    }

    let expanded    = folder.replace('~', &std::env::var("HOME").unwrap_or_default());
    let folder_path = std::path::PathBuf::from(&expanded);

    if !folder_path.exists() {
        return Err(format!("Folder does not exist: {}", folder_path.display()));
    }

    let version = env!("CARGO_PKG_VERSION");
    let notes_value = if notes.trim().is_empty() {
        serde_json::Value::Null
    } else {
        serde_json::Value::String(notes.trim().to_string())
    };

    let payload = serde_json::json!({
        "version":  version,
        "released": today,
        "notes":    notes_value,
    });

    let content = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    let out_path = folder_path.join("version.json");
    std::fs::write(&out_path, content).map_err(|e| e.to_string())?;

    Ok(out_path.to_string_lossy().to_string())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── is_safe_skill_name ────────────────────────────────────────────────────

    #[test]
    fn safe_name_accepts_kebab_case() {
        assert!(is_safe_skill_name("code-review"));
        assert!(is_safe_skill_name("feature-chunking"));
        assert!(is_safe_skill_name("ui-readability"));
    }

    #[test]
    fn safe_name_rejects_empty() {
        assert!(!is_safe_skill_name(""));
    }

    #[test]
    fn safe_name_rejects_traversal() {
        assert!(!is_safe_skill_name(".."));
        assert!(!is_safe_skill_name("."));
        assert!(!is_safe_skill_name("../etc"));
        assert!(!is_safe_skill_name("foo/bar"));
    }

    #[test]
    fn safe_name_rejects_absolute_path() {
        // PathBuf::join replaces the base if the component is absolute —
        // this would escape the .claude/skills/ directory entirely.
        assert!(!is_safe_skill_name("/etc/passwd"));
        assert!(!is_safe_skill_name("/"));
    }

    #[test]
    fn safe_name_rejects_null_byte() {
        assert!(!is_safe_skill_name("foo\0bar"));
    }

    // ── update_claude_md_skills ───────────────────────────────────────────────

    /// Empty document: full section created at end.
    #[test]
    fn claude_md_empty_document() {
        let result = update_claude_md_skills("", "my-skill", "Use when testing");
        assert!(result.contains("### Skills in this project"));
        assert!(result.contains("| Skill | When to use it |"));
        assert!(result.contains("| `my-skill` | Use when testing |"));
    }

    /// Document with no skills-related section at all: section appended.
    #[test]
    fn claude_md_no_skills_section() {
        let text = "# My Project\n\nSome content.\n";
        let result = update_claude_md_skills(text, "my-skill", "Use when testing");
        // Original content preserved
        assert!(result.starts_with("# My Project"));
        // New section appended after existing content
        assert!(result.contains("### Skills in this project"));
        assert!(result.contains("| `my-skill` | Use when testing |"));
        // Section comes after original content
        let content_pos = result.find("Some content.").unwrap();
        let header_pos  = result.find("### Skills in this project").unwrap();
        assert!(header_pos > content_pos);
    }

    /// `## When to use skills` present but no `### Skills in this project` table yet.
    /// New section must be inserted inside the When-to-use-skills section,
    /// before the next `##` heading.
    #[test]
    fn claude_md_when_to_use_section_no_table() {
        let text = concat!(
            "## When to use skills\n\n",
            "Use skills when the task calls for it.\n\n",
            "## Working principles\n\n",
            "Be clear.\n",
        );
        let result = update_claude_md_skills(text, "my-skill", "Use when testing");
        assert!(result.contains("### Skills in this project"));
        assert!(result.contains("| `my-skill` | Use when testing |"));
        // Skills section must appear between When to use skills and Working principles
        let when_pos       = result.find("## When to use skills").unwrap();
        let skills_pos     = result.find("### Skills in this project").unwrap();
        let principles_pos = result.find("## Working principles").unwrap();
        assert!(when_pos < skills_pos, "skills header should come after when-to-use");
        assert!(skills_pos < principles_pos, "skills header should come before working principles");
    }

    /// Existing `### Skills in this project` table: new row appended after last row.
    #[test]
    fn claude_md_existing_table_appends_row() {
        let text = concat!(
            "## When to use skills\n\n",
            "Use skills when...\n\n",
            "### Skills in this project\n\n",
            "| Skill | When to use it |\n",
            "|-------|----------------|\n",
            "| `existing-skill` | Do X |\n\n",
            "## Working principles\n",
        );
        let result = update_claude_md_skills(text, "new-skill", "Use when new");
        assert!(result.contains("| `existing-skill` | Do X |"));
        assert!(result.contains("| `new-skill` | Use when new |"));
        // New row must come after existing row
        let existing_pos = result.find("| `existing-skill`").unwrap();
        let new_pos      = result.find("| `new-skill`").unwrap();
        assert!(new_pos > existing_pos, "new row should follow existing row");
        // Existing row must not be duplicated
        assert_eq!(result.matches("`existing-skill`").count(), 1);
    }

    /// Duplicate install: description updated in place, no duplicate row.
    #[test]
    fn claude_md_duplicate_updates_in_place() {
        let text = concat!(
            "### Skills in this project\n\n",
            "| Skill | When to use it |\n",
            "|-------|----------------|\n",
            "| `my-skill` | Old description |\n",
            "| `other-skill` | Do Y |\n",
        );
        let result = update_claude_md_skills(text, "my-skill", "New description");
        assert!(result.contains("| `my-skill` | New description |"));
        assert!(!result.contains("Old description"));
        assert!(result.contains("| `other-skill` | Do Y |"));
        // Exactly one occurrence of the skill name
        assert_eq!(result.matches("`my-skill`").count(), 1);
    }
}
