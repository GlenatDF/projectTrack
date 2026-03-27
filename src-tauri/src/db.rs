use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
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

CREATE TABLE IF NOT EXISTS methodology_blocks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT    NOT NULL UNIQUE,
    title      TEXT    NOT NULL,
    category   TEXT    NOT NULL DEFAULT 'general',
    content    TEXT    NOT NULL DEFAULT '',
    is_active  INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS planning_prompt_templates (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    slug               TEXT NOT NULL UNIQUE,
    name               TEXT NOT NULL,
    system_prompt      TEXT NOT NULL DEFAULT '',
    user_prompt        TEXT NOT NULL DEFAULT '',
    output_format_spec TEXT NOT NULL DEFAULT '',
    model_hint         TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    version            INTEGER NOT NULL DEFAULT 1,
    is_active          INTEGER NOT NULL DEFAULT 1,
    created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS project_documents (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    doc_type   TEXT    NOT NULL,
    title      TEXT    NOT NULL,
    content    TEXT    NOT NULL DEFAULT '',
    status     TEXT    NOT NULL DEFAULT 'draft',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_project_documents_pid  ON project_documents(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_documents_type ON project_documents(project_id, doc_type);

CREATE TABLE IF NOT EXISTS project_phases (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_number       INTEGER NOT NULL,
    name               TEXT    NOT NULL,
    description        TEXT    NOT NULL DEFAULT '',
    goals              TEXT    NOT NULL DEFAULT '[]',
    estimated_duration TEXT    NOT NULL DEFAULT '',
    depends_on_phase   INTEGER,
    status             TEXT    NOT NULL DEFAULT 'pending',
    ai_generated       INTEGER NOT NULL DEFAULT 1,
    user_modified      INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    UNIQUE(project_id, phase_number)
);
CREATE INDEX IF NOT EXISTS idx_project_phases_pid ON project_phases(project_id);

CREATE TABLE IF NOT EXISTS project_tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_id        INTEGER REFERENCES project_phases(id) ON DELETE SET NULL,
    title           TEXT    NOT NULL,
    description     TEXT    NOT NULL DEFAULT '',
    category        TEXT    NOT NULL DEFAULT 'build',
    effort_estimate TEXT    NOT NULL DEFAULT '',
    status          TEXT    NOT NULL DEFAULT 'pending',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    ai_generated    INTEGER NOT NULL DEFAULT 1,
    user_modified   INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_project_tasks_pid   ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_phase ON project_tasks(phase_id);

CREATE TABLE IF NOT EXISTS project_risks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title        TEXT    NOT NULL,
    description  TEXT    NOT NULL DEFAULT '',
    likelihood   TEXT    NOT NULL DEFAULT 'medium',
    impact       TEXT    NOT NULL DEFAULT 'medium',
    mitigation   TEXT    NOT NULL DEFAULT '',
    status       TEXT    NOT NULL DEFAULT 'open',
    ai_generated INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_project_risks_pid ON project_risks(project_id);

CREATE TABLE IF NOT EXISTS project_assumptions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title        TEXT    NOT NULL,
    description  TEXT    NOT NULL DEFAULT '',
    category     TEXT    NOT NULL DEFAULT 'general',
    status       TEXT    NOT NULL DEFAULT 'active',
    ai_generated INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_project_assumptions_pid ON project_assumptions(project_id);

CREATE TABLE IF NOT EXISTS ai_plan_runs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    template_slug TEXT    NOT NULL DEFAULT 'project_planning_v1',
    prompt_sent   TEXT    NOT NULL DEFAULT '',
    raw_response  TEXT    NOT NULL DEFAULT '',
    parsed_ok     INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    phases_count  INTEGER NOT NULL DEFAULT 0,
    tasks_count   INTEGER NOT NULL DEFAULT 0,
    risks_count   INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_plan_runs_pid ON ai_plan_runs(project_id);
";

// ── Initialisation ────────────────────────────────────────────────────────────

pub fn init_database(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(SCHEMA)?;
    run_migrations(&conn);
    let _ = seed_defaults(&conn);
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
    let _ = conn.execute("ALTER TABLE projects ADD COLUMN claude_session_id TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE project_tasks ADD COLUMN progress_note TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE project_tasks ADD COLUMN started_at TEXT", []);
    let _ = conn.execute("ALTER TABLE project_tasks ADD COLUMN completed_at TEXT", []);
    let _ = conn.execute("ALTER TABLE project_tasks ADD COLUMN last_worked_at TEXT", []);
    migrate_add_operating_standard(conn);
}

/// Backfill: inserts the Claude Project Operating Standard document for every project that
/// does not already have it. INSERT OR IGNORE makes this fully idempotent — safe to run on
/// every startup. Projects that already have this doc_type are untouched.
fn migrate_add_operating_standard(conn: &Connection) {
    let _ = conn.execute(
        "INSERT OR IGNORE INTO project_documents (project_id, doc_type, title, content, sort_order)
         SELECT id, 'operating_standard', 'Claude Project Operating Standard', ?1, 9
         FROM projects",
        params![SCAFFOLD_OPERATING_STANDARD],
    );
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
    let id = conn.last_insert_rowid();
    let _ = generate_project_scaffold(conn, id, &p.name, &p.description);
    fetch_project(conn, id)
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

// ── Planning: New data models ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct MethodologyBlock {
    pub id: i64,
    pub slug: String,
    pub title: String,
    pub category: String,
    pub content: String,
    pub is_active: bool,
    pub sort_order: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProjectDocument {
    pub id: i64,
    pub project_id: i64,
    pub doc_type: String,
    pub title: String,
    pub content: String,
    pub status: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProjectPhase {
    pub id: i64,
    pub project_id: i64,
    pub phase_number: i64,
    pub name: String,
    pub description: String,
    pub goals: String,
    pub estimated_duration: String,
    pub depends_on_phase: Option<i64>,
    pub status: String,
    pub ai_generated: bool,
    pub user_modified: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProjectTask {
    pub id: i64,
    pub project_id: i64,
    pub phase_id: Option<i64>,
    pub title: String,
    pub description: String,
    pub category: String,
    pub effort_estimate: String,
    pub status: String,
    pub sort_order: i64,
    pub ai_generated: bool,
    pub user_modified: bool,
    pub created_at: String,
    pub progress_note: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub last_worked_at: Option<String>,
}

/// A task in `in_progress` status, enriched with the parent project name.
/// Used by the dashboard "In Focus" panel.
#[derive(Debug, Serialize, Clone)]
pub struct InProgressTask {
    pub id: i64,
    pub project_id: i64,
    pub project_name: String,
    pub title: String,
    pub category: String,
    pub status: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProjectRisk {
    pub id: i64,
    pub project_id: i64,
    pub title: String,
    pub description: String,
    pub likelihood: String,
    pub impact: String,
    pub mitigation: String,
    pub status: String,
    pub ai_generated: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProjectAssumption {
    pub id: i64,
    pub project_id: i64,
    pub title: String,
    pub description: String,
    pub category: String,
    pub status: String,
    pub ai_generated: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct AiPlanRun {
    pub id: i64,
    pub project_id: i64,
    pub template_slug: String,
    pub parsed_ok: bool,
    pub error_message: Option<String>,
    pub phases_count: i64,
    pub tasks_count: i64,
    pub risks_count: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ImportPlanResult {
    pub phases_imported: usize,
    pub tasks_imported: usize,
    pub risks_imported: usize,
    pub assumptions_imported: usize,
    pub preserved_task_count: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct AssembledPrompt {
    pub prompt: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProjectPlan {
    pub phases: Vec<ProjectPhase>,
    pub tasks: Vec<ProjectTask>,
    pub risks: Vec<ProjectRisk>,
    pub assumptions: Vec<ProjectAssumption>,
}

// ── Planning: Scaffold template constants ──────────────────────────────────────

const SCAFFOLD_BRIEF: &str = "# Project Brief: {{project_name}}\n\n## Overview\n{{description}}\n\n## Problem Statement\n[What problem does this project solve? Who is it for?]\n\n## Goals\n- [Primary goal]\n- [Secondary goal]\n\n## Non-Goals\n- [What this project will NOT do]\n\n## Success Criteria\n- [How will we know this shipped successfully?]\n\n## Constraints\n- [Time, budget, technical, or team constraints]\n";

const SCAFFOLD_PRD: &str = "# Product Requirements: {{project_name}}\n\n## User Stories\n- As a [user type], I want to [action] so that [benefit]\n\n## Functional Requirements\n\n### Must Have (MVP)\n- [Requirement 1]\n- [Requirement 2]\n\n### Should Have\n- [Requirement 3]\n\n### Nice to Have\n- [Requirement 4]\n\n## Non-Functional Requirements\n- Performance: [e.g., loads in < 2s]\n- Security: [e.g., auth required]\n- Compatibility: [target platforms/versions]\n\n## Out of Scope\n- [items explicitly excluded from this project]\n";

const SCAFFOLD_TECH_SPEC: &str = "# Technical Specification: {{project_name}}\n\n## Architecture Overview\n[High-level description of how the system works]\n\n## Tech Stack\n- [Technology 1]: [why chosen]\n- [Technology 2]: [why chosen]\n\n## Key Components\n\n### [Component Name]\n- **Purpose:** [what it does]\n- **Interface:** [inputs/outputs]\n- **Dependencies:** [what it needs]\n\n## Data Model\n[Key entities, fields, and relationships]\n\n## Key Flows\n\n### [Flow Name]\n1. [Step 1]\n2. [Step 2]\n\n## External Dependencies\n- [Service/API]: [how it's used]\n\n## Deployment\n[How this will be built and deployed]\n\n## Open Questions\n- [ ] [Question that needs resolving]\n";

const SCAFFOLD_AI_INSTRUCTIONS: &str = "# CLAUDE.md \u{2014} {{project_name}}\n\n## Overview\n{{description}}\n\n## Current Focus\n[What we're actively working on \u{2014} update each session]\n\n## Architecture\n[Brief architecture summary for AI context]\n\n## Key Files\n| File | Purpose |\n|------|---------|\n| [path] | [what it does] |\n\n## Conventions\n- [Naming conventions]\n- [Code style preferences]\n- [Testing approach]\n\n## Do Not\n- [Things the AI should avoid changing]\n- [Protected files or patterns]\n\n## Session Notes\n[Anything the AI should know at the start of each session]\n";

const SCAFFOLD_RISKS: &str = "# Risks / Assumptions / Dependencies\n\n## Risks\n- [Risk]\n  - Likelihood:\n  - Impact:\n  - Mitigation:\n\n## Assumptions\n- [Assumption]\n  - Why it matters:\n  - What happens if false:\n\n## Dependencies\n- [Dependency]\n  - Owner:\n  - Status:\n  - Impact if delayed:\n\n## Open Questions\n- [Question needing clarification]\n\n## Notes\n- [Any rough project thinking related to uncertainty, blockers, or delivery risk]\n";

const SCAFFOLD_DECISIONS: &str = "# Decision Log: {{project_name}}\n\nRecord key technical and product decisions here so the rationale is not lost.\n\n---\n\n## [YYYY-MM-DD] Template Decision\n\n**Decision:** [What was decided]\n\n**Context:** [Why this decision was needed]\n\n**Options Considered:**\n1. [Option A] \u{2014} pros/cons\n2. [Option B] \u{2014} pros/cons\n\n**Rationale:** [Why this option was chosen]\n\n**Consequences:** [What changes as a result]\n\n---\n";

const SCAFFOLD_HANDOFF: &str = "# Session Handoff: {{project_name}}\n\nUpdate this document at the end of each AI session so the next session starts with full context.\n\n---\n\n## Last Session (YYYY-MM-DD)\n\n### Accomplished\n- [What was completed]\n\n### Current State\n[Where things stand right now]\n\n### Files Changed\n- [file]: [what changed]\n\n### Next Steps\n1. [Most important next action]\n2. [Second action]\n\n### Blockers\n- [Anything blocking progress]\n\n### Context for Next Session\n[Important context the AI will need]\n\n---\n";

const SCAFFOLD_SCRATCHPAD: &str = "# Scratchpad: {{project_name}}\n\nUse this document for rough notes, ideas, and working thoughts.\n\n---\n\n";

const SCAFFOLD_OPERATING_STANDARD: &str = r#"# Claude Project Operating Standard

## 1. Purpose
This document defines the default operating ethos, working style, and delivery methodology Claude should follow across all projects in Project Track. It exists to ensure AI-assisted project work is consistent, practical, challenging when needed, and focused on producing useful outputs rather than agreeable fluff.

## 2. Core Principles
- Principle beats rule
- Clarity over verbosity
- Concrete behaviours over abstract adjectives
- Working outputs over theoretical perfection
- Maintainability over cleverness
- Truth over agreement
- Momentum over paralysis
- Explicit assumptions over hidden assumptions
- Structured thinking over rambling
- System improvement over repeated correction

## 3. Expected Behaviours
Claude should:
- identify the real problem being solved
- separate facts, assumptions, and recommendations
- surface ambiguity early
- highlight risks and dependencies
- challenge weak reasoning respectfully
- avoid fake certainty
- avoid overengineering
- prefer practical, immediately usable outputs
- maintain continuity with existing project documents
- help convert rough notes into structured artefacts

## 4. New Project Startup Process
When starting work on a new project, Claude should:
1. read the Project Overview, Background, and Scope first
2. identify missing information and open questions
3. help create or refine the initial phase plan
4. identify major risks, dependencies, and assumptions
5. propose the next 3–5 concrete actions
6. avoid pretending unknowns are already resolved

## 5. Planning and Delivery Method
Claude should support a practical delivery rhythm:
- start with a clear problem statement
- break work into phases
- define boundaries before deep implementation
- scaffold first, polish later
- recommend incremental delivery where possible
- make trade-offs visible
- prefer repeatable patterns over one-off hacks
- keep plans realistic and updateable

## 6. Documentation Standards
Claude should produce documentation that is:
- structured
- concise
- easy to maintain
- useful to humans
- free of unnecessary filler
- explicit about unresolved questions
- aligned with current understanding rather than stale history

Where appropriate, documents should clearly separate:
- confirmed facts
- assumptions
- decisions made
- outstanding questions
- recommended next actions

## 7. Decision-Making Approach
When helping with decisions, Claude should:
1. define the decision clearly
2. identify realistic options
3. explain pros, cons, and risks
4. recommend a path with reasoning
5. state what assumptions the recommendation depends on
6. note what could change the recommendation

## 8. Anti-Sycophancy and Challenge Rules
Claude must not optimise for agreement.
Claude should:
- not tell the user what they want to hear just to sound helpful
- point out contradictions, missing constraints, and weak assumptions
- respectfully challenge risky or unclear plans
- flag when more information is needed
- avoid flattering language that hides poor reasoning
- prioritise accuracy, clarity, and usefulness over reassurance

## 9. Output Quality Standard
Good outputs should be:
- clear
- practical
- specific
- well-structured
- tailored to the project
- ready to paste into docs, tickets, code comments, or plans
- explicit about next steps where relevant

Poor outputs include:
- vague strategy language
- long generic text with little actionability
- invented facts
- hidden assumptions
- unnecessary repetition
- agreement without analysis

## 10. Lessons and Continuous Improvement
Claude should support continuous improvement by:
- capturing repeated mistakes
- identifying useful patterns
- noting where instructions caused confusion
- improving prompts, templates, and workflows over time
- preferring durable process improvements over one-off fixes

## 11. Human Escalation Triggers
Claude should explicitly flag when:
- requirements are too unclear
- a business decision is needed
- multiple implementation paths are equally viable
- risk is materially increasing
- security, privacy, or data integrity may be affected
- project scope is drifting
- the user should review before proceeding further
"#;

// ── Planning: Seed data constants ──────────────────────────────────────────────

const SEED_METHOD_MVP_FIRST: &str = "**Delivery Approach: MVP First**\n\nDeliver the smallest working version that validates the core idea. Every feature decision is filtered through: does this help reach a working product faster? Defer polish, edge cases, and nice-to-haves until after the core loop is validated with real usage.";

const SEED_METHOD_AI_ASSISTED: &str = "**Development Approach: AI-Assisted**\n\nUse AI tools (Claude, Cursor, Copilot) as primary code generators. The human role is to direct, decompose, review, and integrate \u{2014} not to write every line from scratch. Design the prompt before writing code. Review AI output critically before committing.";

const SEED_METHOD_SHIP_LEARN: &str = "**Iteration Philosophy: Ship and Learn**\n\nBias strongly toward shipping. A working product in production beats a perfect product in development. Post-ship iteration is the primary quality mechanism. Ship the smallest useful increment, observe real behaviour, then improve.";

const SEED_METHOD_ITERATIVE: &str = "**Quality Approach: Test What Matters**\n\nTest the most critical paths first. Prefer integration tests that cover real user flows over isolated unit tests. Run tests after each meaningful change. Focus coverage on the scenarios that would hurt most if broken.";

const SEED_PLANNING_PROMPT: &str = r#"You are an expert software project planner. Generate a detailed, actionable implementation plan for the following project.

{{methodology:mvp_first}}

{{methodology:ai_assisted}}

{{methodology:ship_learn}}

---

## Project Details

**Name:** {{project_name}}
**Description:** {{description}}
**Current Phase:** {{current_phase}}
**Priority:** {{priority}}
**AI Tool:** {{ai_tool}}
**Current Task:** {{current_task}}
**Next Task:** {{next_task}}
**Notes / Tech Stack:** {{notes}}

---

## Required Output

Return ONLY valid JSON — no preamble, no explanation, no markdown code fences. The JSON must match this structure exactly:

{
  "phases": [
    {
      "phase_number": 1,
      "name": "string",
      "description": "string — what this phase delivers",
      "goals": ["string"],
      "estimated_duration": "string — e.g. 2-3 days",
      "tasks": [
        {
          "title": "string",
          "description": "string — what to do",
          "category": "build | design | test | infra | docs | review | deploy | other",
          "effort_estimate": "string — e.g. 2h",
          "sort_order": 1
        }
      ]
    }
  ],
  "risks": [
    {
      "title": "string",
      "description": "string",
      "likelihood": "low | medium | high",
      "impact": "low | medium | high",
      "mitigation": "string"
    }
  ],
  "assumptions": [
    {
      "title": "string",
      "description": "string",
      "category": "technical | business | resource | timeline | other"
    }
  ],
  "technical_decisions": [
    {
      "title": "string",
      "decision": "string",
      "rationale": "string"
    }
  ]
}

Generate 3-6 phases with 3-8 tasks each. Include 3-8 risks and 3-6 assumptions. Focus on concrete, actionable tasks."#;

// ── Planning: Seed functions ───────────────────────────────────────────────────

pub fn seed_defaults(conn: &Connection) -> Result<()> {
    seed_methodology_blocks(conn)?;
    seed_prompt_template(conn)?;
    Ok(())
}

fn seed_methodology_blocks(conn: &Connection) -> Result<()> {
    let blocks: &[(&str, &str, &str, &str, i64)] = &[
        ("mvp_first",     "MVP First",         "delivery",  SEED_METHOD_MVP_FIRST,   1),
        ("ai_assisted",   "AI-Assisted Dev",   "process",   SEED_METHOD_AI_ASSISTED, 2),
        ("ship_learn",    "Ship and Learn",    "iteration", SEED_METHOD_SHIP_LEARN,  3),
        ("test_critical", "Test What Matters", "quality",   SEED_METHOD_ITERATIVE,   4),
    ];
    for (slug, title, category, content, sort_order) in blocks {
        conn.execute(
            "INSERT OR IGNORE INTO methodology_blocks (slug, title, category, content, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![slug, title, category, content, sort_order],
        )?;
    }
    Ok(())
}

fn seed_prompt_template(conn: &Connection) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO planning_prompt_templates
             (slug, name, system_prompt, user_prompt, output_format_spec, model_hint)
         VALUES ('project_planning_v1', 'Project Planning v1', '', ?1, 'json', 'claude-sonnet-4-6')",
        params![SEED_PLANNING_PROMPT],
    )?;
    Ok(())
}

// ── Planning: Scaffold generation ─────────────────────────────────────────────

fn scaffold_templates(project_name: &str, description: &str) -> Vec<(String, String, String, i64)> {
    let templates: &[(&str, &str, &str, i64)] = &[
        ("brief",              "Project Brief",                      SCAFFOLD_BRIEF,              1),
        ("prd",               "Product Requirements",               SCAFFOLD_PRD,                2),
        ("tech_spec",         "Technical Specification",            SCAFFOLD_TECH_SPEC,          3),
        ("ai_instructions",   "AI Instructions (CLAUDE.md)",        SCAFFOLD_AI_INSTRUCTIONS,    4),
        ("risks",             "Risks / Assumptions / Dependencies",  SCAFFOLD_RISKS,              5),
        ("decisions",         "Decision Log",                       SCAFFOLD_DECISIONS,          6),
        ("handoff",           "Session Handoff",                    SCAFFOLD_HANDOFF,            7),
        ("scratchpad",        "Scratchpad",                         SCAFFOLD_SCRATCHPAD,         8),
        ("operating_standard","Claude Project Operating Standard",  SCAFFOLD_OPERATING_STANDARD, 9),
    ];
    templates
        .iter()
        .map(|(doc_type, title, tmpl, sort)| {
            let content = tmpl
                .replace("{{project_name}}", project_name)
                .replace("{{description}}", description);
            (doc_type.to_string(), title.to_string(), content, *sort)
        })
        .collect()
}

pub fn generate_project_scaffold(
    conn: &Connection,
    project_id: i64,
    project_name: &str,
    description: &str,
) -> Result<()> {
    for (doc_type, title, content, sort_order) in scaffold_templates(project_name, description) {
        conn.execute(
            "INSERT OR IGNORE INTO project_documents
                 (project_id, doc_type, title, content, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![project_id, doc_type, title, content, sort_order],
        )?;
    }
    Ok(())
}

pub fn regenerate_scaffold(conn: &Connection, project_id: i64) -> Result<Vec<ProjectDocument>> {
    let project = fetch_project(conn, project_id)?;
    for (doc_type, title, content, sort_order) in
        scaffold_templates(&project.name, &project.description)
    {
        conn.execute(
            "INSERT OR IGNORE INTO project_documents
                 (project_id, doc_type, title, content, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![project_id, doc_type, title, content, sort_order],
        )?;
        conn.execute(
            "UPDATE project_documents
             SET content = ?1, title = ?2,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE project_id = ?3 AND doc_type = ?4 AND status = 'draft'",
            params![content, title, project_id, doc_type],
        )?;
    }
    fetch_project_documents(conn, project_id)
}

// ── Planning: Document CRUD ───────────────────────────────────────────────────

fn row_to_document(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectDocument> {
    Ok(ProjectDocument {
        id: row.get(0)?,
        project_id: row.get(1)?,
        doc_type: row.get(2)?,
        title: row.get(3)?,
        content: row.get(4)?,
        status: row.get(5)?,
        sort_order: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

pub fn fetch_project_documents(conn: &Connection, project_id: i64) -> Result<Vec<ProjectDocument>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, doc_type, title, content, status, sort_order, created_at, updated_at
         FROM project_documents
         WHERE project_id = ?1
         ORDER BY sort_order ASC",
    )?;
    let rows = stmt.query_map(params![project_id], row_to_document)?;
    rows.collect()
}

pub fn update_project_document(
    conn: &Connection,
    project_id: i64,
    doc_type: &str,
    content: &str,
) -> Result<ProjectDocument> {
    conn.execute(
        "UPDATE project_documents
         SET content = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE project_id = ?2 AND doc_type = ?3",
        params![content, project_id, doc_type],
    )?;
    conn.query_row(
        "SELECT id, project_id, doc_type, title, content, status, sort_order, created_at, updated_at
         FROM project_documents WHERE project_id = ?1 AND doc_type = ?2",
        params![project_id, doc_type],
        row_to_document,
    )
}

pub fn update_document_status(
    conn: &Connection,
    project_id: i64,
    doc_type: &str,
    status: &str,
) -> Result<ProjectDocument> {
    conn.execute(
        "UPDATE project_documents
         SET status = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE project_id = ?2 AND doc_type = ?3",
        params![status, project_id, doc_type],
    )?;
    conn.query_row(
        "SELECT id, project_id, doc_type, title, content, status, sort_order, created_at, updated_at
         FROM project_documents WHERE project_id = ?1 AND doc_type = ?2",
        params![project_id, doc_type],
        row_to_document,
    )
}

// ── Planning: Methodology CRUD ────────────────────────────────────────────────

fn row_to_methodology_block(row: &rusqlite::Row<'_>) -> rusqlite::Result<MethodologyBlock> {
    Ok(MethodologyBlock {
        id: row.get(0)?,
        slug: row.get(1)?,
        title: row.get(2)?,
        category: row.get(3)?,
        content: row.get(4)?,
        is_active: row.get::<_, i64>(5)? != 0,
        sort_order: row.get(6)?,
    })
}

pub fn fetch_methodology_blocks(conn: &Connection) -> Result<Vec<MethodologyBlock>> {
    let mut stmt = conn.prepare(
        "SELECT id, slug, title, category, content, is_active, sort_order
         FROM methodology_blocks
         ORDER BY sort_order ASC",
    )?;
    let rows = stmt.query_map([], row_to_methodology_block)?;
    rows.collect()
}

pub fn update_methodology_block(
    conn: &Connection,
    slug: &str,
    content: &str,
    is_active: bool,
) -> Result<MethodologyBlock> {
    conn.execute(
        "UPDATE methodology_blocks
         SET content = ?1, is_active = ?2,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE slug = ?3",
        params![content, is_active as i64, slug],
    )?;
    conn.query_row(
        "SELECT id, slug, title, category, content, is_active, sort_order
         FROM methodology_blocks WHERE slug = ?1",
        params![slug],
        row_to_methodology_block,
    )
}

// ── Planning: Template processing ─────────────────────────────────────────────

/// Replace `{{methodology:slug}}` tokens with block content.
/// Processes left-to-right; substituted content is never re-scanned.
fn substitute_methodology(template: &str, blocks: &[MethodologyBlock]) -> (String, Vec<String>) {
    let mut result = String::with_capacity(template.len() * 2);
    let mut warnings: Vec<String> = Vec::new();
    let mut remaining = template;
    const TOKEN_PREFIX: &str = "{{methodology:";

    while let Some(start) = remaining.find(TOKEN_PREFIX) {
        result.push_str(&remaining[..start]);
        remaining = &remaining[start..];

        if let Some(end) = remaining.find("}}") {
            let slug = &remaining[TOKEN_PREFIX.len()..end];
            if let Some(block) = blocks.iter().find(|b| b.slug == slug && b.is_active) {
                result.push_str(&block.content);
                result.push('\n');
            } else {
                warnings.push(format!(
                    "Methodology block '{}' not found or inactive \u{2014} token removed",
                    slug
                ));
            }
            remaining = &remaining[end + 2..];
        } else {
            result.push_str(remaining);
            remaining = "";
        }
    }
    result.push_str(remaining);
    (result, warnings)
}

fn substitute_project_vars(template: &str, project: &Project) -> String {
    template
        .replace("{{project_name}}", &project.name)
        .replace("{{description}}", &project.description)
        .replace("{{current_phase}}", &project.phase)
        .replace("{{priority}}", &project.priority)
        .replace("{{ai_tool}}", &project.ai_tool)
        .replace("{{current_task}}", &project.current_task)
        .replace("{{next_task}}", &project.next_task)
        .replace("{{blocker}}", &project.blocker)
        .replace("{{notes}}", &project.notes)
}

// ── Planning: Prompt assembly ─────────────────────────────────────────────────

pub fn assemble_prompt(conn: &Connection, project_id: i64) -> Result<AssembledPrompt> {
    let project = fetch_project(conn, project_id)?;
    let blocks = fetch_methodology_blocks(conn)?;

    let template_prompt: String = conn
        .query_row(
            "SELECT user_prompt FROM planning_prompt_templates
             WHERE slug = 'project_planning_v1' AND is_active = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| SEED_PLANNING_PROMPT.to_string());

    let (with_methods, warnings) = substitute_methodology(&template_prompt, &blocks);
    let prompt = substitute_project_vars(&with_methods, &project);

    Ok(AssembledPrompt { prompt, warnings })
}

// ── Planning: Lenient JSON helpers ────────────────────────────────────────────

fn strip_code_fences(raw: &str) -> String {
    let s = raw.trim();
    let s = s
        .strip_prefix("```json")
        .or_else(|| s.strip_prefix("```"))
        .unwrap_or(s);
    let s = s.strip_suffix("```").unwrap_or(s);
    s.trim().to_string()
}

fn val_str(v: &Value, key: &str) -> Option<String> {
    match v.get(key) {
        Some(Value::String(s)) => Some(s.clone()),
        Some(other) if !other.is_null() => {
            let raw = other.to_string();
            Some(raw.trim_matches('"').to_string())
        }
        _ => None,
    }
}

fn val_i64(v: &Value, key: &str) -> Option<i64> {
    match v.get(key) {
        Some(Value::Number(n)) => n.as_i64(),
        Some(Value::String(s)) => s.parse().ok(),
        _ => None,
    }
}

fn val_arr(v: &Value, key: &str) -> Vec<Value> {
    match v.get(key) {
        Some(Value::Array(arr)) => arr.clone(),
        _ => vec![],
    }
}

fn normalise_level(s: &str) -> String {
    match s.to_lowercase().as_str() {
        "high" | "h" | "3" => "high".to_string(),
        "low" | "l" | "1" => "low".to_string(),
        _ => "medium".to_string(),
    }
}

fn normalise_category(s: &str) -> String {
    let lower = s.to_lowercase();
    match lower.trim() {
        "build" | "code" | "implement" | "feature" | "implementation" => "build".to_string(),
        "design" | "ui" | "ux" | "wireframe" => "design".to_string(),
        "test" | "testing" | "qa" | "quality" => "test".to_string(),
        "infra" | "infrastructure" | "devops" | "ci" | "cd" | "pipeline" => "infra".to_string(),
        "docs" | "documentation" | "doc" | "document" => "docs".to_string(),
        "review" | "code_review" | "pr" | "audit" => "review".to_string(),
        "deploy" | "deployment" | "release" | "ship" | "launch" => "deploy".to_string(),
        _ => "other".to_string(),
    }
}

fn normalise_assumption_category(s: &str) -> String {
    let lower = s.to_lowercase();
    match lower.trim() {
        "technical" | "tech" => "technical".to_string(),
        "business" | "biz" => "business".to_string(),
        "resource" | "resources" | "team" => "resource".to_string(),
        "timeline" | "time" | "schedule" => "timeline".to_string(),
        _ => "other".to_string(),
    }
}

// ── Planning: Plan import ─────────────────────────────────────────────────────

fn next_free_phase_number(conn: &Connection, project_id: i64, preferred: i64) -> i64 {
    let mut n = preferred;
    let limit = preferred + 100; // safety cap: never loop more than 100 times
    loop {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM project_phases WHERE project_id = ?1 AND phase_number = ?2",
                params![project_id, n],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists == 0 || n >= limit {
            return n;
        }
        n += 1;
    }
}

/// Import a parsed AI plan response into the database.
/// Preserves phases/tasks with `user_modified = 1`.
/// Replaces all ai-generated non-user-modified phases/tasks and all ai-generated risks/assumptions.
pub fn import_plan(
    conn: &mut Connection,
    project_id: i64,
    prompt_sent: &str,
    raw_response: &str,
) -> Result<ImportPlanResult> {
    let stripped = strip_code_fences(raw_response);
    let json_val: Value = serde_json::from_str(&stripped).map_err(|e| {
        rusqlite::Error::InvalidParameterName(format!("JSON parse failed: {}", e))
    })?;

    let phases_arr = val_arr(&json_val, "phases");
    if phases_arr.is_empty() {
        return Err(rusqlite::Error::InvalidParameterName(
            "No phases found in AI response".to_string(),
        ));
    }
    if phases_arr.len() > 20 {
        return Err(rusqlite::Error::InvalidParameterName(
            format!("Response contains {} phases — maximum is 20. Check you pasted the right content.", phases_arr.len()),
        ));
    }
    let risks_arr = val_arr(&json_val, "risks");
    let assumptions_arr = val_arr(&json_val, "assumptions");

    let tx = conn.transaction()?;

    // Delete non-user-modified AI-generated records
    tx.execute(
        "DELETE FROM project_phases WHERE project_id = ?1 AND ai_generated = 1 AND user_modified = 0",
        params![project_id],
    )?;
    tx.execute(
        "DELETE FROM project_tasks WHERE project_id = ?1 AND ai_generated = 1 AND user_modified = 0",
        params![project_id],
    )?;
    tx.execute(
        "DELETE FROM project_risks WHERE project_id = ?1 AND ai_generated = 1",
        params![project_id],
    )?;
    tx.execute(
        "DELETE FROM project_assumptions WHERE project_id = ?1 AND ai_generated = 1",
        params![project_id],
    )?;

    let mut tasks_imported = 0usize;
    for (idx, phase_val) in phases_arr.iter().enumerate() {
        let preferred_num = val_i64(phase_val, "phase_number").unwrap_or((idx as i64) + 1);
        let phase_number = next_free_phase_number(&tx, project_id, preferred_num);
        let name = val_str(phase_val, "name")
            .unwrap_or_else(|| format!("Phase {}", phase_number));
        let description = val_str(phase_val, "description").unwrap_or_default();
        let goals_vec = val_arr(phase_val, "goals");
        let goals_json =
            serde_json::to_string(&goals_vec).unwrap_or_else(|_| "[]".to_string());
        let estimated_duration =
            val_str(phase_val, "estimated_duration").unwrap_or_default();

        tx.execute(
            "INSERT INTO project_phases
                 (project_id, phase_number, name, description, goals, estimated_duration, ai_generated)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)",
            params![project_id, phase_number, name, description, goals_json, estimated_duration],
        )?;
        let phase_id = tx.last_insert_rowid();

        for (task_idx, task_val) in val_arr(phase_val, "tasks").iter().enumerate() {
            let title = val_str(task_val, "title")
                .unwrap_or_else(|| format!("Task {}", task_idx + 1));
            let desc = val_str(task_val, "description").unwrap_or_default();
            let category =
                normalise_category(&val_str(task_val, "category").unwrap_or_default());
            let effort = val_str(task_val, "effort_estimate").unwrap_or_default();
            let sort_order =
                val_i64(task_val, "sort_order").unwrap_or((task_idx as i64) + 1);

            tx.execute(
                "INSERT INTO project_tasks
                     (project_id, phase_id, title, description, category, effort_estimate, sort_order, ai_generated)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
                params![project_id, phase_id, title, desc, category, effort, sort_order],
            )?;
            tasks_imported += 1;
        }
    }

    for risk_val in risks_arr.iter() {
        let title = val_str(risk_val, "title").unwrap_or_else(|| "Untitled Risk".to_string());
        let desc = val_str(risk_val, "description").unwrap_or_default();
        let likelihood =
            normalise_level(&val_str(risk_val, "likelihood").unwrap_or_default());
        let impact = normalise_level(&val_str(risk_val, "impact").unwrap_or_default());
        let mitigation = val_str(risk_val, "mitigation").unwrap_or_default();
        tx.execute(
            "INSERT INTO project_risks
                 (project_id, title, description, likelihood, impact, mitigation, ai_generated)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)",
            params![project_id, title, desc, likelihood, impact, mitigation],
        )?;
    }

    for assumption_val in assumptions_arr.iter() {
        let title = val_str(assumption_val, "title")
            .unwrap_or_else(|| "Untitled Assumption".to_string());
        let desc = val_str(assumption_val, "description").unwrap_or_default();
        let category = normalise_assumption_category(
            &val_str(assumption_val, "category").unwrap_or_default(),
        );
        tx.execute(
            "INSERT INTO project_assumptions
                 (project_id, title, description, category, ai_generated)
             VALUES (?1, ?2, ?3, ?4, 1)",
            params![project_id, title, desc, category],
        )?;
    }

    let preserved_task_count: i64 = tx.query_row(
        "SELECT COUNT(*) FROM project_tasks WHERE project_id = ?1 AND user_modified = 1",
        params![project_id],
        |r| r.get(0),
    )?;

    tx.execute(
        "INSERT INTO ai_plan_runs
             (project_id, template_slug, prompt_sent, raw_response, parsed_ok,
              phases_count, tasks_count, risks_count)
         VALUES (?1, 'project_planning_v1', ?2, ?3, 1, ?4, ?5, ?6)",
        params![
            project_id,
            prompt_sent,
            raw_response,
            phases_arr.len() as i64,
            tasks_imported as i64,
            risks_arr.len() as i64,
        ],
    )?;

    tx.commit()?;

    Ok(ImportPlanResult {
        phases_imported: phases_arr.len(),
        tasks_imported,
        risks_imported: risks_arr.len(),
        assumptions_imported: assumptions_arr.len(),
        preserved_task_count,
    })
}

// ── Planning: Plan read / status updates ──────────────────────────────────────

fn row_to_phase(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectPhase> {
    Ok(ProjectPhase {
        id: row.get(0)?,
        project_id: row.get(1)?,
        phase_number: row.get(2)?,
        name: row.get(3)?,
        description: row.get(4)?,
        goals: row.get(5)?,
        estimated_duration: row.get(6)?,
        depends_on_phase: row.get(7)?,
        status: row.get(8)?,
        ai_generated: row.get::<_, i64>(9)? != 0,
        user_modified: row.get::<_, i64>(10)? != 0,
        created_at: row.get(11)?,
    })
}

fn row_to_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectTask> {
    Ok(ProjectTask {
        id: row.get(0)?,
        project_id: row.get(1)?,
        phase_id: row.get(2)?,
        title: row.get(3)?,
        description: row.get(4)?,
        category: row.get(5)?,
        effort_estimate: row.get(6)?,
        status: row.get(7)?,
        sort_order: row.get(8)?,
        ai_generated: row.get::<_, i64>(9)? != 0,
        user_modified: row.get::<_, i64>(10)? != 0,
        created_at: row.get(11)?,
        progress_note: row.get::<_, Option<String>>(12)?.unwrap_or_default(),
        started_at: row.get(13)?,
        completed_at: row.get(14)?,
        last_worked_at: row.get(15)?,
    })
}

fn row_to_risk(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectRisk> {
    Ok(ProjectRisk {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        likelihood: row.get(4)?,
        impact: row.get(5)?,
        mitigation: row.get(6)?,
        status: row.get(7)?,
        ai_generated: row.get::<_, i64>(8)? != 0,
        created_at: row.get(9)?,
    })
}

fn row_to_assumption(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectAssumption> {
    Ok(ProjectAssumption {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        category: row.get(4)?,
        status: row.get(5)?,
        ai_generated: row.get::<_, i64>(6)? != 0,
        created_at: row.get(7)?,
    })
}

fn row_to_ai_plan_run(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiPlanRun> {
    Ok(AiPlanRun {
        id: row.get(0)?,
        project_id: row.get(1)?,
        template_slug: row.get(2)?,
        parsed_ok: row.get::<_, i64>(3)? != 0,
        error_message: row.get(4)?,
        phases_count: row.get(5)?,
        tasks_count: row.get(6)?,
        risks_count: row.get(7)?,
        created_at: row.get(8)?,
    })
}

pub fn fetch_project_plan(conn: &Connection, project_id: i64) -> Result<ProjectPlan> {
    let mut phase_stmt = conn.prepare(
        "SELECT id, project_id, phase_number, name, description, goals,
                estimated_duration, depends_on_phase, status, ai_generated, user_modified, created_at
         FROM project_phases
         WHERE project_id = ?1
         ORDER BY phase_number ASC",
    )?;
    let phases: Vec<ProjectPhase> = phase_stmt
        .query_map(params![project_id], row_to_phase)?
        .collect::<Result<Vec<_>>>()?;

    let mut task_stmt = conn.prepare(
        "SELECT id, project_id, phase_id, title, description, category,
                effort_estimate, status, sort_order, ai_generated, user_modified, created_at,
                progress_note, started_at, completed_at, last_worked_at
         FROM project_tasks
         WHERE project_id = ?1
         ORDER BY phase_id ASC NULLS LAST, sort_order ASC",
    )?;
    let tasks: Vec<ProjectTask> = task_stmt
        .query_map(params![project_id], row_to_task)?
        .collect::<Result<Vec<_>>>()?;

    let mut risk_stmt = conn.prepare(
        "SELECT id, project_id, title, description, likelihood, impact,
                mitigation, status, ai_generated, created_at
         FROM project_risks
         WHERE project_id = ?1
         ORDER BY id ASC",
    )?;
    let risks: Vec<ProjectRisk> = risk_stmt
        .query_map(params![project_id], row_to_risk)?
        .collect::<Result<Vec<_>>>()?;

    let mut assumption_stmt = conn.prepare(
        "SELECT id, project_id, title, description, category, status, ai_generated, created_at
         FROM project_assumptions
         WHERE project_id = ?1
         ORDER BY id ASC",
    )?;
    let assumptions: Vec<ProjectAssumption> = assumption_stmt
        .query_map(params![project_id], row_to_assumption)?
        .collect::<Result<Vec<_>>>()?;

    Ok(ProjectPlan { phases, tasks, risks, assumptions })
}

pub fn update_task_status_record(
    conn: &Connection,
    task_id: i64,
    status: &str,
) -> Result<ProjectTask> {
    match status {
        "in_progress" => conn.execute(
            "UPDATE project_tasks SET status = ?1, user_modified = 1,
             started_at = COALESCE(started_at, strftime('%Y-%m-%dT%H:%M:%SZ','now')),
             last_worked_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
             WHERE id = ?2",
            params![status, task_id],
        )?,
        "done" => conn.execute(
            "UPDATE project_tasks SET status = ?1, user_modified = 1,
             completed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'),
             last_worked_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
             WHERE id = ?2",
            params![status, task_id],
        )?,
        "paused" | "blocked" => conn.execute(
            "UPDATE project_tasks SET status = ?1, user_modified = 1,
             last_worked_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
             WHERE id = ?2",
            params![status, task_id],
        )?,
        _ => conn.execute(
            "UPDATE project_tasks SET status = ?1, user_modified = 1,
             completed_at = NULL WHERE id = ?2",
            params![status, task_id],
        )?,
    };
    conn.query_row(
        "SELECT id, project_id, phase_id, title, description, category,
                effort_estimate, status, sort_order, ai_generated, user_modified, created_at,
                progress_note, started_at, completed_at, last_worked_at
         FROM project_tasks WHERE id = ?1",
        params![task_id],
        row_to_task,
    )
}

pub fn update_task_progress_note_record(
    conn: &Connection,
    task_id: i64,
    note: &str,
) -> Result<ProjectTask> {
    conn.execute(
        "UPDATE project_tasks SET progress_note = ?1, user_modified = 1,
         last_worked_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE id = ?2",
        params![note, task_id],
    )?;
    conn.query_row(
        "SELECT id, project_id, phase_id, title, description, category,
                effort_estimate, status, sort_order, ai_generated, user_modified, created_at,
                progress_note, started_at, completed_at, last_worked_at
         FROM project_tasks WHERE id = ?1",
        params![task_id],
        row_to_task,
    )
}

pub fn update_phase_status_record(
    conn: &Connection,
    phase_id: i64,
    status: &str,
) -> Result<ProjectPhase> {
    conn.execute(
        "UPDATE project_phases SET status = ?1, user_modified = 1 WHERE id = ?2",
        params![status, phase_id],
    )?;
    conn.query_row(
        "SELECT id, project_id, phase_number, name, description, goals,
                estimated_duration, depends_on_phase, status, ai_generated, user_modified, created_at
         FROM project_phases WHERE id = ?1",
        params![phase_id],
        row_to_phase,
    )
}

pub fn fetch_in_progress_tasks(conn: &Connection) -> Result<Vec<InProgressTask>> {
    let mut stmt = conn.prepare(
        "SELECT pt.id, pt.project_id, p.name, pt.title, pt.category, pt.status
         FROM project_tasks pt
         JOIN projects p ON p.id = pt.project_id
         WHERE pt.status IN ('in_progress', 'paused', 'blocked')
         ORDER BY p.name ASC, pt.sort_order ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(InProgressTask {
            id: row.get(0)?,
            project_id: row.get(1)?,
            project_name: row.get(2)?,
            title: row.get(3)?,
            category: row.get(4)?,
            status: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn fetch_ai_plan_runs(conn: &Connection, project_id: i64) -> Result<Vec<AiPlanRun>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, template_slug, parsed_ok, error_message,
                phases_count, tasks_count, risks_count, created_at
         FROM ai_plan_runs
         WHERE project_id = ?1
         ORDER BY created_at DESC
         LIMIT 20",
    )?;
    let rows = stmt.query_map(params![project_id], row_to_ai_plan_run)?;
    rows.collect()
}

// ── Claude session management ──────────────────────────────────────────────────

/// Generate a UUID v4 using SQLite's randomblob for entropy.
fn generate_session_uuid(conn: &Connection) -> Result<String> {
    conn.query_row(
        "SELECT lower(hex(randomblob(4))) || '-' ||
                lower(hex(randomblob(2))) || '-4' ||
                lower(substr(hex(randomblob(2)),2)) || '-' ||
                case (abs(random()) % 4)
                    when 0 then '8' when 1 then '9' when 2 then 'a' else 'b'
                end ||
                lower(substr(hex(randomblob(2)),2)) || '-' ||
                lower(hex(randomblob(6)))",
        [],
        |r| r.get::<_, String>(0),
    )
}

/// Return the existing claude_session_id for a project, or create and persist
/// a fresh UUID if none exists yet. Idempotent.
pub fn ensure_project_session_id(conn: &Connection, project_id: i64) -> Result<String> {
    let current: String = conn.query_row(
        "SELECT claude_session_id FROM projects WHERE id = ?1",
        params![project_id],
        |r| r.get(0),
    )?;
    if !current.is_empty() {
        return Ok(current);
    }
    let new_id = generate_session_uuid(conn)?;
    conn.execute(
        "UPDATE projects SET claude_session_id = ?1 WHERE id = ?2",
        params![new_id, project_id],
    )?;
    Ok(new_id)
}

/// Clear the stored session UUID so the next session starts a fresh conversation.
pub fn clear_project_session_id(conn: &Connection, project_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE projects SET claude_session_id = '' WHERE id = ?1",
        params![project_id],
    )?;
    Ok(())
}

/// Build the project opener prompt from live project fields and docs.
/// Used as the first message when starting a Claude session.
pub fn assemble_opener_prompt(conn: &Connection, project_id: i64) -> Result<String> {
    let project = fetch_project(conn, project_id)?;

    // Prefer ai_instructions doc if it has been meaningfully filled in
    let ai_instructions: Option<String> = conn
        .query_row(
            "SELECT content FROM project_documents
             WHERE project_id = ?1 AND doc_type = 'ai_instructions'",
            params![project_id],
            |r| r.get::<_, String>(0),
        )
        .ok()
        .filter(|s| s.trim().len() > 50); // only use if substantive

    // Fetch active and upcoming tasks for session context
    let mut task_stmt = conn.prepare(
        "SELECT id, project_id, phase_id, title, description, category,
                effort_estimate, status, sort_order, ai_generated, user_modified, created_at,
                progress_note, started_at, completed_at, last_worked_at
         FROM project_tasks
         WHERE project_id = ?1 AND status IN ('in_progress', 'paused', 'blocked', 'pending')
         ORDER BY
           CASE status WHEN 'in_progress' THEN 0 WHEN 'paused' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END,
           sort_order ASC
         LIMIT 20",
    )?;
    let tasks: Vec<ProjectTask> = task_stmt
        .query_map(params![project_id], row_to_task)?
        .collect::<Result<Vec<_>>>()?;

    Ok(build_opener_text(&project, ai_instructions.as_deref(), &tasks))
}

// ── App settings ──────────────────────────────────────────────────────────────

pub fn get_setting(conn: &Connection, key: &str) -> Result<String> {
    match conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |r| r.get::<_, String>(0),
    ) {
        Ok(v) => Ok(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(String::new()),
        Err(e) => Err(e),
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_all_settings(conn: &Connection) -> Result<std::collections::HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM app_settings")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        let (k, v) = row?;
        map.insert(k, v);
    }
    Ok(map)
}

fn build_opener_text(project: &Project, ai_instructions: Option<&str>, tasks: &[ProjectTask]) -> String {
    let mut parts: Vec<String> = Vec::new();

    // Project identity
    parts.push(format!("# Project: {}", project.name));
    if !project.description.is_empty() {
        parts.push(project.description.clone());
    }

    // Current work (legacy free-text fields)
    let mut work: Vec<String> = Vec::new();
    if !project.current_task.is_empty() {
        work.push(format!("**Working on:** {}", project.current_task));
    }
    if !project.next_task.is_empty() {
        work.push(format!("**Next up:** {}", project.next_task));
    }
    if !project.blocker.is_empty() {
        work.push(format!("**Blocker:** {}", project.blocker));
    }
    if !work.is_empty() {
        parts.push(format!("## Right Now\n\n{}", work.join("\n")));
    }

    // Task list (structured planning tasks)
    let active: Vec<&ProjectTask> = tasks
        .iter()
        .filter(|t| matches!(t.status.as_str(), "in_progress" | "paused" | "blocked"))
        .collect();
    let pending: Vec<&ProjectTask> = tasks
        .iter()
        .filter(|t| t.status == "pending")
        .take(5)
        .collect();

    if !active.is_empty() || !pending.is_empty() {
        let mut lines: Vec<String> = Vec::new();
        if !active.is_empty() {
            lines.push("**Active tasks:**".to_string());
            for t in &active {
                let label = match t.status.as_str() {
                    "in_progress" => "▶ In progress",
                    "paused"      => "⏸ Paused",
                    "blocked"     => "⊘ Blocked",
                    _             => &t.status,
                };
                let note = if t.progress_note.is_empty() {
                    String::new()
                } else {
                    format!(" — {}", t.progress_note)
                };
                lines.push(format!("- [{}] {}{}", label, t.title, note));
            }
        }
        if !pending.is_empty() {
            if !active.is_empty() { lines.push(String::new()); }
            lines.push("**Up next:**".to_string());
            for t in &pending {
                lines.push(format!("- {}", t.title));
            }
        }
        parts.push(format!("## Tasks\n\n{}", lines.join("\n")));
    }

    // Instructions: project-specific startup prompt takes priority, then ai_instructions doc
    let instructions: Option<&str> = if !project.claude_startup_prompt.is_empty() {
        Some(&project.claude_startup_prompt)
    } else {
        ai_instructions
    };
    if let Some(instr) = instructions {
        parts.push(format!("## Project Instructions\n\n{}", instr));
    }

    // Priority files
    if !project.claude_priority_files.is_empty() {
        parts.push(format!("## Key Files\n\n{}", project.claude_priority_files));
    }

    // Session handoff notes (the short per-project field, not the full doc)
    if !project.session_handoff_notes.is_empty() {
        parts.push(format!("## Session Notes\n\n{}", project.session_handoff_notes));
    }

    parts.push(
        "## Task Status Hints\n\n\
         If during this session you believe a task status has changed, you may optionally \
         emit a structured hint on its own line at the very end of your response:\n\n  \
         [task: \"partial task title\" -> done]\n  \
         [task: \"partial task title\" -> paused]\n\n\
         The app will parse this and prompt the user to confirm before updating anything. \
         Only emit when reasonably confident. Do not guess or emit hints for tasks you \
         have not actively worked on. Malformed or missing hints are silently ignored."
            .to_string(),
    );

    parts.push(
        "---\n\nPlease confirm you've read this context. \
         List any active tasks you see, note their progress, and ask whether I want to \
         continue one or start something new."
            .to_string(),
    );

    parts.join("\n\n")
}
