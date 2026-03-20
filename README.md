# Project Tracker

A macOS desktop app for managing AI-assisted development projects. Built with Tauri v2 (Rust backend) and React/TypeScript frontend, storing all data locally in SQLite — no cloud, no accounts.

![Status: Active](https://img.shields.io/badge/status-active-brightgreen)
![Platform: macOS](https://img.shields.io/badge/platform-macOS-blue)

## What it does

Tracks your vibe-coding / AI-assisted projects across their full lifecycle: from idea through planning, active development, and completion. Key features:

- **Dashboard** — at-a-glance health: active projects, stale repos, recent git activity
- **Project management** — status tracking, git repo linking, scan history, notes
- **AI planning** — assembles a structured prompt from your project docs and methodology blocks, calls the Claude CLI, then imports the response as structured phases, tasks, and risks into the DB
- **Document scaffold** — auto-generates 8 planning docs per project (operating standard, brief, architecture notes, etc.) on creation
- **Discover** — scans a directory tree for git repos and bulk-imports new projects
- **One-click launchers** — open project in VS Code/Cursor/Zed, Terminal/iTerm, or drop straight into a Claude session
- **Export / Import** — portable JSON backup of all project data

## Stack

| Layer | Technology |
|-------|------------|
| Desktop shell | Tauri v2 |
| Backend | Rust — rusqlite (bundled SQLite), serde |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS v3 |
| Routing | react-router-dom v6 |
| Icons | lucide-react |

All database operations run in Rust via `rusqlite`. The frontend calls Tauri commands via `invoke()` — no Node.js database access.

## Architecture highlights

- `src-tauri/src/commands.rs` — all `#[tauri::command]` handlers (~35 commands)
- `src-tauri/src/db.rs` — SQL schema, migrations, and data models
- `src-tauri/src/git.rs` — git scanning via `std::process::Command`
- `src/lib/api.ts` — typed `invoke()` wrappers for the entire command surface
- `src/lib/types.ts` — shared TypeScript types and enum constants

The AI planning pipeline: user edits methodology blocks and project docs → `assemble_planning_prompt` builds a structured prompt → app spawns Claude CLI in a terminal → user pastes the response back → `import_plan_response` parses and writes phases/tasks/risks to SQLite with transaction safety.

## Running locally

Requires [Rust](https://rustup.rs/) and [Node.js](https://nodejs.org/).

```bash
npm install
npm run tauri dev
```

Production build:

```bash
npm run tauri build
# Output: src-tauri/target/release/bundle/
```

> **Note:** The app is unsigned. On first launch macOS may show a Gatekeeper warning. Right-click → Open, or run: `xattr -cr "path/to/Project Tracker.app"`

## Data location

```
~/Library/Application Support/com.glen.projecttracker/projects.db
```
