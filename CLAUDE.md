# CLAUDE.md — Launchpad

This file gives Claude Code context for this project.
Read it at the start of every session **before writing any code**.

---

## Overview

Launchpad is a macOS desktop app (Tauri v2 + React + TypeScript + SQLite) for scaffolding
and managing AI vibe-coding projects. It helps developers start new Claude-ready projects
with scaffolded docs and skills, track project status, and run planning workflows.

**Stack:**
- Tauri v2 (identifier: `com.glen.launchpad`)
- Rust backend: rusqlite (bundled), serde, serde_json, ureq
- Frontend: React 19, react-router-dom v6, Tailwind CSS v3, lucide-react, Vite
- No tauri-plugin-sql, no tauri-plugin-shell — all DB and process ops are in Rust

**DB location (runtime):** `~/Library/Application Support/com.glen.launchpad/projects.db`

---

## Key files

| File / Path | Purpose |
|-------------|---------|
| `src-tauri/src/lib.rs` | App setup, AppState (Mutex<Connection>) |
| `src-tauri/src/db.rs` | All SQL + data models |
| `src-tauri/src/commands.rs` | All `#[tauri::command]` handlers |
| `src-tauri/src/project_init.rs` | New project scaffolding: templates + skills |
| `src-tauri/src/scaffold.rs` | Next.js scaffold feature (gh, Vercel, Supabase) |
| `src-tauri/src/git.rs` | Git scanning via std::process::Command |
| `src/lib/api.ts` | Typed `invoke()` wrappers |
| `src/lib/types.ts` | TypeScript types and enum constants |
| `src/pages/` | React pages (Dashboard, ProjectDetail, Settings, etc.) |
| `src/components/` | Shared UI components |
| `src/components/NewProjectWizard.tsx` | 3-step wizard for creating new projects |
| `.claude/skills/` | Claude skills for this project |

---

## Session workflow

**At the start of each session:**
1. Read recent git log to understand what was last changed
2. Check the current branch and any uncommitted changes
3. Briefly summarise your understanding before making any changes

**During the session:**
- Implement only what was asked; do not refactor nearby code unless directed
- Keep changes focused and reviewable — one concern per edit
- Flag blockers immediately
- When uncertain about architecture or scope, propose options before deciding

**At the end of each session:**
- Confirm the build is clean (`npm run build` + `cargo build`)
- Report testing honestly using the Testing Standard below

---

## Common commands

```bash
npm run dev             # Start frontend dev server
npm run build           # TypeScript check + Vite build
cargo build             # Rust backend build (from src-tauri/ or project root with manifest path)
npm run tauri dev       # Start full Tauri dev app (frontend + backend)
npm run tauri build     # Production .app + .dmg
```

---

## Testing standard

**Build passing is not the same as tested.**

When reporting the outcome of any implementation chunk, always include a
**"Testing performed"** section structured exactly like this:

```
Testing performed
- Build/type checks:
    - [exact commands run, e.g. "npm run build — clean"]
- Manual testing:
    - [exact behaviours verified, e.g. "Opened wizard, clicked through steps, verified validation fires on empty name"]
- Automated tests:
    - [tests added or run, or "none — no test runner configured for this layer"]
- Limitations:
    - [what was not tested, e.g. "did not test backend error path manually"]
```

### What each category means

| Category | What it confirms | Does it prove the feature works? |
|----------|-----------------|----------------------------------|
| Build / type checks | Code compiles, types are valid | No |
| Manual functional testing | Actual user flows work in the running app | Yes — for verified paths |
| Automated tests | Logic is verified repeatably | Yes — for covered cases |

### Rules

1. Never say "tested" unless you specify what kind of testing and what was verified.
2. If only a build check was run, say that explicitly.
3. If manual testing was not performed (e.g. Tauri app was not launched), say so.
4. If no automated tests exist for the layer, say so — do not skip the section.
5. For UI changes, manual testing should cover as many of these as are relevant:
   - main happy path
   - validation states
   - loading / running states
   - success state
   - error state
   - disabled controls
   - light mode and dark mode readability
6. Add automated tests for pure logic/helpers when the test setup allows it.
7. Prefer small, specific, truthful testing notes over vague claims.

See `.claude/skills/testing-discipline/SKILL.md` for the full testing skill.

---

## Tauri command conventions

**Rust side:**
- All commands return `Result<T, String>` — no custom error types, map errors with `.map_err(|e| e.to_string())`
- Every new command must be registered in `lib.rs` `invoke_handler` **and** have a typed wrapper in `api.ts`
- Commands are thin orchestrators: put SQL logic in `db.rs`, process logic in dedicated modules

**TypeScript side (`api.ts`):**
- Wrappers are intentionally thin — just typed `invoke()` calls, no error handling inside them
- Error handling belongs at the callsite, not in the wrapper

**Callsite error handling patterns (use consistently):**
- User-facing mutations: `try/catch` → `setError(String(e))`
- Non-critical / fire-and-forget: `.catch(() => {})` or `.catch(() => fallbackValue)`
- Availability checks: `.catch(() => false)`

---

## Schema changes (SQLite / rusqlite)

Before writing any migration in `db.rs`:

1. Add columns as nullable or with a DEFAULT — never add NOT NULL without a DEFAULT in the same commit
2. Never drop or rename a column in the same commit that removes the code referencing it — decouple the two changes
3. Test the migration against the live DB at `~/Library/Application Support/com.glen.launchpad/projects.db`, not just a clean install
4. If backfilling existing rows, do it in the same migration function before any code assumes the new shape

---

## Working principles

- Prefer clear, readable code over clever code
- Leave the code you touch better than you found it — but only what you touch
- When in doubt, ask — do not guess on architecture, scope, or user intent
- Ship the smallest useful change and iterate
- If something feels wrong, flag it before pressing on
- All Tauri commands must be registered in `lib.rs` invoke_handler **and** have a typed wrapper in `api.ts`

---

## UI — always-on rules

These apply any time you write or edit a React component. No skill invocation needed.

1. **Check both modes.** Any coloured text class must be readable in dark *and* light mode — not just the mode you're looking at.
2. **`text-*-100` through `text-*-400` are dark-mode-only pastels.** Never place them on a tinted background without confirming the variant is covered in the light-mode override block in `src/index.css`. The override list covers `-100` through `-500` for all colour families — if you add a new colour class, check it is there.
3. **Selected and active states are the highest-risk spot.** Tinted highlight backgrounds (+20% opacity) make adjacent pale text nearly invisible. Use `text-slate-100` (which is overridden to dark in light mode) rather than a same-family pastel like `text-violet-200`.
4. For a full review of a component's readability and visual hierarchy, invoke the `ui-readability` skill.

---

## When to use skills

**This file** is for standing context that applies almost every time Claude touches this repo: architecture, key files, session workflow, build commands, testing standard, and non-negotiable working rules. If a rule should always be followed, it lives here.

**Skills** (`.claude/skills/`) are for reusable workflows, specialist review modes, or situation-specific procedures that only apply in certain contexts. A skill is invoked on purpose — not assumed to apply to every task.

Rules:
- Do not create a skill for every small preference — put permanent rules in CLAUDE.md
- Prefer one clear, well-scoped skill over three overlapping ones
- Avoid duplicating the same instruction in both CLAUDE.md and a skill
- A good skill has a clear "when to use it" condition and a specific procedure


### Skills in this project

| Skill | When to use it |
|-------|----------------|
| `focused-fix` | Use when the user asks to fix, debug, or make a specific feature/module/area work end-to-end. Triggers: 'make X work', 'fix the Y feature', 'the Z module is broken', 'focus on [area]'. Not for quick single-bug fixes — this is for systematic deep-dive repair across all files and dependencies. |
## Skills in this repo

| Skill | When to use it |
|-------|----------------|
| `testing-discipline` | When reporting the outcome of any implementation chunk — enforces honest testing notes |
| `ui-readability` | When reviewing or improving UI components, colour, contrast, or visual hierarchy |
| `feature-chunking` | When planning a non-trivial feature — explore first, break into reviewable chunks, implement one at a time |
| `codebase-audit` | When doing a structured quality review — rates the codebase and surfaces correctness, security, and reliability gaps |
