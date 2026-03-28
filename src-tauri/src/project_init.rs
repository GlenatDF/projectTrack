use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Emitter;

use crate::db::{self, CreateProject};

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
pub fn write_docs_and_skills(
    project_dir: &std::path::Path,
    req: &ProjectInitRequest,
    app: &tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let mut files_created: Vec<String> = Vec::new();

    emit(app, "docs", "Generating markdown docs", "running");
    let today = today_iso();
    let docs: &[(&str, String)] = &[
        ("CLAUDE.md",                         tmpl_claude_md(req)),
        ("PROJECT_BRIEF.md",                  tmpl_brief(req)),
        ("PRODUCT_REQUIREMENTS.md",           tmpl_prd(req, &today)),
        ("TECHNICAL_SPEC.md",                 tmpl_tech_spec(req, &today)),
        ("TASKS.md",                          tmpl_tasks(req)),
        ("DECISION_LOG.md",                   tmpl_decision_log(req, &today)),
        ("SESSION_LOG.md",                    tmpl_session_log()),
        ("RISKS_ASSUMPTIONS_DEPENDENCIES.md", tmpl_risks(req)),
        ("PROJECT_STAGE.md",                  tmpl_project_stage(&today)),
        ("PROJECT_START_PROMPT.md",           tmpl_start_prompt(req)),
        ("README.md",                         tmpl_readme(req)),
    ];
    for (name, content) in docs {
        if let Err(e) = write_file(project_dir, name, content) {
            emit(app, "docs", "Generating markdown docs", "error");
            return Err(e);
        }
        files_created.push(name.to_string());
    }
    emit(app, "docs", "Generating markdown docs", "done");

    if req.create_claude_skills {
        emit(app, "skills", "Generating Claude skills", "running");
        let skills: &[(&str, String)] = &[
            (".claude/skills/project-kickoff/SKILL.md",    skill_project_kickoff()),
            (".claude/skills/feature-chunking/SKILL.md",   skill_feature_chunking()),
            (".claude/skills/ui-readability/SKILL.md",     skill_ui_readability()),
            (".claude/skills/testing-discipline/SKILL.md", skill_testing_discipline()),
        ];
        for (path, content) in skills {
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
    let doc_files = write_docs_and_skills(&project_dir, &req, app)?;
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

fn add_ons_inline(add_ons: &[String]) -> String {
    if add_ons.is_empty() { String::new() }
    else { format!(" · {}", add_ons.join(", ")) }
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

fn tmpl_claude_md(r: &ProjectInitRequest) -> String {
    let mut s = String::new();
    s.push_str(&format!("# CLAUDE.md — {}\n\n", r.name));
    s.push_str("This file gives Claude Code context for this project.\n");
    s.push_str("Read this at the start of every session **before writing any code**.\n\n");
    s.push_str("---\n\n");

    // Overview
    s.push_str("## Overview\n\n");
    s.push_str(&format!("{}\n\n", opt(&r.description, "_Add a one-line description of what this project is._")));
    s.push_str(&format!("**Type:** {}  \n", project_type_label(&r.project_type)));
    s.push_str(&format!("**Template:** {}  \n", template_label(&r.starter_template)));
    s.push_str("**Stage:** See PROJECT_STAGE.md\n\n");

    // Goal
    if !r.main_goal.trim().is_empty() {
        s.push_str("## Goal\n\n");
        s.push_str(&format!("{}\n\n", r.main_goal));
    } else {
        s.push_str("## Goal\n\n_Define the primary goal of this project here._\n\n");
    }

    // Stack
    s.push_str("## Stack\n\n");
    s.push_str(&format!("**Base template:** {}\n\n", template_label(&r.starter_template)));
    s.push_str("**Add-ons / integrations:**\n\n");
    s.push_str(&add_ons_bullets(&r.add_ons));
    s.push('\n');

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

    // Session workflow
    s.push_str("## Session workflow\n\n");
    s.push_str("**At the start of each session:**\n\n");
    s.push_str("1. Read TASKS.md — identify what is currently in progress or should be picked up next\n");
    s.push_str("2. Check PROJECT_STAGE.md — confirm the current phase\n");
    s.push_str("3. Briefly summarise your understanding before making any changes\n");
    s.push_str("4. Ask clarifying questions rather than guessing on scope or approach\n\n");

    s.push_str("**During the session:**\n\n");
    s.push_str("- Make the smallest change that achieves the goal\n");
    s.push_str("- Avoid refactoring or improving code that is not directly related to the task\n");
    s.push_str("- Keep changes focused and reviewable — one concern per edit\n");
    s.push_str("- Flag blockers immediately rather than working around them silently\n");
    s.push_str("- If you are uncertain about an architectural decision, say so and propose options\n\n");

    s.push_str("**At the end of each session:**\n\n");
    s.push_str("- Update TASKS.md: mark completed tasks done, add anything newly discovered\n");
    s.push_str("- Add an entry to SESSION_LOG.md: what was done, blockers, and next steps\n");
    s.push_str("- Log any significant decisions to DECISION_LOG.md with context and rationale\n");
    s.push_str("- Update PROJECT_STAGE.md if the stage has changed\n\n");

    // Key files table
    s.push_str("## Key files\n\n");
    s.push_str("| File | Purpose |\n");
    s.push_str("|------|---------|\n");
    s.push_str("| CLAUDE.md | You are reading it — project context for Claude |\n");
    s.push_str("| PROJECT_BRIEF.md | One-page overview of what this is and why it exists |\n");
    s.push_str("| PRODUCT_REQUIREMENTS.md | Feature requirements and acceptance criteria |\n");
    s.push_str("| TECHNICAL_SPEC.md | Architecture, stack, and technical decisions |\n");
    s.push_str("| TASKS.md | Living task list — keep this current throughout development |\n");
    s.push_str("| DECISION_LOG.md | Record of key decisions with context and rationale |\n");
    s.push_str("| SESSION_LOG.md | Brief notes from each working session |\n");
    s.push_str("| RISKS_ASSUMPTIONS_DEPENDENCIES.md | Known risks, assumptions, and constraints |\n");
    s.push_str("| PROJECT_STAGE.md | Current stage and what has been completed |\n");
    s.push_str("| PROJECT_START_PROMPT.md | Starter prompt to give Claude at the start of a session |\n\n");

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
        s.push_str("| `project-kickoff` | First session on the project — review docs, find gaps, establish a plan |\n");
        s.push_str("| `feature-chunking` | Before any non-trivial feature — plan chunks first, implement one at a time |\n");
        s.push_str("| `ui-readability` | When reviewing or improving UI components, colour, contrast, or hierarchy |\n");
        s.push_str("| `testing-discipline` | When reporting the outcome of any implementation chunk |\n\n");
    }

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

fn tmpl_brief(r: &ProjectInitRequest) -> String {
    let mut s = String::new();
    s.push_str(&format!("# Project Brief — {}\n\n", r.name));
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
    s.push_str(&format!("# Product Requirements — {}\n\n", r.name));
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
    s.push_str("See DECISION_LOG.md for full decision history with context and rationale.\n");

    s
}

fn tmpl_tasks(r: &ProjectInitRequest) -> String {
    let mut s = String::new();
    s.push_str(&format!("# Tasks — {}\n\n", r.name));
    s.push_str("This is the living task list. Keep it current as work progresses.\n\n");
    s.push_str("**Status legend:**\n");
    s.push_str("- `[ ]` Not started\n");
    s.push_str("- `[~]` In progress\n");
    s.push_str("- `[x]` Done\n");
    s.push_str("- `[-]` Skipped or will not do\n\n---\n\n");

    s.push_str("## Phase 1 — Setup and planning\n\n");
    s.push_str("- [ ] Read all generated docs and fill in the gaps (PROJECT_BRIEF, PRODUCT_REQUIREMENTS, TECHNICAL_SPEC)\n");
    s.push_str("- [ ] Confirm the architecture approach in TECHNICAL_SPEC.md\n");
    s.push_str("- [ ] Define the core data model\n");
    s.push_str("- [ ] List the first 3–5 user-facing requirements in PRODUCT_REQUIREMENTS.md\n");
    s.push_str("- [ ] Set up the development environment\n");
    if r.starter_template != "blank" {
        s.push_str(&format!("- [ ] Verify the {} template builds and runs cleanly\n", template_label(&r.starter_template)));
    }
    s.push('\n');

    s.push_str("## Phase 2 — Core build\n\n");
    s.push_str("_Break each feature into the smallest useful steps. Add tasks as they become clear._\n\n");
    s.push_str("- [ ] _[Feature 1 — step 1]_\n");
    s.push_str("- [ ] _[Feature 1 — step 2]_\n");
    s.push_str("- [ ] _[Feature 2 — step 1]_\n\n");

    s.push_str("## Phase 3 — Polish and ship\n\n");
    s.push_str("- [ ] Verify all requirements from PRODUCT_REQUIREMENTS.md are met\n");
    s.push_str("- [ ] Test primary and secondary user flows end-to-end\n");
    s.push_str("- [ ] Review readability, accessibility, and error states\n");
    s.push_str("- [ ] Update README.md with accurate setup and usage instructions\n");
    s.push_str("- [ ] Confirm all docs (DECISION_LOG, SESSION_LOG) are up to date\n\n");

    s.push_str("---\n\n## Backlog\n\n");
    s.push_str("_Ideas and future tasks that are not yet prioritised:_\n\n");
    s.push_str("- _[Idea]_\n");

    s
}

fn tmpl_decision_log(r: &ProjectInitRequest, today: &str) -> String {
    let mut s = String::new();
    s.push_str(&format!("# Decision Log — {}\n\n", r.name));
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
    s.push_str("See TECHNICAL_SPEC.md for full stack details.\n");

    s
}

fn tmpl_session_log() -> String {
    let mut s = String::new();
    s.push_str("# Session Log\n\n");
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

fn tmpl_project_stage(today: &str) -> String {
    let mut s = String::new();
    s.push_str("# Project Stage\n\n");
    s.push_str("Track the current phase of the project and what has been completed.\n");
    s.push_str("Update this at the end of each phase or when something significant shifts.\n\n");
    s.push_str("---\n\n");
    s.push_str(&format!("## Current stage: Planning\n\n**Started:** {today}  \n"));
    s.push_str("**Target:** Setup complete and core build ready to begin\n\n");
    s.push_str("---\n\n## What has been done\n\n");
    s.push_str("- Project initialised with base documentation\n");
    s.push_str("- CLAUDE.md, PROJECT_BRIEF.md, TASKS.md, and supporting docs generated\n\n");
    s.push_str("## In progress\n\n");
    s.push_str("- Reviewing and filling in project documentation\n");
    s.push_str("- Confirming architecture and technology choices\n\n");
    s.push_str("## Up next\n\n");
    s.push_str("- Complete TECHNICAL_SPEC.md and PRODUCT_REQUIREMENTS.md\n");
    s.push_str("- Begin Phase 1 tasks in TASKS.md\n\n");
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

fn tmpl_start_prompt(r: &ProjectInitRequest) -> String {
    let mut s = String::new();
    s.push_str(&format!("# Project Start Prompt — {}\n\n", r.name));
    s.push_str("Use this prompt at the start of a new Claude Code session.\n\n");
    s.push_str("**Option A** — Paste directly into a new Claude session.  \n");
    s.push_str("**Option B** — Use the Session tab in Project Tracker (it uses this prompt automatically).\n\n");
    s.push_str("---\n\n## Prompt\n\n---\n\n");

    s.push_str(&format!("You are working on **{}**, a {} project.\n\n", r.name, project_type_label(&r.project_type)));

    if !r.description.trim().is_empty() {
        s.push_str(&format!("{}\n\n", r.description));
    }
    if !r.main_goal.trim().is_empty() {
        s.push_str(&format!("**Goal:** {}\n\n", r.main_goal));
    }

    s.push_str("Before we begin, please:\n\n");
    s.push_str("1. Read **CLAUDE.md** — project context, stack details, and working preferences\n");
    s.push_str("2. Read **TASKS.md** — identify what is in progress or should be picked up next\n");
    s.push_str("3. Read **PROJECT_STAGE.md** — understand the current phase\n");
    s.push_str("4. Briefly summarise what you have understood (current task, current stage, any blockers)\n");
    s.push_str("5. Ask what we are working on today\n\n");
    s.push_str("Do not start writing or changing code until you have read those files and confirmed the plan.\n\n");
    s.push_str("When you complete each chunk of work, report testing honestly using the Testing Standard\n");
    s.push_str("in CLAUDE.md. Build passing is not the same as tested — say exactly what was verified.\n\n");
    s.push_str("---\n\n");

    // Context block
    s.push_str("## Quick context\n\n");
    s.push_str(&format!("**Stack:** {}{}\n", template_label(&r.starter_template), add_ons_inline(&r.add_ons)));
    if !r.constraints.trim().is_empty() {
        s.push_str(&format!("**Constraints:** {}\n", r.constraints));
    }
    if !r.coding_style.trim().is_empty() {
        s.push_str(&format!("**Coding style:** {}\n", r.coding_style));
    }
    if !r.ui_style.trim().is_empty() {
        s.push_str(&format!("**UI style:** {}\n", r.ui_style));
    }
    s.push('\n');

    s.push_str("---\n\n## Useful prompts for different situations\n\n");
    s.push_str("**Starting a new feature:**\n");
    s.push_str("> Read the docs, then propose a task breakdown for [feature]. ");
    s.push_str("Keep it minimal and ask clarifying questions before we start.\n\n");
    s.push_str("**Picking up from a previous session:**\n");
    s.push_str("> Read SESSION_LOG.md and TASKS.md. Tell me what was last worked on and what the most important next step is.\n\n");
    s.push_str("**Health check:**\n");
    s.push_str("> Read all the docs and give me a brief project health check — what is done, what is blocked, what is unclear.\n\n");
    s.push_str("**Reviewing before shipping:**\n");
    s.push_str("> Read PRODUCT_REQUIREMENTS.md and cross-check it against the codebase. List anything that is missing or incomplete.\n");

    s
}

fn tmpl_readme(r: &ProjectInitRequest) -> String {
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

    s.push_str("---\n\n## Documentation\n\n");
    s.push_str("This project uses structured markdown docs for project management and AI-assisted development.\n\n");
    s.push_str("| Doc | Purpose |\n");
    s.push_str("|-----|---------|\n");
    s.push_str("| [CLAUDE.md](CLAUDE.md) | Context for Claude Code — read this first |\n");
    s.push_str("| [PROJECT_BRIEF.md](PROJECT_BRIEF.md) | What this project is and why it exists |\n");
    s.push_str("| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | Feature requirements |\n");
    s.push_str("| [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md) | Architecture and technical decisions |\n");
    s.push_str("| [TASKS.md](TASKS.md) | Current task list |\n");
    s.push_str("| [DECISION_LOG.md](DECISION_LOG.md) | Key decisions and rationale |\n");
    s.push_str("| [SESSION_LOG.md](SESSION_LOG.md) | Working session notes |\n\n");

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
    s.push_str("2. PROJECT_BRIEF.md — what and why\n");
    s.push_str("3. PRODUCT_REQUIREMENTS.md — what needs to be built\n");
    s.push_str("4. TECHNICAL_SPEC.md — how it will be built\n");
    s.push_str("5. TASKS.md — current task list\n");
    s.push_str("6. RISKS_ASSUMPTIONS_DEPENDENCIES.md — known constraints\n\n");
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
    s.push_str("Once confirmed, update TASKS.md and begin with the first task.\n\n");
    s.push_str("## Output\n\n");
    s.push_str("- A summary of gaps found and questions resolved\n");
    s.push_str("- An updated TASKS.md with a concrete Phase 1 task list\n");
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
    s.push_str("5. If a significant decision was made, log it in DECISION_LOG.md\n\n");
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

    // add_ons_inline ───────────────────────────────────────────────────────────

    #[test]
    fn add_ons_inline_empty() {
        assert_eq!(add_ons_inline(&[]), "");
    }

    #[test]
    fn add_ons_inline_single() {
        assert_eq!(add_ons_inline(&["Stripe".to_string()]), " · Stripe");
    }

    #[test]
    fn add_ons_inline_multiple() {
        assert_eq!(
            add_ons_inline(&["Supabase".to_string(), "Stripe".to_string()]),
            " · Supabase, Stripe",
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
}
