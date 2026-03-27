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

/// Open VS Code at the given path and launch `claude` in its integrated terminal.
/// Uses the `code` CLI to open the folder, then AppleScript to open the
/// integrated terminal (Ctrl+`) and run `claude`.
#[tauri::command]
pub fn run_claude_in_vscode(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }

    // Try to open VS Code via the `code` CLI so we know the exact process name.
    let cli_candidates = [
        "/usr/local/bin/code",
        "/opt/homebrew/bin/code",
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
    ];
    let mut opened = false;
    for candidate in &cli_candidates {
        if Path::new(candidate).exists() {
            if Command::new(candidate).arg(&path).spawn().is_ok() {
                opened = true;
                break;
            }
        }
    }
    if !opened {
        // Fallback: plain `which code` — fast, no login shell.
        if let Ok(out) = Command::new("which").arg("code").output() {
            let bin = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !bin.is_empty() && Command::new(&bin).arg(&path).spawn().is_ok() {
                opened = true;
            }
        }
    }
    if !opened {
        return Err(
            "VS Code CLI (code) not found. Install it via VS Code: Cmd+Shift+P → \
             'Shell Command: Install code command in PATH'."
                .to_string(),
        );
    }

    // AppleScript: activate VS Code, wait for it to finish loading, then open
    // the integrated terminal and type `claude`.
    let script = "\
tell application \"Visual Studio Code\" to activate\n\
delay 2\n\
tell application \"System Events\"\n\
    tell process \"Code\"\n\
        keystroke \"`\" using control down\n\
        delay 0.8\n\
        keystroke \"claude\"\n\
        key code 36\n\
    end tell\n\
end tell";
    Command::new("osascript")
        .arg("-e")
        .arg(script)
        .spawn()
        .map_err(|e| e.to_string())?;
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
    let conn = state.db.lock().map_err(|e| e.to_string())?;
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
/// without opening a terminal. Returns the prompt text.
#[tauri::command]
pub fn copy_bootstrap_prompt(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let project = db::fetch_project(&conn, project_id).map_err(|e| e.to_string())?;
    let prompt = compose_bootstrap_prompt(&project);
    copy_to_clipboard_pbcopy(&prompt);
    Ok(prompt)
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

// ── Planning: Documents ───────────────────────────────────────────────────────

#[tauri::command]
pub fn get_project_documents(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<ProjectDocument>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::fetch_project_documents(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_project_document(
    project_id: i64,
    doc_type: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<ProjectDocument, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
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
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_document_status(&conn, project_id, &doc_type, &status)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn regenerate_scaffold(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<ProjectDocument>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::regenerate_scaffold(&conn, project_id).map_err(|e| e.to_string())
}

// ── Planning: Methodology blocks ──────────────────────────────────────────────

#[tauri::command]
pub fn get_methodology_blocks(
    state: State<'_, AppState>,
) -> Result<Vec<MethodologyBlock>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::fetch_methodology_blocks(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_methodology_block(
    slug: String,
    content: String,
    is_active: bool,
    state: State<'_, AppState>,
) -> Result<MethodologyBlock, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_methodology_block(&conn, &slug, &content, is_active)
        .map_err(|e| e.to_string())
}

// ── Planning: Prompt assembly & plan import ───────────────────────────────────

/// Assemble the planning prompt for a project, copy it to the clipboard,
/// and return the prompt text + any warnings.
#[tauri::command]
pub fn assemble_planning_prompt(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<AssembledPrompt, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let assembled = db::assemble_prompt(&conn, project_id).map_err(|e| e.to_string())?;
    copy_to_clipboard_pbcopy(&assembled.prompt);
    Ok(assembled)
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
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    db::import_plan(&mut conn, project_id, &prompt_sent, &raw_response)
        .map_err(|e| e.to_string())
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
        let conn = state.db.lock().map_err(|e| e.to_string())?;
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
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::fetch_project_plan(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_task_status(
    task_id: i64,
    status: String,
    state: State<'_, AppState>,
) -> Result<ProjectTask, String> {
    let valid = ["pending", "in_progress", "paused", "blocked", "done", "skipped"];
    if !valid.contains(&status.as_str()) {
        return Err(format!("Invalid task status: {status}"));
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_task_status_record(&conn, task_id, &status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_task_progress_note(
    task_id: i64,
    note: String,
    state: State<'_, AppState>,
) -> Result<ProjectTask, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_task_progress_note_record(&conn, task_id, &note).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_phase_status(
    phase_id: i64,
    status: String,
    state: State<'_, AppState>,
) -> Result<ProjectPhase, String> {
    let valid = ["pending", "in_progress", "done", "skipped"];
    if !valid.contains(&status.as_str()) {
        return Err(format!("Invalid phase status: {status}"));
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_phase_status_record(&conn, phase_id, &status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ai_plan_runs(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<AiPlanRun>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::fetch_ai_plan_runs(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_in_progress_tasks(state: State<'_, AppState>) -> Result<Vec<InProgressTask>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
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
    let conn = state.db.lock().map_err(|e| e.to_string())?;
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
        let conn = state.db.lock().map_err(|e| e.to_string())?;
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
        let conn = state.db.lock().map_err(|e| e.to_string())?;
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
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::clear_project_session_id(&conn, project_id).map_err(|e| e.to_string())
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
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::get_all_settings(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_setting(
    key: String,
    value: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let allowed = ["projects_dir", "vercel_token", "supabase_access_token", "supabase_org_id"];
    if !allowed.contains(&key.as_str()) {
        return Err(format!("Unknown setting key: {key}"));
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
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
        let conn = state.db.lock().map_err(|e| e.to_string())?;
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
