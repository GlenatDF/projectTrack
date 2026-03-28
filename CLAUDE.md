# CLAUDE.md — Project Track

This file gives Claude Code context for this project.
Read it at the start of every session **before writing any code**.

---

## Overview

Project Track is a macOS desktop app (Tauri v2 + React + TypeScript + SQLite) for managing
AI vibe-coding projects. It helps developers track project status, run planning workflows,
and start new Claude-ready projects with scaffolded docs and skills.

**Stack:**
- Tauri v2 (identifier: `com.glen.projecttracker`)
- Rust backend: rusqlite (bundled), serde, serde_json, ureq
- Frontend: React 19, react-router-dom v6, Tailwind CSS v3, lucide-react, Vite
- No tauri-plugin-sql, no tauri-plugin-shell — all DB and process ops are in Rust

**DB location (runtime):** `~/Library/Application Support/com.glen.projecttracker/projects.db`

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

## Working principles

- Prefer clear, readable code over clever code
- Leave the code you touch better than you found it — but only what you touch
- When in doubt, ask — do not guess on architecture, scope, or user intent
- Ship the smallest useful change and iterate
- If something feels wrong, flag it before pressing on
- All Tauri commands must be registered in `lib.rs` invoke_handler **and** have a typed wrapper in `api.ts`
