use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

use crate::git::GitStatus;

// ── Data models ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub local_repo_path: String,
    pub status: String,
    pub phase: String,
    pub priority: String,
    pub ai_tool: String,
    pub current_task: String,
    pub next_task: String,
    pub blocker: String,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_scanned_at: Option<String>,
    #[serde(default)]
    pub claude_startup_prompt: String,
    #[serde(default)]
    pub claude_prompt_mode: String,
    #[serde(default)]
    pub claude_priority_files: String,
    #[serde(default)]
    pub session_handoff_notes: String,
    #[serde(default)]
    pub startup_command: String,
    #[serde(default)]
    pub preferred_terminal: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectScan {
    pub id: i64,
    pub project_id: i64,
    pub scanned_at: String,
    pub current_branch: Option<String>,
    pub is_dirty: bool,
    pub changed_files_count: i64,
    pub untracked_files_count: i64,
    pub staged_files_count: i64,
    pub last_commit_hash: Option<String>,
    pub last_commit_date: Option<String>,
    pub last_commit_message: Option<String>,
    pub ahead_count: Option<i64>,
    pub behind_count: Option<i64>,
    pub is_valid_repo: bool,
    pub error_message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProject {
    pub name: String,
    pub description: String,
    pub local_repo_path: String,
    pub status: String,
    pub phase: String,
    pub priority: String,
    pub ai_tool: String,
    pub current_task: String,
    pub next_task: String,
    pub blocker: String,
    pub notes: String,
    pub claude_startup_prompt: String,
    pub claude_prompt_mode: String,
    pub claude_priority_files: String,
    pub session_handoff_notes: String,
    pub startup_command: String,
    pub preferred_terminal: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProject {
    pub name: String,
    pub description: String,
    pub local_repo_path: String,
    pub status: String,
    pub phase: String,
    pub priority: String,
    pub ai_tool: String,
    pub current_task: String,
    pub next_task: String,
    pub blocker: String,
    pub notes: String,
    pub claude_startup_prompt: String,
    pub claude_prompt_mode: String,
    pub claude_priority_files: String,
    pub session_handoff_notes: String,
    pub startup_command: String,
    pub preferred_terminal: String,
}

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub total: i64,
    pub active: i64,
    pub blocked: i64,
    pub paused: i64,
    pub done: i64,
    pub stale: i64,
    pub dirty_repos: i64,
}

// ── Schema ────────────────────────────────────────────────────────────────────

const SCHEMA: &str = "
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS projects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    description     TEXT    NOT NULL DEFAULT '',
    local_repo_path TEXT    NOT NULL DEFAULT '',
    status          TEXT    NOT NULL DEFAULT 'active',
    phase           TEXT    NOT NULL DEFAULT 'idea',
    priority        TEXT    NOT NULL DEFAULT 'medium',
    ai_tool         TEXT    NOT NULL DEFAULT 'claude',
    current_task    TEXT    NOT NULL DEFAULT '',
    next_task       TEXT    NOT NULL DEFAULT '',
    blocker         TEXT    NOT NULL DEFAULT '',
    notes           TEXT    NOT NULL DEFAULT '',
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    last_scanned_at TEXT
);

CREATE TABLE IF NOT EXISTS project_scans (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id            INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scanned_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    current_branch        TEXT,
    is_dirty              INTEGER NOT NULL DEFAULT 0,
    changed_files_count   INTEGER NOT NULL DEFAULT 0,
    untracked_files_count INTEGER NOT NULL DEFAULT 0,
    staged_files_count    INTEGER NOT NULL DEFAULT 0,
    last_commit_hash      TEXT,
    last_commit_date      TEXT,
    last_commit_message   TEXT,
    ahead_count           INTEGER,
    behind_count          INTEGER,
    is_valid_repo         INTEGER NOT NULL DEFAULT 1,
    error_message         TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
";

// ── Initialisation ────────────────────────────────────────────────────────────

pub fn init_database(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(SCHEMA)?;
    run_migrations(&conn);
    Ok(conn)
}

/// Non-destructive ALTER TABLE migrations. Each is wrapped in `let _ = ...`
/// so duplicate-column errors (SQLITE_ERROR) are silently ignored.
fn run_migrations(conn: &Connection) {
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN claude_startup_prompt TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN claude_prompt_mode TEXT NOT NULL DEFAULT 'append'", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN claude_priority_files TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN session_handoff_notes TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN startup_command TEXT NOT NULL DEFAULT 'claude'", []);
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN preferred_terminal TEXT NOT NULL DEFAULT ''", []);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn row_to_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        local_repo_path: row.get(3)?,
        status: row.get(4)?,
        phase: row.get(5)?,
        priority: row.get(6)?,
        ai_tool: row.get(7)?,
        current_task: row.get(8)?,
        next_task: row.get(9)?,
        blocker: row.get(10)?,
        notes: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        last_scanned_at: row.get(14)?,
        claude_startup_prompt: row.get(15)?,
        claude_prompt_mode: row.get(16)?,
        claude_priority_files: row.get(17)?,
        session_handoff_notes: row.get(18)?,
        startup_command: row.get(19)?,
        preferred_terminal: row.get(20)?,
    })
}

fn row_to_scan(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectScan> {
    Ok(ProjectScan {
        id: row.get(0)?,
        project_id: row.get(1)?,
        scanned_at: row.get(2)?,
        current_branch: row.get(3)?,
        is_dirty: row.get::<_, i64>(4)? != 0,
        changed_files_count: row.get(5)?,
        untracked_files_count: row.get(6)?,
        staged_files_count: row.get(7)?,
        last_commit_hash: row.get(8)?,
        last_commit_date: row.get(9)?,
        last_commit_message: row.get(10)?,
        ahead_count: row.get(11)?,
        behind_count: row.get(12)?,
        is_valid_repo: row.get::<_, i64>(13)? != 0,
        error_message: row.get(14)?,
    })
}

const PROJECT_COLS: &str = "
    id, name, description, local_repo_path, status, phase, priority, ai_tool,
    current_task, next_task, blocker, notes, created_at, updated_at, last_scanned_at,
    claude_startup_prompt, claude_prompt_mode, claude_priority_files,
    session_handoff_notes, startup_command, preferred_terminal
";

const SCAN_COLS: &str = "
    id, project_id, scanned_at, current_branch, is_dirty,
    changed_files_count, untracked_files_count, staged_files_count,
    last_commit_hash, last_commit_date, last_commit_message,
    ahead_count, behind_count, is_valid_repo, error_message
";

// ── Project CRUD ──────────────────────────────────────────────────────────────

pub fn fetch_projects(conn: &Connection) -> Result<Vec<Project>> {
    let sql = format!("SELECT {} FROM projects ORDER BY updated_at DESC", PROJECT_COLS);
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], row_to_project)?;
    rows.collect()
}

pub fn fetch_project(conn: &Connection, id: i64) -> Result<Project> {
    let sql = format!("SELECT {} FROM projects WHERE id = ?1", PROJECT_COLS);
    conn.query_row(&sql, params![id], row_to_project)
}

pub fn insert_project(conn: &Connection, p: CreateProject) -> Result<Project> {
    conn.execute(
        "INSERT INTO projects
            (name, description, local_repo_path, status, phase, priority, ai_tool,
             current_task, next_task, blocker, notes,
             claude_startup_prompt, claude_prompt_mode, claude_priority_files,
             session_handoff_notes, startup_command, preferred_terminal)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
        params![
            p.name, p.description, p.local_repo_path, p.status, p.phase,
            p.priority, p.ai_tool, p.current_task, p.next_task, p.blocker, p.notes,
            p.claude_startup_prompt, p.claude_prompt_mode, p.claude_priority_files,
            p.session_handoff_notes, p.startup_command, p.preferred_terminal
        ],
    )?;
    fetch_project(conn, conn.last_insert_rowid())
}

pub fn update_project_record(conn: &Connection, id: i64, p: UpdateProject) -> Result<Project> {
    conn.execute(
        "UPDATE projects SET
            name=?1, description=?2, local_repo_path=?3, status=?4, phase=?5,
            priority=?6, ai_tool=?7, current_task=?8, next_task=?9, blocker=?10,
            notes=?11,
            claude_startup_prompt=?12, claude_prompt_mode=?13, claude_priority_files=?14,
            session_handoff_notes=?15, startup_command=?16, preferred_terminal=?17,
            updated_at=strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id=?18",
        params![
            p.name, p.description, p.local_repo_path, p.status, p.phase,
            p.priority, p.ai_tool, p.current_task, p.next_task, p.blocker, p.notes,
            p.claude_startup_prompt, p.claude_prompt_mode, p.claude_priority_files,
            p.session_handoff_notes, p.startup_command, p.preferred_terminal,
            id
        ],
    )?;
    fetch_project(conn, id)
}

pub fn update_status(conn: &Connection, id: i64, status: &str) -> Result<Project> {
    conn.execute(
        "UPDATE projects SET status=?1, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id=?2",
        params![status, id],
    )?;
    fetch_project(conn, id)
}

/// Update only the local_repo_path — used for the "relink" action.
pub fn update_repo_path(conn: &Connection, id: i64, path: &str) -> Result<Project> {
    conn.execute(
        "UPDATE projects SET local_repo_path=?1, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id=?2",
        params![path, id],
    )?;
    fetch_project(conn, id)
}

pub fn delete_project_record(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM projects WHERE id=?1", params![id])?;
    Ok(())
}

// ── Scan CRUD ─────────────────────────────────────────────────────────────────

pub fn insert_scan(conn: &Connection, project_id: i64, git: &GitStatus) -> Result<ProjectScan> {
    conn.execute(
        "INSERT INTO project_scans
            (project_id, current_branch, is_dirty, changed_files_count,
             untracked_files_count, staged_files_count, last_commit_hash,
             last_commit_date, last_commit_message, ahead_count, behind_count,
             is_valid_repo, error_message)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        params![
            project_id,
            git.current_branch,
            git.is_dirty as i64,
            git.changed_files_count as i64,
            git.untracked_files_count as i64,
            git.staged_files_count as i64,
            git.last_commit_hash,
            git.last_commit_date,
            git.last_commit_message,
            git.ahead_count.map(|v| v as i64),
            git.behind_count.map(|v| v as i64),
            git.is_valid_repo as i64,
            git.error_message,
        ],
    )?;

    let scan_id = conn.last_insert_rowid();
    let sql = format!("SELECT {} FROM project_scans WHERE id=?1", SCAN_COLS);
    conn.query_row(&sql, params![scan_id], row_to_scan)
}

pub fn update_last_scanned(conn: &Connection, project_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE projects SET last_scanned_at=strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), updated_at=strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id=?1",
        params![project_id],
    )?;
    Ok(())
}

pub fn fetch_scans(conn: &Connection, project_id: i64, limit: i64) -> Result<Vec<ProjectScan>> {
    let sql = format!(
        "SELECT {} FROM project_scans WHERE project_id=?1 ORDER BY scanned_at DESC LIMIT ?2",
        SCAN_COLS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![project_id, limit], row_to_scan)?;
    rows.collect()
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

pub fn fetch_dashboard_stats(conn: &Connection) -> Result<DashboardStats> {
    let count = |sql: &str| -> Result<i64> {
        conn.query_row(sql, [], |r| r.get(0))
    };

    let total = count("SELECT COUNT(*) FROM projects")?;
    let active = count("SELECT COUNT(*) FROM projects WHERE status='active'")?;
    let blocked = count("SELECT COUNT(*) FROM projects WHERE status='blocked'")?;
    let paused = count("SELECT COUNT(*) FROM projects WHERE status='paused'")?;
    let done = count("SELECT COUNT(*) FROM projects WHERE status='done'")?;

    // Stale: not done, has a repo path, and no scan in the last 7 days (or never scanned)
    let stale = count(
        "SELECT COUNT(*) FROM projects
         WHERE status != 'done'
           AND local_repo_path != ''
           AND (last_scanned_at IS NULL OR last_scanned_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days'))",
    )?;

    // Dirty repos: latest scan for each project where is_dirty = 1
    let dirty_repos = count(
        "SELECT COUNT(*) FROM project_scans ps
         WHERE ps.is_dirty = 1
           AND ps.id = (
               SELECT MAX(id) FROM project_scans WHERE project_id = ps.project_id
           )",
    )
    .unwrap_or(0);

    Ok(DashboardStats {
        total,
        active,
        blocked,
        paused,
        done,
        stale,
        dirty_repos,
    })
}

// ── Export / Import ───────────────────────────────────────────────────────────

/// Export all projects as a JSON-serialisable vector.
/// Machine-specific paths are included but callers should treat them as advisory.
pub fn export_all_projects(conn: &Connection) -> Result<Vec<Project>> {
    fetch_projects(conn)
}

// ── Repo discovery ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct DiscoveredRepo {
    pub name: String,
    pub path: String,
    pub is_valid_git: bool,
    pub current_branch: Option<String>,
    pub is_dirty: bool,
    pub last_commit_date: Option<String>,
    pub last_commit_message: Option<String>,
    pub already_tracked: bool,
}

pub fn fetch_all_repo_paths(conn: &Connection) -> Result<HashSet<String>> {
    let mut stmt = conn.prepare(
        "SELECT local_repo_path FROM projects WHERE local_repo_path != ''"
    )?;
    let paths = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(paths)
}

/// Import projects from an export. Projects are inserted fresh (new IDs).
/// `local_repo_path` is preserved from the export but may need relinking.
pub fn import_projects(conn: &Connection, projects: Vec<Project>) -> Result<usize> {
    let mut count = 0usize;
    for p in projects {
        conn.execute(
            "INSERT INTO projects
                (name, description, local_repo_path, status, phase, priority, ai_tool,
                 current_task, next_task, blocker, notes, created_at,
                 claude_startup_prompt, claude_prompt_mode, claude_priority_files,
                 session_handoff_notes, startup_command, preferred_terminal)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",
            params![
                p.name, p.description, p.local_repo_path, p.status, p.phase,
                p.priority, p.ai_tool, p.current_task, p.next_task, p.blocker,
                p.notes, p.created_at,
                p.claude_startup_prompt, p.claude_prompt_mode, p.claude_priority_files,
                p.session_handoff_notes, p.startup_command, p.preferred_terminal
            ],
        )?;
        count += 1;
    }
    Ok(count)
}
