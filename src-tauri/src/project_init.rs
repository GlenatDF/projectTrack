use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Emitter;

use crate::db::{self, CreateProject};

/// Version of the generated project scaffold (docs + skills template).
/// Bump this whenever the output changes meaningfully so generated projects
/// can be compared against the version that created them.
const SCAFFOLD_VERSION: &str = "2.0.0";

// ── Progress event ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct ProgressEvent {
    pub step:   String, // step identifier — matches frontend step IDs
    pub label:  String, // human-readable label
    pub status: String, // "running" | "done" | "error"
}

const EVENT: &str = "project-init-progress";

fn emit(app: &tauri::AppHandle, step: &str, label: &str, status: &str) {
    let _ = app.emit(EVENT, ProgressEvent {
        step:   step.to_string(),
        label:  label.to_string(),
        status: status.to_string(),
    });
}

/// Public wrapper so other modules (e.g. commands.rs) can emit project-init
/// progress events without duplicating the event name or struct.
pub fn emit_progress(app: &tauri::AppHandle, step: &str, label: &str, status: &str) {
    emit(app, step, label, status);
}

// ── Request / Response ─────────────────────────────────────────────────────────

fn default_template_mode() -> String { "standard".to_string() }

/// Normalise the project level to one of three canonical values.
///
/// Accepts old names for backwards compatibility:
///   "small"  → "bare_bones"
///   "full"   → "fuller"
/// Any other string (including "") → "standard"
pub fn normalise_level(s: &str) -> &'static str {
    match s {
        "bare_bones" | "small" => "bare_bones",
        "fuller"     | "full"  => "fuller",
        _                      => "standard",
    }
}

/// Returns the relative file paths that would be created for the given level.
///
/// This is a pure function — no I/O — used in tests and by the future
/// `scaffold_from_github_template` command to know what extras to write after clone.
#[allow(dead_code)]
pub fn file_paths_for_level(level: &str, with_skills: bool) -> Vec<&'static str> {
    let level = normalise_level(level);
    let mut paths: Vec<&'static str> = vec![
        "CLAUDE.md",
        "README.md",
        "docs/BRIEF.md",
        "docs/TASKS.md",
        "docs/STAGE.md",
    ];
    if level != "bare_bones" {
        paths.extend_from_slice(&[
            "docs/REQUIREMENTS.md",
            "docs/TECHNICAL.md",
            "docs/DECISIONS.md",
            "docs/SESSIONS.md",
            "docs/RISKS.md",
        ]);
    }
    if level == "fuller" {
        paths.push("docs/ARCHITECTURE.md");
    }
    if with_skills {
        paths.extend_from_slice(&[
            ".claude/skills/feature-chunking/SKILL.md",
            ".claude/skills/testing-discipline/SKILL.md",
        ]);
        if level != "bare_bones" {
            paths.extend_from_slice(&[
                ".claude/skills/project-kickoff/SKILL.md",
                ".claude/skills/debug/SKILL.md",
                ".claude/skills/ui-readability/SKILL.md",
                ".claude/skills/frontend/SKILL.md",
            ]);
        }
        if level == "fuller" {
            paths.push(".claude/skills/performance/SKILL.md");
        }
    }
    paths
}

#[derive(Debug, Deserialize)]
pub struct ProjectInitRequest {
    pub name: String,
    pub description: String,
    pub project_type: String,
    pub main_goal: String,
    pub starter_template: String,
    pub add_ons: Vec<String>,
    pub constraints: String,
    pub coding_style: String,
    pub ui_style: String,
    pub create_git_repo: bool,
    pub create_claude_skills: bool,
    /// "bare_bones" | "standard" | "fuller" — defaults to "standard" if omitted.
    /// Old values "small" and "full" are still accepted and normalised.
    #[serde(default = "default_template_mode")]
    pub template_mode: String,
}

#[derive(Debug, Serialize)]
pub struct ProjectInitResult {
    pub project_id: i64,
    pub project_path: String,
    pub files_created: Vec<String>,
}

// ── Docs + skills helper (reusable from other commands) ────────────────────────

/// Write all markdown docs and optional Claude skills into `project_dir`.
/// Emits "docs" and "skills" progress events. Returns the list of relative
/// file paths created.
///
/// If `claude_md_override` is Some, it is used as the CLAUDE.md content instead
/// of the auto-generated template. Supports `{{project_name}}` and
/// `{{project_description}}` placeholders which are substituted before writing.
pub fn write_docs_and_skills(
    project_dir: &std::path::Path,
    req: &ProjectInitRequest,
    app: &tauri::AppHandle,
    claude_md_override: Option<String>,
) -> Result<Vec<String>, String> {
    let mut files_created: Vec<String> = Vec::new();

    emit(app, "docs", "Generating markdown docs", "running");
    let today = today_iso();
    let level = normalise_level(req.template_mode.as_str());
    let slug = slugify(&req.name);
    let stack = template_label(&req.starter_template);
    let app_type = project_type_label(&req.project_type);

    let claude_md = match claude_md_override {
        Some(tpl) if !tpl.trim().is_empty() => tpl
            // New uppercase tokens
            .replace("{{PROJECT_NAME}}", &req.name)
            .replace("{{PROJECT_SLUG}}", &slug)
            .replace("{{PROJECT_DESC}}", &req.description)
            .replace("{{PRIMARY_STACK}}", stack)
            .replace("{{APP_TYPE}}", app_type)
            .replace("{{PROJECT_DATE}}", &today)
            // Legacy lowercase tokens (backwards compat)
            .replace("{{project_name}}", &req.name)
            .replace("{{project_description}}", &req.description),
        _ => tmpl_claude_md(req, level),
    };

    // Base docs — all levels
    let mut doc_list: Vec<(&str, String)> = vec![
        ("CLAUDE.md",      claude_md),
        ("README.md",      tmpl_readme(req, level)),
        ("docs/BRIEF.md",  tmpl_brief(req, level)),
        ("docs/TASKS.md",  tmpl_tasks(req, level)),
        ("docs/STAGE.md",  tmpl_project_stage(&today, level)),
    ];

    // Standard + fuller docs
    if level != "bare_bones" {
        doc_list.push(("docs/REQUIREMENTS.md", tmpl_prd(req, &today)));
        doc_list.push(("docs/TECHNICAL.md",    tmpl_tech_spec(req, &today)));
        doc_list.push(("docs/DECISIONS.md",    tmpl_decision_log(req, &today)));
        doc_list.push(("docs/SESSIONS.md",     tmpl_session_log()));
        doc_list.push(("docs/RISKS.md",        tmpl_risks(req)));
    }

    // Fuller-only docs
    if level == "fuller" {
        doc_list.push(("docs/ARCHITECTURE.md", tmpl_architecture(req)));
    }

    for (name, content) in &doc_list {
        if let Err(e) = write_file(project_dir, name, content) {
            emit(app, "docs", "Generating markdown docs", "error");
            return Err(e);
        }
        files_created.push(name.to_string());
    }
    emit(app, "docs", "Generating markdown docs", "done");

    if req.create_claude_skills {
        emit(app, "skills", "Generating Claude skills", "running");

        // Base skills — all levels
        let mut skill_list: Vec<(&str, String)> = vec![
            (".claude/skills/feature-chunking/SKILL.md",   skill_feature_chunking()),
            (".claude/skills/testing-discipline/SKILL.md", skill_testing_discipline()),
        ];

        // Standard + fuller skills
        if level != "bare_bones" {
            skill_list.push((".claude/skills/project-kickoff/SKILL.md",  skill_project_kickoff()));
            skill_list.push((".claude/skills/debug/SKILL.md",            skill_debug()));
            skill_list.push((".claude/skills/ui-readability/SKILL.md",   skill_ui_readability()));
            skill_list.push((".claude/skills/frontend/SKILL.md",         skill_frontend()));
        }

        // Fuller-only skills
        if level == "fuller" {
            skill_list.push((".claude/skills/performance/SKILL.md", skill_performance()));
        }

        for (path, content) in &skill_list {
            if let Err(e) = write_file(project_dir, path, content) {
                emit(app, "skills", "Generating Claude skills", "error");
                return Err(e);
            }
            files_created.push(path.to_string());
        }
        emit(app, "skills", "Generating Claude skills", "done");
    }

    Ok(files_created)
}

// ── Entry point ────────────────────────────────────────────────────────────────

pub fn init_project(
    conn: &Connection,
    req: ProjectInitRequest,
    app: &tauri::AppHandle,
) -> Result<ProjectInitResult, String> {
    // 1. Create project folder
    emit(app, "folder", "Creating project folder", "running");

    let claude_md_template = db::get_setting(conn, "claude_md_template").ok()
        .filter(|s| !s.trim().is_empty());

    let projects_dir_raw = db::get_setting(conn, "projects_dir").unwrap_or_default();
    let base = if projects_dir_raw.trim().is_empty() {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join("Projects")
    } else {
        expand_tilde(&projects_dir_raw)
    };

    let slug = slugify(&req.name);
    if slug.is_empty() {
        emit(app, "folder", "Creating project folder", "error");
        return Err("Project name produces an empty directory name".to_string());
    }

    let project_dir = base.join(&slug);
    if project_dir.exists() {
        emit(app, "folder", "Creating project folder", "error");
        return Err(format!(
            "Directory already exists: {}",
            project_dir.display()
        ));
    }

    if let Err(e) = std::fs::create_dir_all(&project_dir) {
        emit(app, "folder", "Creating project folder", "error");
        return Err(format!("Failed to create project directory: {e}"));
    }
    emit(app, "folder", "Creating project folder", "done");

    let mut files_created: Vec<String> = Vec::new();

    // 2+3. Write docs and skills
    let doc_files = write_docs_and_skills(&project_dir, &req, app, claude_md_template)?;
    files_created.extend(doc_files);

    // 4. Initialise git repo
    if req.create_git_repo {
        emit(app, "git", "Initialising git repo", "running");

        if let Err(e) = write_file(&project_dir, ".gitignore", ".DS_Store\nnode_modules/\n.env.local\n.env\n") {
            emit(app, "git", "Initialising git repo", "error");
            return Err(e);
        }
        files_created.push(".gitignore".to_string());

        let init = Command::new("git")
            .args(["init"])
            .current_dir(&project_dir)
            .output()
            .map_err(|e| format!("Failed to run git init: {e}"))?;

        if !init.status.success() {
            emit(app, "git", "Initialising git repo", "error");
            return Err(format!(
                "git init failed: {}",
                String::from_utf8_lossy(&init.stderr)
            ));
        }

        let _ = Command::new("git")
            .args(["add", "-A"])
            .current_dir(&project_dir)
            .output();

        let _ = Command::new("git")
            .args(["commit", "-m", "Initial project structure"])
            .current_dir(&project_dir)
            .output();

        emit(app, "git", "Initialising git repo", "done");
    }

    // 5. Save to DB
    emit(app, "database", "Saving to database", "running");
    let goal_note = if req.main_goal.trim().is_empty() {
        String::new()
    } else {
        format!("Goal: {}", req.main_goal)
    };

    let create = CreateProject {
        name:                  req.name.clone(),
        description:           req.description.clone(),
        local_repo_path:       project_dir.to_string_lossy().to_string(),
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

    let project = db::insert_project(conn, create).map_err(|e| {
        emit(app, "database", "Saving to database", "error");
        e.to_string()
    })?;
    emit(app, "database", "Saving to database", "done");

    Ok(ProjectInitResult {
        project_id:   project.id,
        project_path: project_dir.to_string_lossy().to_string(),
        files_created,
    })
}

// ── Utilities ──────────────────────────────────────────────────────────────────

fn expand_tilde(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        let home = std::env::var("HOME").unwrap_or_default();
        PathBuf::from(home).join(rest)
    } else if path == "~" {
        PathBuf::from(std::env::var("HOME").unwrap_or_default())
    } else {
        PathBuf::from(path)
    }
}

fn slugify(name: &str) -> String {
    let mut result = String::new();
    let mut prev_dash = false;
    for c in name.chars() {
        if c.is_alphanumeric() {
            result.push(c.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !result.is_empty() {
            result.push('-');
            prev_dash = true;
        }
    }
    result.trim_end_matches('-').to_string()
}

fn write_file(dir: &Path, rel_path: &str, content: &str) -> Result<(), String> {
    let full = dir.join(rel_path);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory for {rel_path}: {e}"))?;
    }
    std::fs::write(&full, content)
        .map_err(|e| format!("Failed to write {rel_path}: {e}"))
}

fn today_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86400;
    // Howard Hinnant civil-calendar algorithm (days since 1970-01-01 → y/m/d)
    let z   = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y   = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp  = (5 * doy + 2) / 153;
    let d   = doy - (153 * mp + 2) / 5 + 1;
    let m   = if mp < 10 { mp + 3 } else { mp - 9 };
    let y   = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

fn add_ons_bullets(add_ons: &[String]) -> String {
    if add_ons.is_empty() {
        return "- None selected\n".to_string();
    }
    add_ons.iter().map(|a| format!("- {a}\n")).collect()
}


/// Returns `s` if non-empty, otherwise `fallback`.
fn opt<'a>(s: &'a str, fallback: &'a str) -> &'a str {
    if s.trim().is_empty() { fallback } else { s }
}

fn project_type_label(t: &str) -> &str {
    match t {
        "web_app"       => "Web app",
        "desktop_app"   => "Desktop app",
        "internal_tool" => "Internal tool",
        "api"           => "API / Service",
        "docs_site"     => "Docs site",
        _               => t,
    }
}

fn template_label(t: &str) -> &str {
    match t {
        "nextjs" => "Next.js (App Router + TypeScript)",
        "tauri"  => "Tauri (Rust + React + SQLite)",
        "react"  => "React (Vite + TypeScript)",
        "blank"  => "Blank (no template)",
        "docs"   => "Docs site (Nextra / MDX)",
        _        => t,
    }
}

// ── Markdown templates ─────────────────────────────────────────────────────────

fn tmpl_claude_md(r: &ProjectInitRequest, mode: &str) -> String {
    let mut s = String::new();
    s.push_str(&format!("# CLAUDE.md — {}\n\n", r.name));
    s.push_str("This file gives Claude Code context for this project.\n");
    s.push_str("Read this at the start of every session **before writing any code**.\n\n");
    s.push_str(&format!("_Generated by Launchpad scaffold v{SCAFFOLD_VERSION}_\n\n"));
    s.push_str("---\n\n");

    // Overview
    s.push_str("## Overview\n\n");
    s.push_str(&format!("{}\n\n", opt(&r.description, "_Add a one-line description of what this project is._")));
    s.push_str(&format!("**Type:** {}  \n", project_type_label(&r.project_type)));
    s.push_str(&format!("**Stack:** {}  \n", template_label(&r.starter_template)));
    s.push_str("**Stage:** See docs/STAGE.md\n\n");

    // Goal
    if !r.main_goal.trim().is_empty() {
        s.push_str("## Goal\n\n");
        s.push_str(&format!("{}\n\n", r.main_goal));
    }

    // Stack add-ons
    if !r.add_ons.is_empty() {
        s.push_str("## Add-ons / integrations\n\n");
        s.push_str(&add_ons_bullets(&r.add_ons));
        s.push('\n');
    }

    // Constraints
    if !r.constraints.trim().is_empty() {
        s.push_str("## Key constraints\n\n");
        s.push_str(&format!("{}\n\n", r.constraints));
    }

    // Preferences
    if !r.coding_style.trim().is_empty() || !r.ui_style.trim().is_empty() {
        s.push_str("## Preferences\n\n");
        if !r.coding_style.trim().is_empty() {
            s.push_str(&format!("**Coding style:** {}  \n", r.coding_style));
        }
        if !r.ui_style.trim().is_empty() {
            s.push_str(&format!("**UI style:** {}  \n", r.ui_style));
        }
        s.push('\n');
    }

    // Read this first
    s.push_str("## Read this first\n\n");
    s.push_str("At the start of every session, read in this order:\n\n");
    s.push_str("1. `docs/STAGE.md` — where the project is right now\n");
    s.push_str("2. `docs/BRIEF.md` — what the project is and why it exists\n");
    s.push_str("3. `docs/TASKS.md` — what needs doing next\n");
    if mode != "bare_bones" {
        s.push_str("\nIf you need more context, also read:\n\n");
        s.push_str("4. `docs/REQUIREMENTS.md` — what we are building\n");
        s.push_str("5. `docs/TECHNICAL.md` — how it is built\n");
        s.push_str("6. `docs/DECISIONS.md` — key decisions and rationale\n");
    }
    s.push_str("\nBefore making any changes:\n");
    s.push_str("- Check git status and review recent commits\n");
    s.push_str("- Summarise your understanding of the current state\n");
    s.push_str("- Propose next steps before starting work\n");
    s.push_str("- Do not edit files until asked\n\n");

    // Session workflow
    s.push_str("## Session workflow\n\n");
    s.push_str("**At the start of each session:**\n\n");
    s.push_str("1. Read the files listed above in order\n");
    s.push_str("2. Summarise the current state and any gaps you notice\n");
    s.push_str("3. Confirm the next task before writing code\n");
    s.push_str("4. Ask clarifying questions rather than guessing on scope\n\n");

    s.push_str("**During the session:**\n\n");
    s.push_str("- Check whether a relevant skill applies before starting a non-trivial task\n");
    s.push_str("- Make the smallest change that achieves the goal\n");
    s.push_str("- Keep changes focused and reviewable — one concern per edit\n");
    s.push_str("- Flag blockers immediately — do not work around them silently\n");
    s.push_str("- If uncertain about an architectural decision, say so and propose options\n\n");

    s.push_str("**At the end of each session:**\n\n");
    s.push_str("- Update docs/TASKS.md: mark completed tasks done, add anything newly discovered\n");
    s.push_str("- Update docs/STAGE.md if the phase or status has changed\n");
    if mode != "bare_bones" {
        s.push_str("- Log significant decisions to docs/DECISIONS.md with context and rationale\n");
        s.push_str("- Add a brief entry to docs/SESSIONS.md if useful\n");
    }
    s.push('\n');

    // Key files table
    s.push_str("## Key files\n\n");
    s.push_str("| File | Purpose |\n");
    s.push_str("|------|---------|\n");
    s.push_str("| CLAUDE.md | You are reading it — project context for Claude |\n");
    s.push_str("| docs/BRIEF.md | What this project is and why it exists |\n");
    s.push_str("| docs/TASKS.md | Living task list — keep this current |\n");
    s.push_str("| docs/STAGE.md | Current stage and what has been completed |\n");
    if mode != "bare_bones" {
        s.push_str("| docs/REQUIREMENTS.md | Feature requirements and acceptance criteria |\n");
        s.push_str("| docs/TECHNICAL.md | Architecture, stack, and technical decisions |\n");
        s.push_str("| docs/DECISIONS.md | Record of key decisions with context and rationale |\n");
        s.push_str("| docs/SESSIONS.md | Brief notes from each working session |\n");
        s.push_str("| docs/RISKS.md | Known risks, assumptions, and constraints |\n");
    }
    s.push('\n');

    // Testing standard
    s.push_str("## Testing standard\n\n");
    s.push_str("**Build passing is not the same as tested.**\n\n");
    s.push_str("When summarising any implementation chunk, always include a **\"Testing performed\"** section:\n\n");
    s.push_str("```\n");
    s.push_str("Testing performed\n");
    s.push_str("- Build/type checks:\n");
    s.push_str("    - [exact commands run]\n");
    s.push_str("- Manual testing:\n");
    s.push_str("    - [exact behaviours verified]\n");
    s.push_str("- Automated tests:\n");
    s.push_str("    - [tests added or run, or \"none\"]\n");
    s.push_str("- Limitations:\n");
    s.push_str("    - [what was not tested]\n");
    s.push_str("```\n\n");
    s.push_str("Rules:\n\n");
    s.push_str("1. Never say \"tested\" without specifying what kind and what was verified\n");
    s.push_str("2. Build checks confirm compilation only — they do not prove the feature works\n");
    s.push_str("3. If manual testing was not performed, say so explicitly\n");
    s.push_str("4. If no automated tests exist for this layer, say so — do not skip the section\n");
    s.push_str("5. For UI changes, check: happy path, validation, loading, success, error, disabled controls, light/dark mode\n");
    s.push_str("6. Add automated tests for pure logic/helpers where the test setup allows it\n\n");
    s.push_str("See `.claude/skills/testing-discipline/SKILL.md` for the full testing skill.\n\n");

    // UI always-on rules
    s.push_str("## UI — always-on rules\n\n");
    s.push_str("These apply any time you write or edit a UI component. No skill invocation needed.\n\n");
    s.push_str("1. **Check both modes.** Any coloured text must be readable in dark *and* light mode — not just the mode you are looking at.\n");
    s.push_str("2. **`text-*-100` through `text-*-400` are dark-mode-only pastels.** Never place them on a tinted background without confirming the variant is covered in the light-mode CSS override block. These classes look fine in dark mode and are invisible in light mode.\n");
    s.push_str("3. **Opacity-modifier classes bypass CSS overrides.** `text-red-500/70` generates a different selector than `text-red-500` — light-mode overrides will not catch it. Avoid opacity modifiers on text colour; use a darker base class instead.\n");
    s.push_str("4. **Selected and active states are the highest-risk spot.** Tinted highlight backgrounds make adjacent pale text nearly invisible. Use `text-slate-100` (which is overridden to dark in light mode) rather than a same-family pastel like `text-violet-200`.\n");
    s.push_str("5. **Check hover and focus state text colours too** — not just resting state. `hover:text-violet-300` is a pastel that can fail in light mode.\n");
    s.push_str("6. **Small text needs higher contrast.** The same colour that passes at `text-sm` can fail at `text-xs`. When in doubt, go one shade darker.\n");
    s.push_str("7. **Test at the largest zoom level the app supports.** Tight layouts and truncated text that look fine at 100% often break at 125–130%.\n\n");
    s.push_str("For a full readability review of a component, invoke the `ui-readability` skill.\n\n");

    // When to use skills
    s.push_str("## When to use skills\n\n");
    s.push_str("**This file (CLAUDE.md)** is for standing project context that applies to almost every task: ");
    s.push_str("overview, stack, key files, session workflow, and always-on working rules.\n\n");
    s.push_str("**Skills** (`.claude/skills/`) are for specific workflows or specialist review modes — ");
    s.push_str("things that only apply in certain situations. Read a skill when the task clearly calls for it. ");
    s.push_str("Do not assume every skill applies to every task.\n\n");
    s.push_str("Rules:\n");
    s.push_str("- Put permanent project rules in CLAUDE.md, not in skills\n");
    s.push_str("- Use skills for structured processes: feature planning, testing review, UI audit\n");
    s.push_str("- Keep the skill set small — a few genuinely useful ones beat a junk drawer\n");
    s.push_str("- Avoid duplicating the same instruction in both CLAUDE.md and a skill\n\n");

    if r.create_claude_skills {
        s.push_str("### Skills in this project\n\n");
        s.push_str("| Skill | When to use it |\n");
        s.push_str("|-------|----------------|\n");
        if mode != "bare_bones" {
            s.push_str("| `project-kickoff` | First session on the project — review docs, find gaps, establish a plan |\n");
        }
        s.push_str("| `feature-chunking` | Before any non-trivial feature — plan chunks first, implement one at a time |\n");
        s.push_str("| `testing-discipline` | When reporting the outcome of any implementation chunk |\n");
        if mode != "bare_bones" {
            s.push_str("| `debug` | When something is broken and two attempts have not fixed it |\n");
            s.push_str("| `ui-readability` | When building or reviewing UI components with colour, contrast, or hierarchy concerns |\n");
            s.push_str("| `frontend` | Any project with a user interface — component structure, API layer, TypeScript rules |\n");
        }
        s.push('\n');
    }

    // Dependency rules
    s.push_str("## Dependencies\n\n");
    s.push_str("**Before suggesting or adding any package, confirm all of the following:**\n\n");
    s.push_str("1. The package exists and the exact name is correct — check npmjs.com\n");
    s.push_str("2. It is from the intended maintainer — check download count, GitHub repo, recent releases\n");
    s.push_str("3. The project does not already have something that does the same job\n");
    s.push_str("4. You can explain in one sentence why it is needed\n\n");
    s.push_str("**Do not add a package just because an AI suggested it.** ");
    s.push_str("Verify it is real, correctly named, and appropriate before installing.\n\n");
    s.push_str("**npm hygiene (JS/TS projects):**\n\n");
    s.push_str("- Commit `package-lock.json` — it records exactly what was installed\n");
    s.push_str("- Use `npm ci` in CI and for reproducible installs (reads the lockfile strictly)\n");
    s.push_str("- Run `npm audit` regularly; treat high-severity findings as blockers\n");
    s.push_str("- Do not add `^` or `~` to package versions without a documented reason\n");
    s.push_str("- Avoid packages with `install` or `postinstall` scripts unless clearly justified\n");
    s.push_str("- Prefer built-in platform features or existing dependencies before adding new ones\n");
    s.push_str("- Use `overrides` in `package.json` to pin or block a bad transitive dependency\n\n");

    // Principles
    s.push_str("## Working principles\n\n");
    s.push_str("- Prefer clear, readable code over clever code\n");
    s.push_str("- Leave the code you touch better than you found it — but only what you touch\n");
    s.push_str("- When in doubt, ask — do not guess on architecture, scope, or user intent\n");
    s.push_str("- Keep documentation current: stale docs are worse than no docs\n");
    s.push_str("- Ship the smallest useful thing and iterate, rather than building everything at once\n");
    s.push_str("- If something feels wrong, it probably is — flag it before pressing on\n");

    s
}

fn tmpl_brief(r: &ProjectInitRequest, mode: &str) -> String {
    let mut s = String::new();
    s.push_str(&format!("# Project Brief — {}\n\n", r.name));

    if mode == "bare_bones" {
        s.push_str("---\n\n");

        s.push_str("## In one sentence\n\n");
        s.push_str(&format!("{}\n\n", opt(&r.description, "_Write a single sentence that describes this project clearly._")));

        s.push_str("## What is this project?\n\n");
        s.push_str(&format!("{}\n\n", opt(&r.description, "_What does it do? Why does it exist? What problem does it solve?_")));
        s.push_str(&format!("**Type:** {}  \n", project_type_label(&r.project_type)));
        s.push_str(&format!("**Template base:** {}  \n\n", template_label(&r.starter_template)));

        s.push_str("## Goal\n\n");
        s.push_str(&format!("{}\n\n", opt(&r.main_goal, "_The single most important outcome this project must deliver._")));

        s.push_str("## What does it NOT do?\n\n");
        s.push_str("_Define the scope boundary — what is explicitly out of scope for this version._\n\n");

        if !r.constraints.trim().is_empty() {
            s.push_str("## Constraints\n\n");
            s.push_str(&format!("{}\n\n", r.constraints));
        }

        return s;
    }

    // Standard / fuller — full template
    s.push_str("A concise overview of what this project is, why it exists, and what it must achieve.\n\n");
    s.push_str("---\n\n");

    s.push_str("## In one sentence\n\n");
    s.push_str(&format!("{}\n\n", opt(&r.description, "_Write a single sentence that describes this project clearly to someone who has never seen it._")));

    s.push_str("## What is this project?\n\n");
    s.push_str(&format!("{}\n\n", opt(&r.description, "_Expand on the one-liner above. What does it do? Why does it exist? What problem does it solve?_")));
    s.push_str(&format!("**Type:** {}  \n", project_type_label(&r.project_type)));
    s.push_str(&format!("**Template base:** {}  \n\n", template_label(&r.starter_template)));

    s.push_str("## Goal\n\n");
    s.push_str(&format!("{}\n\n", opt(&r.main_goal, "_Define the single most important outcome this project must deliver._")));

    s.push_str("## Who is it for?\n\n");
    s.push_str("_Describe the primary user or audience. Be specific — avoid \"anyone\" or \"everyone\"._\n\n");

    s.push_str("## What does it do?\n\n");
    s.push_str("_List the core things a user can do. Keep this focused on behaviour, not implementation._\n\n");
    s.push_str("- _[Primary action the user takes]_\n");
    s.push_str("- _[Second key capability]_\n");
    s.push_str("- _[Third key capability]_\n\n");

    s.push_str("## What does it NOT do?\n\n");
    s.push_str("_Define the scope boundary explicitly. This is as important as the above._\n\n");
    s.push_str("- _[Thing explicitly out of scope for this version]_\n");
    s.push_str("- _[Another deliberate omission]_\n\n");

    if !r.constraints.trim().is_empty() {
        s.push_str("## Key constraints\n\n");
        s.push_str(&format!("{}\n\n", r.constraints));
    } else {
        s.push_str("## Key constraints\n\n");
        s.push_str("_List any hard constraints: technical, business, time, regulatory._\n\n");
    }

    s.push_str("## Success criteria\n\n");
    s.push_str("This project is successful when:\n\n");
    s.push_str("- [ ] _[Specific, measurable outcome]_\n");
    s.push_str("- [ ] _[Another measurable outcome]_\n");
    s.push_str("- [ ] _[Final success condition]_\n\n");

    s.push_str("## Open questions\n\n");
    s.push_str("_Things that need an answer before or during development._\n\n");
    s.push_str("- _[Question 1]_\n");
    s.push_str("- _[Question 2]_\n");

    s
}

fn tmpl_prd(r: &ProjectInitRequest, today: &str) -> String {
    let mut s = String::new();
    s.push_str(&format!("# Requirements — {}\n\n", r.name));
    s.push_str(&format!("**Status:** Draft  \n**Last updated:** {today}\n\n---\n\n"));

    s.push_str("## Overview\n\n");
    s.push_str(&format!("{}\n\n", opt(&r.description, "_Describe the product at a high level._")));
    s.push_str(&format!("**Goal:** {}\n\n---\n\n", opt(&r.main_goal, "_State the primary goal._")));

    s.push_str("## Goals\n\n");
    s.push_str("What this version should achieve:\n\n");
    s.push_str(&format!("- {}\n", opt(&r.main_goal, "_[Primary goal — replace this]_")));
    s.push_str("- _[Secondary goal]_\n\n");

    s.push_str("## Non-goals\n\n");
    s.push_str("Explicitly out of scope:\n\n");
    s.push_str("- _[Feature or capability deliberately deferred]_\n");
    s.push_str("- _[Another out-of-scope item]_\n\n---\n\n");

    s.push_str("## Functional requirements\n\n");
    s.push_str("| ID | Requirement | Priority | Notes |\n");
    s.push_str("|----|-------------|----------|-------|\n");
    s.push_str("| F1 | _[Core feature or capability]_ | Must have | — |\n");
    s.push_str("| F2 | _[Important but not blocking]_ | Should have | — |\n");
    s.push_str("| F3 | _[Nice to have if time allows]_ | Could have | — |\n\n");

    s.push_str("## Non-functional requirements\n\n");
    s.push_str("| ID | Requirement | Target | Notes |\n");
    s.push_str("|----|-------------|--------|-------|\n");
    s.push_str("| N1 | Performance | _[e.g. page loads in < 2 s on average hardware]_ | — |\n");
    s.push_str("| N2 | Accessibility | _[e.g. WCAG AA where applicable]_ | — |\n");
    s.push_str("| N3 | Platform support | _[e.g. macOS 13+, Chrome/Firefox/Safari]_ | — |\n\n---\n\n");

    s.push_str("## Primary user flow\n\n");
    s.push_str("_Describe the main journey a user takes through the product._\n\n");
    s.push_str("1. User does _[action]_\n");
    s.push_str("2. System responds with _[behaviour]_\n");
    s.push_str("3. User sees _[result]_\n\n");

    s.push_str("## Acceptance criteria\n\n");
    s.push_str("The requirements are met when:\n\n");
    s.push_str("- [ ] _[Specific, testable criterion]_\n");
    s.push_str("- [ ] _[Another testable criterion]_\n");
    s.push_str("- [ ] _[Final acceptance condition]_\n\n---\n\n");

    s.push_str("## Open questions\n\n");
    s.push_str("| Question | Owner | Status |\n");
    s.push_str("|----------|-------|--------|\n");
    s.push_str("| _[Question that needs an answer before build starts]_ | — | Open |\n");

    s
}

fn tmpl_tech_spec(r: &ProjectInitRequest, today: &str) -> String {
    let mut s = String::new();
    s.push_str(&format!("# Technical Spec — {}\n\n", r.name));
    s.push_str(&format!("**Status:** Draft  \n**Last updated:** {today}\n\n---\n\n"));

    s.push_str("## Stack\n\n");
    s.push_str(&format!("**Template base:** {}\n\n", template_label(&r.starter_template)));
    s.push_str("**Add-ons / integrations:**\n\n");
    s.push_str(&add_ons_bullets(&r.add_ons));
    s.push('\n');

    if !r.coding_style.trim().is_empty() {
        s.push_str(&format!("**Coding style:** {}\n\n", r.coding_style));
    }
    if !r.ui_style.trim().is_empty() {
        s.push_str(&format!("**UI style:** {}\n\n", r.ui_style));
    }

    s.push_str("---\n\n## Architecture overview\n\n");
    s.push_str("_Describe the high-level structure. Replace the placeholder diagram with your actual architecture._\n\n");
    // Use raw string to avoid any format! confusion with curly braces
    s.push_str("```\n[User / Browser / OS]\n      |\n  [Frontend]\n      |\n  [Backend / API]\n      |\n  [Database / Storage]\n```\n\n");

    s.push_str("---\n\n## Key components\n\n");
    s.push_str("| Component | Responsibility | Technology |\n");
    s.push_str("|-----------|---------------|------------|\n");
    s.push_str("| _[e.g. UI layer]_ | _[What it does]_ | _[How it is built]_ |\n");
    s.push_str("| _[e.g. API layer]_ | _[What it does]_ | _[How it is built]_ |\n");
    s.push_str("| _[e.g. Data layer]_ | _[What it does]_ | _[How it is built]_ |\n\n");

    s.push_str("---\n\n## Data model\n\n");
    s.push_str("_Define the core entities and their relationships. Update this as the model solidifies._\n\n");
    s.push_str("### Core entities\n\n");
    s.push_str("_Add your main data entities here with their key fields._\n\n");
    s.push_str("---\n\n## API / Interface contracts\n\n");
    s.push_str("_Document the primary interfaces between components._\n\n");
    s.push_str("_For a REST API: list the key endpoints, their request shape, and response shape._  \n");
    s.push_str("_For a library: list the public interface._  \n");
    s.push_str("_For a desktop app: list the backend command API (e.g. Tauri commands)._\n\n");

    s.push_str("---\n\n## Non-functional requirements\n\n");
    s.push_str("| Concern | Target | Approach |\n");
    s.push_str("|---------|--------|----------|\n");
    s.push_str("| Performance | _[Target]_ | _[How we will meet it]_ |\n");
    s.push_str("| Security | _[Target]_ | _[How we will meet it]_ |\n");
    s.push_str("| Reliability | _[Target]_ | _[How we will meet it]_ |\n\n");

    if !r.constraints.trim().is_empty() {
        s.push_str("---\n\n## Key constraints\n\n");
        s.push_str(&format!("{}\n\n", r.constraints));
    }

    s.push_str("---\n\n## Key decisions\n\n");
    s.push_str("See docs/DECISIONS.md for full decision history with context and rationale.\n");

    s
}

fn tmpl_tasks(r: &ProjectInitRequest, mode: &str) -> String {
    let mut s = String::new();
    s.push_str(&format!("# Tasks — {}\n\n", r.name));
    s.push_str("This is the living task list. Keep it current as work progresses.\n\n");
    s.push_str("**Status legend:**\n");
    s.push_str("- `[ ]` Not started\n");
    s.push_str("- `[~]` In progress\n");
    s.push_str("- `[x]` Done\n");
    s.push_str("- `[-]` Skipped or will not do\n\n---\n\n");

    s.push_str("## Phase 1 — Setup and planning\n\n");
    if mode == "bare_bones" {
        s.push_str("- [ ] Read docs/BRIEF.md and fill in the description, goal, and scope\n");
    } else {
        s.push_str("- [ ] Read all generated docs and fill in the gaps (docs/BRIEF.md, docs/REQUIREMENTS.md, docs/TECHNICAL.md)\n");
        s.push_str("- [ ] Confirm the architecture approach in docs/TECHNICAL.md\n");
        s.push_str("- [ ] Define the core data model\n");
        s.push_str("- [ ] List the first 3–5 user-facing requirements in docs/REQUIREMENTS.md\n");
    }
    s.push_str("- [ ] Set up the development environment\n");
    if r.starter_template != "blank" {
        s.push_str(&format!("- [ ] Verify the {} template builds and runs cleanly\n", template_label(&r.starter_template)));
    }
    s.push('\n');

    if mode == "bare_bones" {
        s.push_str("## Build tasks\n\n");
        s.push_str("Add tasks here as the work becomes clear. Break each feature into the smallest useful step.\n\n");
    } else {
        s.push_str("## Phase 2 — Core build\n\n");
        s.push_str("_Break each feature into the smallest useful steps. Add tasks as they become clear._\n\n");
        s.push_str("- [ ] _[Feature 1 — step 1]_\n");
        s.push_str("- [ ] _[Feature 1 — step 2]_\n");
        s.push_str("- [ ] _[Feature 2 — step 1]_\n\n");
    }

    s.push_str("## Phase 3 — Polish and ship\n\n");
    if mode != "bare_bones" {
        s.push_str("- [ ] Verify all requirements from docs/REQUIREMENTS.md are met\n");
    }
    s.push_str("- [ ] Test primary and secondary user flows end-to-end\n");
    s.push_str("- [ ] Review readability, accessibility, and error states\n");
    s.push_str("- [ ] Update README.md with accurate setup and usage instructions\n");
    if mode != "bare_bones" {
        s.push_str("- [ ] Confirm docs/DECISIONS.md and docs/SESSIONS.md are up to date\n");
    }
    s.push('\n');

    s.push_str("---\n\n## Backlog\n\n");
    if mode == "bare_bones" {
        s.push_str("_Add ideas and future tasks as they come up._\n");
    } else {
        s.push_str("_Ideas and future tasks that are not yet prioritised:_\n\n");
        s.push_str("- _[Idea]_\n");
    }

    s
}

fn tmpl_decision_log(r: &ProjectInitRequest, today: &str) -> String {
    let mut s = String::new();
    s.push_str(&format!("# Decisions — {}\n\n", r.name));
    s.push_str("Record key technical and product decisions here so future contributors\n");
    s.push_str("(and future you) understand why things are the way they are.\n\n");
    s.push_str("---\n\n## When to log a decision\n\n");
    s.push_str("- Choosing between two or more technical approaches\n");
    s.push_str("- Adopting or dropping a dependency, library, or tool\n");
    s.push_str("- Changing the data model or an API contract\n");
    s.push_str("- Deferring something intentionally (with a reason)\n");
    s.push_str("- Anything that prompted discussion before committing to an approach\n\n");
    s.push_str("---\n\n## Format\n\n");
    s.push_str("### YYYY-MM-DD — Title of the decision\n\n");
    s.push_str("**Context:** Why this decision was needed. What problem were we solving?\n\n");
    s.push_str("**Decision:** What was decided and why.\n\n");
    s.push_str("**Alternatives considered:** What else was on the table and why it was not chosen.\n\n");
    s.push_str("**Consequences:** What this means going forward. Trade-offs accepted.\n\n");
    s.push_str("---\n\n## Log\n\n");

    // First entry: project creation decision
    s.push_str(&format!("### {} — Project initialised with {} template\n\n", today, template_label(&r.starter_template)));
    s.push_str("**Context:**  \n");
    s.push_str(&format!("New project created: {}. Needed a starting point for development.\n\n", r.name));
    s.push_str("**Decision:**  \n");
    s.push_str(&format!("Use {} as the base. ", template_label(&r.starter_template)));
    if !r.add_ons.is_empty() {
        s.push_str(&format!("Add-ons selected: {}. ", r.add_ons.join(", ")));
    }
    if !r.constraints.trim().is_empty() {
        s.push_str(&format!("Key constraints: {}. ", r.constraints));
    }
    s.push_str("\n\n**Alternatives considered:**  \n");
    s.push_str("Other templates or starting from scratch without a template.\n\n");
    s.push_str("**Consequences:**  \n");
    s.push_str(&format!("Committed to the conventions and tooling of {}. ", template_label(&r.starter_template)));
    s.push_str("See docs/TECHNICAL.md for full stack details.\n");

    s
}

fn tmpl_session_log() -> String {
    let mut s = String::new();
    s.push_str("# Sessions\n\n");
    s.push_str("Brief notes from each working session. Keep entries short — a few bullet points is enough.\n\n");
    s.push_str("The goal is to be able to resume quickly after a break and to give Claude\n");
    s.push_str("useful context at the start of the next session.\n\n");
    s.push_str("---\n\n## Format\n\n");
    s.push_str("### YYYY-MM-DD\n\n");
    s.push_str("**Worked on:** _[Feature or task name]_\n\n");
    s.push_str("**Completed:**\n- _[Thing 1 finished]_\n- _[Thing 2 finished]_\n\n");
    s.push_str("**Blockers / open questions:**\n- _[Anything unresolved or that slowed progress]_\n\n");
    s.push_str("**Next session:**\n- _[The single most important thing to pick up next]_\n\n");
    s.push_str("---\n\n## Log\n\n");
    s.push_str("_Start logging from your first working session._\n");
    s
}

fn tmpl_risks(r: &ProjectInitRequest) -> String {
    let mut s = String::new();
    s.push_str("# Risks, Assumptions, and Dependencies\n\n");
    s.push_str("Keep this document updated as the project evolves. Knowing what you are assuming\n");
    s.push_str("and what could go wrong is more valuable than pretending everything is certain.\n\n");
    s.push_str("---\n\n## Risks\n\n");
    s.push_str("Things that could go wrong and affect the project's success.\n\n");
    s.push_str("| Risk | Likelihood | Impact | Mitigation |\n");
    s.push_str("|------|-----------|--------|------------|\n");
    s.push_str("| Scope expands beyond the original brief | Medium | High | Keep a clear non-goals list; review scope at the start of each phase |\n");
    s.push_str("| Key dependency changes its API or becomes unavailable | Low | High | Pin dependency versions; identify alternatives early |\n");
    s.push_str("| Technical approach turns out to be wrong | Low | Medium | Validate architecture with a small spike before full build |\n");
    s.push_str("| _[Add a project-specific risk]_ | — | — | — |\n\n");
    s.push_str("**Scale:** Likelihood and Impact are Low / Medium / High.\n\n");
    s.push_str("---\n\n## Assumptions\n\n");
    s.push_str("Things being treated as true without full verification.\n\n");
    s.push_str(&format!("- The {} template is appropriate for the scope of this project\n", template_label(&r.starter_template)));
    s.push_str("- Development will be done locally before any deployment or sharing\n");
    if !r.add_ons.is_empty() {
        for addon in &r.add_ons {
            s.push_str(&format!("- {} integration is compatible with the chosen template and does not introduce breaking constraints\n", addon));
        }
    }
    s.push_str("- _[Add project-specific assumptions]_\n\n");
    s.push_str("---\n\n## Dependencies\n\n");
    s.push_str("Things this project relies on that are outside direct control.\n\n");
    s.push_str("| Dependency | Type | Risk level | Notes |\n");
    s.push_str("|------------|------|------------|-------|\n");
    if !r.add_ons.is_empty() {
        for addon in &r.add_ons {
            s.push_str(&format!("| {} | Library / Service | Low | Version to be pinned |\n", addon));
        }
    }
    s.push_str("| _[Additional dependency]_ | _[Type]_ | — | — |\n");

    if !r.constraints.trim().is_empty() {
        s.push_str("\n---\n\n## Constraints\n\n");
        s.push_str(&format!("{}\n", r.constraints));
    }

    s
}

fn tmpl_project_stage(today: &str, level: &str) -> String {
    let mut s = String::new();
    s.push_str("# Project Stage\n\n");
    s.push_str("Track the current phase of the project and what has been completed.\n");
    s.push_str("Update this at the end of each phase or when something significant shifts.\n\n");
    s.push_str("---\n\n");
    s.push_str(&format!("## Current stage: Planning\n\n**Started:** {today}  \n"));
    s.push_str("**Target:** Setup complete and core build ready to begin\n\n");
    s.push_str("---\n\n## What has been done\n\n");
    s.push_str("- Project initialised with base documentation\n");
    if level == "bare_bones" {
        s.push_str("- CLAUDE.md, docs/BRIEF.md, docs/TASKS.md, docs/STAGE.md generated\n\n");
    } else {
        s.push_str("- CLAUDE.md, docs/BRIEF.md, docs/TASKS.md, and supporting docs generated\n\n");
    }
    s.push_str("## In progress\n\n");
    s.push_str("- Reviewing and filling in project documentation\n");
    if level != "bare_bones" {
        s.push_str("- Confirming architecture and technology choices\n");
    }
    s.push_str("\n## Up next\n\n");
    if level == "bare_bones" {
        s.push_str("- Fill in docs/BRIEF.md — define goal, audience, and scope boundary\n");
    } else {
        s.push_str("- Complete docs/TECHNICAL.md and docs/REQUIREMENTS.md\n");
    }
    s.push_str("- Begin Phase 1 tasks in docs/TASKS.md\n\n");
    s.push_str("## Blockers\n\n");
    s.push_str("- _None currently — update this if anything blocks progress_\n\n");
    s.push_str("---\n\n## Stage reference\n\n");
    s.push_str("| Stage | What it means |\n");
    s.push_str("|-------|---------------|\n");
    s.push_str("| Planning | Understanding the problem, defining requirements, setting up docs |\n");
    s.push_str("| Scaffolding | Setting up the codebase, dev tooling, CI/CD |\n");
    s.push_str("| Core build | Implementing the primary features |\n");
    s.push_str("| Debugging | Fixing issues found during development |\n");
    s.push_str("| Testing | Verifying the product meets its requirements |\n");
    s.push_str("| Polishing | UX improvements, performance, readability |\n");
    s.push_str("| Shipped | Live, deployed, or handed over |\n");
    s
}


// ── Fuller-only templates ──────────────────────────────────────────────────────

fn tmpl_architecture(r: &ProjectInitRequest) -> String {
    let mut s = String::new();
    s.push_str(&format!("# Architecture — {}\n\n", r.name));
    s.push_str("High-level overview of how the system is structured.\n");
    s.push_str("Keep this updated as major decisions are made.\n\n");
    s.push_str("---\n\n");
    s.push_str("## Purpose\n\n");
    s.push_str("_What problem does this system solve and who uses it?_\n\n");
    s.push_str("---\n\n");
    s.push_str("## Key components\n\n");
    s.push_str("| Component | Responsibility |\n");
    s.push_str("|-----------|----------------|\n");
    s.push_str("| _[Name]_ | _[What it does]_ |\n\n");
    s.push_str("---\n\n");
    s.push_str("## Data flow\n\n");
    s.push_str("_Describe how data moves through the system — a short prose description or a\n");
    s.push_str("simple ASCII diagram is fine._\n\n");
    s.push_str("```\n");
    s.push_str("User → [Frontend] → [API] → [Database]\n");
    s.push_str("```\n\n");
    s.push_str("---\n\n");
    s.push_str("## External dependencies\n\n");
    s.push_str("Third-party services and APIs this system depends on.\n\n");
    s.push_str("| Service | Purpose | Notes |\n");
    s.push_str("|---------|---------|-------|\n");
    s.push_str("| _[Service]_ | _[Why]_ | — |\n\n");
    s.push_str("---\n\n");
    s.push_str("## Key design decisions\n\n");
    s.push_str("_Cross-reference detailed ADRs in docs/DECISIONS.md._\n\n");
    s.push_str("- _[Decision and brief rationale]_\n");
    s
}

fn skill_performance() -> String {
    let mut s = String::new();
    s.push_str("# Performance\n\n");
    s.push_str("## Purpose\n\n");
    s.push_str("Use this skill when the app is slow, unresponsive, or consuming excessive resources.\n");
    s.push_str("Profile before optimising — never guess at the bottleneck.\n\n");
    s.push_str("## When to use it\n\n");
    s.push_str("- User reports slowness or jank\n");
    s.push_str("- A page or operation is visibly slow\n");
    s.push_str("- Build times or startup times have regressed\n");
    s.push_str("- You are about to pre-optimise — stop and measure first\n\n");
    s.push_str("## Process\n\n");
    s.push_str("### 1. Measure first\n\n");
    s.push_str("Identify the specific operation that is slow and put a number on it.\n");
    s.push_str("Do not optimise without a baseline.\n\n");
    s.push_str("### 2. Find the bottleneck\n\n");
    s.push_str("Use the appropriate profiling tool:\n\n");
    s.push_str("- **Browser:** DevTools Performance tab, Lighthouse, Web Vitals\n");
    s.push_str("- **Node / server:** `--prof`, clinic.js, or simple `console.time` spans\n");
    s.push_str("- **Database:** `EXPLAIN ANALYZE`, slow query log\n");
    s.push_str("- **Rust/backend:** `cargo flamegraph`, criterion benchmarks\n\n");
    s.push_str("### 3. Fix the right layer\n\n");
    s.push_str("| Symptom | Likely cause | Approach |\n");
    s.push_str("|---------|-------------|----------|\n");
    s.push_str("| Slow first load | Large bundle | Code-split, lazy-load, tree-shake |\n");
    s.push_str("| Janky animations | Render blocking | Move to CSS, use `will-change`, avoid forced layout |\n");
    s.push_str("| Slow API calls | N+1 queries or missing index | Add index, batch queries, cache |\n");
    s.push_str("| Re-renders | Missing memo / stable refs | `useMemo`, `useCallback`, component split |\n\n");
    s.push_str("### 4. Verify the improvement\n\n");
    s.push_str("Re-run the same measurement. The number must be better.\n");
    s.push_str("If it is not, revert the change and re-profile.\n\n");
    s.push_str("## Rules\n\n");
    s.push_str("- Never optimise without a measurement showing it is needed\n");
    s.push_str("- Prefer algorithmic improvements over micro-optimisations\n");
    s.push_str("- Document the before/after numbers in docs/DECISIONS.md\n");
    s.push_str("- Stop when the bottleneck is gone — do not chase diminishing returns\n");
    s
}

fn tmpl_readme(r: &ProjectInitRequest, mode: &str) -> String {
    let slug = slugify(&r.name);
    let mut s = String::new();
    s.push_str(&format!("# {}\n\n", r.name));
    s.push_str(&format!("{}\n\n", opt(&r.description, "_Add a one-line description here._")));

    if !r.main_goal.trim().is_empty() {
        s.push_str(&format!("**Goal:** {}\n\n", r.main_goal));
    }

    s.push_str("---\n\n## Getting started\n\n");
    s.push_str("### Prerequisites\n\n");
    s.push_str("_List what needs to be installed before running this project._\n\n");
    s.push_str("### Installation\n\n");
    s.push_str("```bash\n");
    s.push_str(&format!("git clone <repo-url>\ncd {slug}\n\n"));
    s.push_str("# Install dependencies\n");
    s.push_str("_[Add install command for your stack, e.g. npm install]\n\n");
    s.push_str("# Set up environment variables\n");
    s.push_str("cp .env.example .env.local\n# Edit .env.local with your values\n\n");
    s.push_str("# Run in development\n");
    s.push_str("_[Add dev command, e.g. npm run dev]\n");
    s.push_str("```\n\n");

    s.push_str("---\n\n## Stack\n\n");
    s.push_str(&format!("**Template:** {}\n\n", template_label(&r.starter_template)));
    if !r.add_ons.is_empty() {
        s.push_str("**Add-ons:**\n\n");
        s.push_str(&add_ons_bullets(&r.add_ons));
        s.push('\n');
    }

    s.push_str("---\n\n## Docs\n\n");
    s.push_str("| Doc | Purpose |\n");
    s.push_str("|-----|---------|\n");
    s.push_str("| [CLAUDE.md](CLAUDE.md) | Context for Claude Code — read this first |\n");
    s.push_str("| [docs/BRIEF.md](docs/BRIEF.md) | What this project is and why it exists |\n");
    s.push_str("| [docs/TASKS.md](docs/TASKS.md) | Current task list |\n");
    s.push_str("| [docs/STAGE.md](docs/STAGE.md) | Current project stage |\n");
    if mode != "bare_bones" {
        s.push_str("| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Feature requirements |\n");
        s.push_str("| [docs/TECHNICAL.md](docs/TECHNICAL.md) | Architecture and technical decisions |\n");
        s.push_str("| [docs/DECISIONS.md](docs/DECISIONS.md) | Key decisions and rationale |\n");
        s.push_str("| [docs/SESSIONS.md](docs/SESSIONS.md) | Working session notes |\n");
    }
    s.push('\n');

    if !r.constraints.trim().is_empty() {
        s.push_str("---\n\n## Constraints\n\n");
        s.push_str(&format!("{}\n\n", r.constraints));
    }

    s
}

// ── Claude skills ──────────────────────────────────────────────────────────────

fn skill_project_kickoff() -> String {
    let mut s = String::new();
    s.push_str("# Project Kickoff\n\n");
    s.push_str("## Purpose\n\n");
    s.push_str("Use this skill at the very start of a new project — before writing any code — to review\n");
    s.push_str("the generated documentation, identify gaps, and establish a clear plan.\n\n");
    s.push_str("## When to use it\n\n");
    s.push_str("- First session on a new project\n");
    s.push_str("- After a long break where context has been lost\n");
    s.push_str("- After a significant change in direction or scope\n\n");
    s.push_str("## Steps\n\n");
    s.push_str("### 1. Read all project documents\n\n");
    s.push_str("In order:\n\n");
    s.push_str("1. CLAUDE.md — project context and working preferences\n");
    s.push_str("2. docs/STAGE.md — current phase and what has been done\n");
    s.push_str("3. docs/BRIEF.md — what and why\n");
    s.push_str("4. docs/REQUIREMENTS.md — what needs to be built\n");
    s.push_str("5. docs/TECHNICAL.md — how it will be built\n");
    s.push_str("6. docs/TASKS.md — current task list\n");
    s.push_str("7. docs/RISKS.md — known constraints (if present)\n\n");
    s.push_str("### 2. Identify gaps and problems\n\n");
    s.push_str("After reading, note:\n\n");
    s.push_str("- Sections that are still placeholder or incomplete\n");
    s.push_str("- Contradictions between documents\n");
    s.push_str("- Requirements that are vague or untestable\n");
    s.push_str("- Technical decisions that have not yet been made\n");
    s.push_str("- Risks that are not yet captured\n\n");
    s.push_str("### 3. Ask clarifying questions\n\n");
    s.push_str("Before proposing anything, ask the user to resolve the most important gaps.\n");
    s.push_str("Prioritise questions by impact: ask about things that would change the architecture\n");
    s.push_str("before asking about things that only affect implementation detail.\n\n");
    s.push_str("Limit to 3–5 questions at a time. Too many questions at once is overwhelming.\n\n");
    s.push_str("### 4. Propose a first task list\n\n");
    s.push_str("Based on the documents and answers, propose a concrete Phase 1 task list:\n\n");
    s.push_str("- Break work into the smallest useful steps\n");
    s.push_str("- Order by dependency and risk (uncertain or risky items should be tackled early)\n");
    s.push_str("- Be explicit about what is in Phase 1 vs. deferred to backlog\n\n");
    s.push_str("### 5. Get confirmation before starting\n\n");
    s.push_str("Do not write any code until the user has confirmed the task list.\n");
    s.push_str("Once confirmed, update docs/TASKS.md and begin with the first task.\n\n");
    s.push_str("## Output\n\n");
    s.push_str("- A summary of gaps found and questions resolved\n");
    s.push_str("- An updated docs/TASKS.md with a concrete Phase 1 task list\n");
    s.push_str("- A confirmed starting point for development\n");
    s
}

fn skill_feature_chunking() -> String {
    let mut s = String::new();
    s.push_str("# Feature Chunking\n\n");
    s.push_str("## Purpose\n\n");
    s.push_str("Use this skill when planning or implementing a non-trivial feature or change.\n");
    s.push_str("Explore first, break the work into reviewable chunks, implement one chunk at a time.\n\n");
    s.push_str("## When to use it\n\n");
    s.push_str("- Before starting any feature that touches more than 2–3 files or has uncertain scope\n");
    s.push_str("- When a task turns out to be larger than expected mid-session\n");
    s.push_str("- When the right approach is unclear and needs to be structured before any code is written\n\n");
    s.push_str("## Phase 1 — Planning pass (before writing any code)\n\n");
    s.push_str("1. **Read the relevant code** — understand what already exists\n");
    s.push_str("2. **Identify unknowns** — list anything unclear; resolve the most important ones first\n");
    s.push_str("3. **Propose a chunk breakdown** — smallest steps that are each independently verifiable\n");
    s.push_str("4. **Get confirmation where appropriate** — show the breakdown to the user before starting, especially when scope, trade-offs, or sequence matter; for obvious small plans, a brief summary is enough\n\n");
    s.push_str("Good chunk rules:\n\n");
    s.push_str("- Each chunk should be completable in one focused session\n");
    s.push_str("- Each chunk should produce a clear, verifiable result\n");
    s.push_str("- Do not mix concerns in one chunk (\"build UI and wire up API\" = two chunks)\n");
    s.push_str("- Order by dependency and risk — uncertain or risky items first, polish last\n\n");
    s.push_str("## Phase 2 — Implementation (one chunk at a time)\n\n");
    s.push_str("- Implement only the current chunk — do not get ahead\n");
    s.push_str("- Make the smallest change that achieves the goal\n");
    s.push_str("- Do not refactor code not directly related to the current chunk\n");
    s.push_str("- Do not add features or configuration that were not asked for\n");
    s.push_str("- Prefer editing existing patterns over introducing new ones\n");
    s.push_str("- If you notice an existing bug, flag it — do not fix it unless asked\n\n");
    s.push_str("Security rules (apply to every chunk):\n\n");
    s.push_str("- Never introduce SQL injection, XSS, command injection, or path traversal\n");
    s.push_str("- Validate input at system boundaries — trust internal code and framework guarantees\n");
    s.push_str("- Do not expose secrets or credentials in outputs or error messages\n\n");
    s.push_str("## Phase 3 — After each chunk\n\n");
    s.push_str("1. Run the build and type checks — confirm clean\n");
    s.push_str("2. If the chunk changed visible UI, manually verify the affected flow where practical\n");
    s.push_str("3. Report testing honestly using the testing-discipline format\n");
    s.push_str("4. Flag any new scope discovered — let it become its own chunk\n");
    s.push_str("5. If a significant decision was made, log it in docs/DECISIONS.md\n\n");
    s.push_str("## Red flags — stop and check with the user\n\n");
    s.push_str("- The change is touching more files than the chunk plan anticipated\n");
    s.push_str("- The change requires modifying a data model or API contract\n");
    s.push_str("- The change introduces a new dependency\n");
    s.push_str("- Something feels architecturally wrong but you cannot explain it yet\n");
    s
}

fn skill_ui_readability() -> String {
    let mut s = String::new();
    s.push_str("# UI Readability\n\n");
    s.push_str("## Purpose\n\n");
    s.push_str("Use this skill when improving interface readability, visual hierarchy, colour contrast,\n");
    s.push_str("pill/badge/chip styling, or the overall warmth and human feel of the UI.\n\n");
    s.push_str("## Core Principles\n\n");
    s.push_str("- Prioritise readability over trendy low-contrast styling.\n");
    s.push_str("- Design for fast scanning, not just visual polish.\n");
    s.push_str("- Perceived contrast matters as much as formal contrast ratios.\n");
    s.push_str("- Light mode needs extra care because soft colours can look attractive but still read badly.\n");
    s.push_str("- Do not rely on colour alone to communicate meaning.\n");
    s.push_str("- The UI should feel intentional, calm, and premium — not icy, sterile, or generic.\n\n");
    s.push_str("## Practical Guidance\n\n");
    s.push_str("- Avoid pale grey text on pale coloured pills, badges, chips, or tinted surfaces.\n");
    s.push_str("- Avoid low-contrast text on blue, purple, green, or pink pastel backgrounds.\n");
    s.push_str("- On pills and badges, prefer stronger text contrast even if the background is soft.\n");
    s.push_str("- If a pill background is tinted, the text should be much darker or much lighter\n");
    s.push_str("  than the background — clear separation at a glance.\n");
    s.push_str("- Users should be able to read pills and status labels instantly without effort.\n");
    s.push_str("- Use spacing, size, weight, and hierarchy as well as colour.\n");
    s.push_str("- Reduce overuse of faint tinted cards and glassy floating surfaces.\n");
    s.push_str("- Prefer a more grounded, solid visual structure.\n");
    s.push_str("- Keep the interface modern, but make it feel human rather than like a generic AI dashboard.\n\n");
    s.push_str("## Light Mode Rules\n\n");
    s.push_str("- Check all pills, tags, badges, chips, and small labels in light mode first.\n");
    s.push_str("- Be suspicious of mid-grey text on pale backgrounds — it often fails at small sizes.\n");
    s.push_str("- Increase contrast before increasing decoration.\n");
    s.push_str("- Text that looks fine at large sizes often needs stronger contrast when small.\n");
    s.push_str("- Selected states, hover states, and disabled states must all remain readable.\n");
    s.push_str("- A pill with `text-green-400` text on a `bg-green-500/15` background fails in light mode.\n");
    s.push_str("  Use `text-green-700` or `text-green-800` in light mode instead.\n\n");
    s.push_str("## Dark Mode Rules\n\n");
    s.push_str("- Do not let everything blur into soft dark-grey mush.\n");
    s.push_str("- Maintain clear hierarchy between background, card, border, and interactive elements.\n");
    s.push_str("- Avoid glowing neon accents unless used very deliberately and sparingly.\n");
    s.push_str("- Keep contrast clear without making the interface feel harsh or stark.\n\n");
    s.push_str("## Human-Centred Aesthetic Direction\n\n");
    s.push_str("Aim for a UI that feels:\n\n");
    s.push_str("- premium — it respects the user's intelligence\n");
    s.push_str("- warm — not icy or clinical\n");
    s.push_str("- grounded — solid visual structure, not floating and glassy\n");
    s.push_str("- clear — hierarchy is obvious at a glance\n");
    s.push_str("- confident — consistent and intentional, not assembled from templates\n\n");
    s.push_str("Avoid a UI that feels:\n\n");
    s.push_str("- cold or sterile\n");
    s.push_str("- overly glassy or floaty\n");
    s.push_str("- dominated by pale blue or purple AI clichés\n");
    s.push_str("- visually clever but tiring to read\n\n");
    s.push_str("## When reviewing UI work\n\n");
    s.push_str("Work through this checklist:\n\n");
    s.push_str("1. Can every label be read instantly without squinting?\n");
    s.push_str("2. Are pills, badges, and chips readable in light mode specifically?\n");
    s.push_str("3. Is the visual hierarchy clear without depending only on colour?\n");
    s.push_str("4. Do interactive elements (buttons, chips, inputs) look clearly interactive?\n");
    s.push_str("5. Does the UI feel warm and intentional rather than generic and cold?\n");
    s.push_str("6. Would a real user find this easy to scan after hours of work?\n\n");
    s.push_str("## Output Expectations\n\n");
    s.push_str("When applying this skill:\n\n");
    s.push_str("- Identify readability problems clearly and specifically\n");
    s.push_str("- Explain why each problem matters (not just that it fails a ratio)\n");
    s.push_str("- Suggest concrete fixes with specific class names or values\n");
    s.push_str("- Favour practical improvements over vague design theory\n");
    s.push_str("- Test proposed fixes in both light and dark mode before finalising\n");
    s
}

fn skill_testing_discipline() -> String {
    let mut s = String::new();
    s.push_str("# Testing Discipline\n\n");
    s.push_str("## Purpose\n\n");
    s.push_str("Use this skill whenever implementing, modifying, or reviewing code so testing is reported\n");
    s.push_str("honestly and performed at the right level for the change.\n\n");
    s.push_str("## Core Principles\n\n");
    s.push_str("- \"Build passed\" is not the same as \"tested\".\n");
    s.push_str("- Always distinguish between build/type checks, manual testing, and automated tests.\n");
    s.push_str("- Never imply a behaviour was verified unless it was actually verified.\n");
    s.push_str("- Prefer small, specific, truthful testing notes over vague claims.\n\n");
    s.push_str("## Required Testing Categories\n\n");
    s.push_str("### 1. Build / Type Checks\n");
    s.push_str("- Examples: `npm run build`, `cargo build`, linting, type checking\n");
    s.push_str("- These confirm code compiles or passes static checks\n");
    s.push_str("- These do **not** prove the feature works correctly\n\n");
    s.push_str("### 2. Manual Functional Testing\n");
    s.push_str("- Verify the actual user flow where practical\n");
    s.push_str("- Click through the feature in the running app\n");
    s.push_str("- Check validation, loading, success, error, and disabled states\n");
    s.push_str("- Confirm the UI behaves as expected in both light and dark mode\n\n");
    s.push_str("### 3. Automated Tests\n");
    s.push_str("- Add or run automated tests for pure logic and helper functions where practical\n");
    s.push_str("- Prefer focused tests for logic that can be verified reliably\n");
    s.push_str("- Do not force heavy test scaffolding for tiny changes unless it already fits the project\n\n");
    s.push_str("## Reporting Format\n\n");
    s.push_str("When summarising any implementation chunk, always include:\n\n");
    s.push_str("```\n");
    s.push_str("Testing performed\n");
    s.push_str("- Build/type checks:\n");
    s.push_str("    - [exact commands run]\n");
    s.push_str("- Manual testing:\n");
    s.push_str("    - [exact behaviours verified]\n");
    s.push_str("- Automated tests:\n");
    s.push_str("    - [tests added or run, or \"none — no test runner configured for this layer\"]\n");
    s.push_str("- Limitations:\n");
    s.push_str("    - [what was not tested]\n");
    s.push_str("```\n\n");
    s.push_str("## Honesty Rules\n\n");
    s.push_str("- If only compilation was checked, say that clearly\n");
    s.push_str("- If manual testing was not performed (e.g. app was not launched), say so\n");
    s.push_str("- If no automated tests exist for this layer, say so clearly\n");
    s.push_str("- Do not use vague wording like \"tested\" or \"tested and working\" without details\n\n");
    s.push_str("## UI Testing Checklist\n\n");
    s.push_str("For UI changes, verify as many of these as are relevant:\n\n");
    s.push_str("- [ ] Main happy path\n");
    s.push_str("- [ ] Validation states (empty fields, invalid input)\n");
    s.push_str("- [ ] Loading / running states\n");
    s.push_str("- [ ] Success state\n");
    s.push_str("- [ ] Error state\n");
    s.push_str("- [ ] Disabled controls\n");
    s.push_str("- [ ] Navigation outcomes\n");
    s.push_str("- [ ] Light mode readability\n");
    s.push_str("- [ ] Dark mode readability\n");
    s.push_str("- [ ] Pill, badge, chip, and helper text readability\n\n");
    s.push_str("## Good Example\n\n");
    s.push_str("```\n");
    s.push_str("Testing performed\n");
    s.push_str("- Build/type checks:\n");
    s.push_str("    - Ran `npm run build` — clean\n");
    s.push_str("- Manual testing:\n");
    s.push_str("    - Opened the feature\n");
    s.push_str("    - Verified validation on empty input\n");
    s.push_str("    - Verified loading state appears during async operation\n");
    s.push_str("    - Verified success state and navigation after completion\n");
    s.push_str("    - Verified error message appears on failure\n");
    s.push_str("- Automated tests:\n");
    s.push_str("    - Added tests for helper function covering 4 input variants\n");
    s.push_str("- Limitations:\n");
    s.push_str("    - Did not test the network error path manually\n");
    s.push_str("```\n\n");
    s.push_str("## Bad Example\n\n");
    s.push_str("```\n");
    s.push_str("- Tested and working\n");
    s.push_str("```\n");
    s
}

fn skill_debug() -> String {
    let mut s = String::new();
    s.push_str("# Debug\n\n");
    s.push_str("## Purpose\n\n");
    s.push_str("Use this skill when something is broken and the cause is unclear.\n");
    s.push_str("Investigate systematically before changing anything.\n\n");
    s.push_str("## When to use it\n\n");
    s.push_str("- A feature that used to work has stopped working\n");
    s.push_str("- An error is occurring but the cause is not obvious\n");
    s.push_str("- Behaviour is inconsistent or hard to reproduce\n");
    s.push_str("- You are about to guess at a fix — stop and use this skill instead\n\n");
    s.push_str("## Process\n\n");
    s.push_str("### 1. Reproduce it\n\n");
    s.push_str("Before reading any code, confirm you can reproduce the problem reliably.\n");
    s.push_str("Write down the exact steps, inputs, and observed output.\n\n");
    s.push_str("### 2. Read the error\n\n");
    s.push_str("Read the full error message, stack trace, or log output carefully.\n");
    s.push_str("Do not skim. The answer is often in the part that looks least important.\n\n");
    s.push_str("### 3. Identify the layer\n\n");
    s.push_str("Narrow down which layer the problem is in:\n\n");
    s.push_str("- UI / component\n");
    s.push_str("- State / data flow\n");
    s.push_str("- API / service call\n");
    s.push_str("- Backend / business logic\n");
    s.push_str("- Database / persistence\n");
    s.push_str("- Build / config / environment\n\n");
    s.push_str("### 4. Form a hypothesis\n\n");
    s.push_str("State your hypothesis clearly before looking at code:\n\n");
    s.push_str("> \"I think the problem is X because Y.\"\n\n");
    s.push_str("If you cannot state a hypothesis, keep reading the error output.\n\n");
    s.push_str("### 5. Verify — do not guess\n\n");
    s.push_str("Find the specific line or condition that proves or disproves the hypothesis.\n");
    s.push_str("Do not make a change until you can point to the root cause.\n\n");
    s.push_str("### 6. Fix minimally\n\n");
    s.push_str("Make the smallest change that fixes the root cause.\n");
    s.push_str("Do not refactor while fixing — that introduces new risk.\n");
    s.push_str("Confirm the fix by reproducing the original steps again.\n\n");
    s.push_str("## Rules\n\n");
    s.push_str("- Never change code to \"see if it helps\" — changes must be hypothesis-driven\n");
    s.push_str("- If you touch more than 3 files to fix one bug, stop and reassess\n");
    s.push_str("- If a fix introduces a new problem, revert it and re-diagnose\n");
    s.push_str("- Log significant bugs and their root cause in docs/DECISIONS.md if relevant\n");
    s
}

fn skill_frontend() -> String {
    let mut s = String::new();
    s.push_str("# Frontend Rules\n\n");
    s.push_str("Applies to any project with a user interface: web, mobile, desktop.\n");
    s.push_str("Covers component design, API layering, state management, and TypeScript practices.\n\n");
    s.push_str("---\n\n");
    s.push_str("## 1. No Inline Anything [MUST]\n\n");
    s.push_str("Inline styles, inline colors, inline fonts — all forbidden.\n\n");
    s.push_str("**MUST create before writing the first component:**\n\n");
    s.push_str("```\n");
    s.push_str("src/theme/\n");
    s.push_str("  colors.ts\n");
    s.push_str("  typography.ts\n");
    s.push_str("  spacing.ts\n");
    s.push_str("  index.ts\n");
    s.push_str("```\n\n");
    s.push_str("Every component imports from the theme. No exceptions.\n\n");
    s.push_str("---\n\n");
    s.push_str("## 2. Intentional Design [MUST]\n\n");
    s.push_str("Every visual decision must be intentional.\n\n");
    s.push_str("**MUST:**\n");
    s.push_str("- Before writing a single component, define the visual direction in one sentence.\n");
    s.push_str("  (\"Dense developer tool, dark, monospace-heavy\" is enough.)\n");
    s.push_str("- Commit to that direction. Do not drift toward safe/generic mid-implementation.\n\n");
    s.push_str("**SHOULD:**\n");
    s.push_str("- Avoid defaulting to the same palette and component patterns across every project.\n");
    s.push_str("- When no design brief is given, ask for one.\n\n");
    s.push_str("---\n\n");
    s.push_str("## 3. Theme Before Components [MUST]\n\n");
    s.push_str("Strict order:\n");
    s.push_str("1. Define theme tokens (colors, typography, spacing)\n");
    s.push_str("2. Build primitive components (Button, Text, Input) using tokens\n");
    s.push_str("3. Build feature components on top of primitives\n\n");
    s.push_str("Never skip step 1 or 2 to get to step 3 faster.\n\n");
    s.push_str("---\n\n");
    s.push_str("## 4. Component Granularity [MUST]\n\n");
    s.push_str("One component, one responsibility. A component that fetches AND renders,\n");
    s.push_str("or manages form state AND displays results, must be split.\n\n");
    s.push_str("Page-level components are thin composers — no logic, only layout and composition.\n\n");
    s.push_str("```\n");
    s.push_str("features/UserProfile/\n");
    s.push_str("  UserProfilePage.tsx     ← route entry, composes below\n");
    s.push_str("  UserProfileHeader.tsx\n");
    s.push_str("  UserProfileStats.tsx\n");
    s.push_str("  useUserProfile.ts       ← all data fetching and state\n");
    s.push_str("  userProfile.types.ts\n");
    s.push_str("```\n\n");
    s.push_str("---\n\n");
    s.push_str("## 5. API Layer Separation [MUST]\n\n");
    s.push_str("Network calls are never made directly inside components.\n\n");
    s.push_str("```\n");
    s.push_str("services/userService.ts   ← API calls only\n");
    s.push_str("hooks/useUser.ts          ← wraps service + React Query\n");
    s.push_str("components/UserCard.tsx   ← calls hook, renders state\n");
    s.push_str("```\n\n");
    s.push_str("Components call hooks. Hooks call services. Services call the network. Nothing skips a layer.\n\n");
    s.push_str("---\n\n");
    s.push_str("## 6. State Management [MUST]\n\n");
    s.push_str("Server state uses React Query, SWR, or RTK Query.\n");
    s.push_str("Never manually manage loading/error/data with three separate `useState` calls.\n\n");
    s.push_str("Global client state uses one solution per project.\n");
    s.push_str("Mixing solutions requires a documented decision.\n\n");
    s.push_str("---\n\n");
    s.push_str("## 7. TypeScript Strictness [MUST]\n\n");
    s.push_str("`strict: true` in `tsconfig.json`. Non-negotiable.\n\n");
    s.push_str("`any` is forbidden. Use `unknown` and narrow it.\n\n");
    s.push_str("`as` type assertions and non-null assertions (`!`) require an inline comment\n");
    s.push_str("explaining why the type system cannot infer this:\n\n");
    s.push_str("```typescript\n");
    s.push_str("// API returns correct shape but generated types don't reflect optional fields yet\n");
    s.push_str("const user = data as User\n");
    s.push_str("```\n\n");
    s.push_str("---\n\n");
    s.push_str("## 8. Text Management [SHOULD]\n\n");
    s.push_str("No hardcoded strings scattered across components.\n");
    s.push_str("Maintain a centralised strings/copy file from day one, even if not localising.\n\n");
    s.push_str("```\n");
    s.push_str("src/constants/strings.ts\n");
    s.push_str("```\n\n");
    s.push_str("---\n\n");
    s.push_str("## 9. Component Testing [SHOULD]\n\n");
    s.push_str("Component tests use React Testing Library. Test behaviour, not implementation:\n\n");
    s.push_str("```typescript\n");
    s.push_str("// Correct — tests what the user sees\n");
    s.push_str("expect(screen.getByText('Welcome, Alice')).toBeInTheDocument()\n\n");
    s.push_str("// Forbidden — tests implementation detail\n");
    s.push_str("expect(wrapper.find('UserGreeting').prop('name')).toBe('Alice')\n");
    s.push_str("```\n\n");
    s.push_str("Hook logic is tested with `renderHook`.\n");
    s.push_str("Service functions are unit tested independently with mocked fetch/axios.\n\n");
    s.push_str("Do not test that a component calls a function — test what changes in the UI when it does.\n");
    s
}

// ── Unit tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // slugify ──────────────────────────────────────────────────────────────────

    #[test]
    fn slugify_lowercase_and_spaces_to_dashes() {
        assert_eq!(slugify("My Awesome Project"), "my-awesome-project");
    }

    #[test]
    fn slugify_collapses_multiple_separators() {
        assert_eq!(slugify("hello  --  world"), "hello-world");
    }

    #[test]
    fn slugify_strips_special_characters() {
        assert_eq!(slugify("My_Project!"), "my-project");
    }

    #[test]
    fn slugify_preserves_numbers() {
        assert_eq!(slugify("project 2"), "project-2");
    }

    #[test]
    fn slugify_strips_trailing_dash() {
        assert_eq!(slugify("hello!"), "hello");
    }

    #[test]
    fn slugify_empty_string() {
        assert_eq!(slugify(""), "");
    }

    #[test]
    fn slugify_whitespace_only() {
        assert_eq!(slugify("   "), "");
    }

    // add_ons_bullets ──────────────────────────────────────────────────────────

    #[test]
    fn add_ons_bullets_empty() {
        assert_eq!(add_ons_bullets(&[]), "- None selected\n");
    }

    #[test]
    fn add_ons_bullets_single() {
        assert_eq!(
            add_ons_bullets(&["Supabase".to_string()]),
            "- Supabase\n",
        );
    }

    #[test]
    fn add_ons_bullets_multiple() {
        assert_eq!(
            add_ons_bullets(&["Supabase".to_string(), "Tailwind CSS".to_string()]),
            "- Supabase\n- Tailwind CSS\n",
        );
    }

    // opt ──────────────────────────────────────────────────────────────────────

    #[test]
    fn opt_returns_value_when_non_empty() {
        assert_eq!(opt("hello", "fallback"), "hello");
    }

    #[test]
    fn opt_returns_fallback_for_empty_string() {
        assert_eq!(opt("", "fallback"), "fallback");
    }

    #[test]
    fn opt_returns_fallback_for_whitespace_only() {
        assert_eq!(opt("   ", "fallback"), "fallback");
    }

    // project_type_label ───────────────────────────────────────────────────────

    #[test]
    fn project_type_label_known_values() {
        assert_eq!(project_type_label("web_app"),       "Web app");
        assert_eq!(project_type_label("desktop_app"),   "Desktop app");
        assert_eq!(project_type_label("internal_tool"), "Internal tool");
        assert_eq!(project_type_label("api"),           "API / Service");
        assert_eq!(project_type_label("docs_site"),     "Docs site");
    }

    #[test]
    fn project_type_label_unknown_passthrough() {
        assert_eq!(project_type_label("mystery"), "mystery");
    }

    // template_label ───────────────────────────────────────────────────────────

    #[test]
    fn template_label_known_values() {
        assert_eq!(template_label("nextjs"), "Next.js (App Router + TypeScript)");
        assert_eq!(template_label("tauri"),  "Tauri (Rust + React + SQLite)");
        assert_eq!(template_label("react"),  "React (Vite + TypeScript)");
        assert_eq!(template_label("blank"),  "Blank (no template)");
        assert_eq!(template_label("docs"),   "Docs site (Nextra / MDX)");
    }

    #[test]
    fn template_label_unknown_passthrough() {
        assert_eq!(template_label("unknown"), "unknown");
    }

    // normalise_level ──────────────────────────────────────────────────────────

    #[test]
    fn normalise_level_bare_bones_canonical() {
        assert_eq!(normalise_level("bare_bones"), "bare_bones");
    }

    #[test]
    fn normalise_level_small_maps_to_bare_bones() {
        assert_eq!(normalise_level("small"), "bare_bones");
    }

    #[test]
    fn normalise_level_standard_passthrough() {
        assert_eq!(normalise_level("standard"), "standard");
    }

    #[test]
    fn normalise_level_unknown_defaults_to_standard() {
        assert_eq!(normalise_level(""), "standard");
        assert_eq!(normalise_level("anything_else"), "standard");
    }

    #[test]
    fn normalise_level_fuller_canonical() {
        assert_eq!(normalise_level("fuller"), "fuller");
    }

    #[test]
    fn normalise_level_full_maps_to_fuller() {
        assert_eq!(normalise_level("full"), "fuller");
    }

    // file_paths_for_level ─────────────────────────────────────────────────────

    #[test]
    fn bare_bones_selects_minimal_docs() {
        let paths = file_paths_for_level("bare_bones", false);
        assert_eq!(paths.len(), 5, "bare_bones should produce 5 docs");
        assert!(paths.contains(&"CLAUDE.md"));
        assert!(paths.contains(&"docs/BRIEF.md"));
        assert!(!paths.iter().any(|p| p.contains("REQUIREMENTS")), "REQUIREMENTS should not be in bare_bones");
        assert!(!paths.iter().any(|p| p.contains("ARCHITECTURE")), "ARCHITECTURE should not be in bare_bones");
    }

    #[test]
    fn standard_selects_normal_docs() {
        let paths = file_paths_for_level("standard", false);
        assert_eq!(paths.len(), 10, "standard should produce 10 docs");
        assert!(paths.iter().any(|p| p.contains("REQUIREMENTS")));
        assert!(paths.iter().any(|p| p.contains("DECISIONS")));
        assert!(!paths.iter().any(|p| p.contains("ARCHITECTURE")), "ARCHITECTURE should not be in standard");
    }

    #[test]
    fn fuller_selects_expanded_docs() {
        let paths = file_paths_for_level("fuller", false);
        assert_eq!(paths.len(), 11, "fuller should produce 11 docs");
        assert!(paths.iter().any(|p| p.contains("ARCHITECTURE")));
    }

    #[test]
    fn bare_bones_selects_minimal_skills() {
        let paths = file_paths_for_level("bare_bones", true);
        let skills: Vec<_> = paths.iter().filter(|p| p.contains(".claude/skills")).collect();
        assert_eq!(skills.len(), 2, "bare_bones should produce 2 skills");
    }

    #[test]
    fn standard_selects_normal_skills() {
        let paths = file_paths_for_level("standard", true);
        let skills: Vec<_> = paths.iter().filter(|p| p.contains(".claude/skills")).collect();
        assert_eq!(skills.len(), 6, "standard should produce 6 skills");
    }

    #[test]
    fn fuller_selects_expanded_skills() {
        let paths = file_paths_for_level("fuller", true);
        let skills: Vec<_> = paths.iter().filter(|p| p.contains(".claude/skills")).collect();
        assert_eq!(skills.len(), 7, "fuller should produce 7 skills");
        assert!(skills.iter().any(|p| p.contains("performance")));
    }

    #[test]
    fn old_values_produce_same_paths_as_new() {
        // "small" and "bare_bones" must be equivalent
        assert_eq!(
            file_paths_for_level("small",      true),
            file_paths_for_level("bare_bones", true),
        );
        // "full" and "fuller" must be equivalent
        assert_eq!(
            file_paths_for_level("full",   true),
            file_paths_for_level("fuller", true),
        );
    }
}
