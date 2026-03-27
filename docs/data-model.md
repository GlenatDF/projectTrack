# Data Model

Local SQLite database at `~/Library/Application Support/com.glen.projecttracker/projects.db`.

All timestamps are ISO-8601 strings (`TEXT`). Booleans are `INTEGER` (0/1).

---

## Tables

### `projects`
Core record for each tracked project.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | INTEGER PK | autoincrement | |
| `name` | TEXT | — | required |
| `description` | TEXT | `''` | |
| `local_repo_path` | TEXT | `''` | absolute path on disk |
| `status` | TEXT | `'active'` | `active` \| `paused` \| `done` \| `abandoned` |
| `phase` | TEXT | `'idea'` | `idea` \| `planning` \| `build` \| `polish` \| `shipped` |
| `priority` | TEXT | `'medium'` | `low` \| `medium` \| `high` |
| `ai_tool` | TEXT | `'claude'` | which AI the project uses |
| `current_task` | TEXT | `''` | free-text field (pre-planning era) |
| `next_task` | TEXT | `''` | free-text field (pre-planning era) |
| `blocker` | TEXT | `''` | free-text field |
| `notes` | TEXT | `''` | free-text field |
| `created_at` | TEXT | now | |
| `updated_at` | TEXT | now | |
| `last_scanned_at` | TEXT | NULL | set by git scan |
| `claude_startup_prompt` | TEXT | `''` | extra context prepended to opener |
| `claude_prompt_mode` | TEXT | `'append'` | `append` \| `replace` |
| `claude_priority_files` | TEXT | `''` | key files surfaced in opener |
| `session_handoff_notes` | TEXT | `''` | short session notes for opener |
| `startup_command` | TEXT | `'claude'` | CLI command to launch AI |
| `preferred_terminal` | TEXT | `''` | `iterm` \| `terminal` \| `''` |
| `claude_session_id` | TEXT | `''` | active Claude session UUID; empty = no session |

---

### `project_scans`
Snapshot of git state captured each time a project is scanned.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `project_id` | INTEGER FK → projects | CASCADE delete |
| `scanned_at` | TEXT | |
| `current_branch` | TEXT | NULL if not a repo |
| `is_dirty` | INTEGER | 1 if working tree has changes |
| `changed_files_count` | INTEGER | |
| `untracked_files_count` | INTEGER | |
| `staged_files_count` | INTEGER | |
| `last_commit_hash` | TEXT | |
| `last_commit_date` | TEXT | |
| `last_commit_message` | TEXT | |
| `ahead_count` | INTEGER | commits ahead of remote |
| `behind_count` | INTEGER | commits behind remote |
| `is_valid_repo` | INTEGER | 0 if path is not a git repo |
| `error_message` | TEXT | populated when scan fails |

---

### `project_documents`
Per-project structured documents (scaffold docs, PRDs, etc.).

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `project_id` | INTEGER FK → projects | CASCADE delete |
| `doc_type` | TEXT | see Doc Types below |
| `title` | TEXT | |
| `content` | TEXT | markdown |
| `status` | TEXT | `draft` \| `ready` \| `approved` |
| `sort_order` | INTEGER | |
| `created_at` / `updated_at` | TEXT | |

**Unique constraint**: `(project_id, doc_type)` — one doc per type per project.

**Doc types**: `vision`, `requirements`, `architecture`, `ux_design`, `api_design`, `data_model`, `test_plan`, `operating_standard`

---

### `project_phases`
Planning phases imported from an AI plan run or created manually.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `project_id` | INTEGER FK → projects | CASCADE delete |
| `phase_number` | INTEGER | 1-based; unique per project |
| `name` | TEXT | |
| `description` | TEXT | |
| `goals` | TEXT | JSON array of strings |
| `estimated_duration` | TEXT | free text, e.g. `"2 weeks"` |
| `depends_on_phase` | INTEGER | phase_number (not FK) |
| `status` | TEXT | `pending` \| `in_progress` \| `paused` \| `blocked` \| `done` \| `skipped` |
| `ai_generated` | INTEGER | 1 if from AI plan run |
| `user_modified` | INTEGER | 1 = preserved on re-import |
| `created_at` | TEXT | |

**Unique constraint**: `(project_id, phase_number)`

---

### `project_tasks`
Individual tasks within a phase (or phase-less).

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `project_id` | INTEGER FK → projects | CASCADE delete |
| `phase_id` | INTEGER FK → project_phases | SET NULL on phase delete |
| `title` | TEXT | |
| `description` | TEXT | |
| `category` | TEXT | `build` \| `design` \| `research` \| `ops` \| `test` \| `docs` |
| `effort_estimate` | TEXT | free text |
| `status` | TEXT | `pending` \| `in_progress` \| `paused` \| `blocked` \| `done` \| `skipped` |
| `sort_order` | INTEGER | |
| `ai_generated` | INTEGER | |
| `user_modified` | INTEGER | 1 = preserved on re-import |
| `created_at` | TEXT | |
| `progress_note` | TEXT | latest free-text note |
| `started_at` | TEXT | set on first `in_progress` transition |
| `completed_at` | TEXT | set on `done` transition; cleared on `pending` |
| `last_worked_at` | TEXT | updated on any active status change |

**Status transition rules** (enforced in `update_task_status`):
- `→ in_progress`: sets `started_at` (COALESCE, not overwritten) + `last_worked_at`
- `→ done`: sets `completed_at` + `last_worked_at`
- `→ paused` / `blocked`: sets `last_worked_at`
- `→ pending`: clears `completed_at`

---

### `project_risks`
Risks identified during planning.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `project_id` | INTEGER FK → projects | CASCADE delete |
| `title` | TEXT | |
| `description` | TEXT | |
| `likelihood` | TEXT | `low` \| `medium` \| `high` |
| `impact` | TEXT | `low` \| `medium` \| `high` |
| `mitigation` | TEXT | |
| `status` | TEXT | `open` \| `mitigated` \| `accepted` \| `closed` |
| `ai_generated` | INTEGER | |
| `created_at` | TEXT | |

---

### `project_assumptions`
Assumptions captured during planning.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `project_id` | INTEGER FK → projects | CASCADE delete |
| `title` | TEXT | |
| `description` | TEXT | |
| `category` | TEXT | `general` \| `technical` \| `business` |
| `status` | TEXT | `active` \| `validated` \| `invalidated` |
| `ai_generated` | INTEGER | |
| `created_at` | TEXT | |

---

### `ai_plan_runs`
Audit log of each AI plan generation attempt.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `project_id` | INTEGER FK → projects | CASCADE delete |
| `template_slug` | TEXT | e.g. `project_planning_v1` |
| `prompt_sent` | TEXT | full prompt text |
| `raw_response` | TEXT | raw Claude output |
| `parsed_ok` | INTEGER | 1 if import succeeded |
| `error_message` | TEXT | populated on parse failure |
| `phases_count` | INTEGER | |
| `tasks_count` | INTEGER | |
| `risks_count` | INTEGER | |
| `created_at` | TEXT | |

---

### `methodology_blocks`
Reusable content blocks injected into planning prompts.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `slug` | TEXT UNIQUE | identifier |
| `title` | TEXT | |
| `category` | TEXT | `general` \| `planning` \| `delivery` |
| `content` | TEXT | markdown injected into prompts |
| `is_active` | INTEGER | 0 = excluded from prompts |
| `sort_order` | INTEGER | |
| `created_at` / `updated_at` | TEXT | |

---

### `planning_prompt_templates`
Templates used to assemble the AI planning prompt.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `slug` | TEXT UNIQUE | |
| `name` | TEXT | |
| `system_prompt` | TEXT | |
| `user_prompt` | TEXT | handlebars-style template |
| `output_format_spec` | TEXT | JSON schema hint for Claude |
| `model_hint` | TEXT | default `claude-sonnet-4-6` |
| `version` | INTEGER | |
| `is_active` | INTEGER | |
| `created_at` | TEXT | |

---

### `app_settings`
Key-value store for global application settings.

| Column | Type | Notes |
|--------|------|-------|
| `key` | TEXT PK | |
| `value` | TEXT | always a string; parse as needed |

---

## Entity Relationship Summary

```
projects
  ├── project_scans          (CASCADE delete)
  ├── project_documents      (CASCADE delete, unique per doc_type)
  ├── project_phases         (CASCADE delete)
  │     └── project_tasks    (SET NULL on phase delete)
  ├── project_tasks          (CASCADE delete)
  ├── project_risks          (CASCADE delete)
  ├── project_assumptions    (CASCADE delete)
  └── ai_plan_runs           (CASCADE delete)

methodology_blocks            (global, not project-scoped)
planning_prompt_templates     (global, not project-scoped)
app_settings                  (global key-value)
```

---

## Indexes

| Index | Table | Columns |
|-------|-------|---------|
| `idx_project_documents_pid` | project_documents | project_id |
| `idx_project_documents_type` | project_documents | (project_id, doc_type) UNIQUE |
| `idx_project_phases_pid` | project_phases | project_id |
| `idx_project_tasks_pid` | project_tasks | project_id |
| `idx_project_tasks_phase` | project_tasks | phase_id |
| `idx_project_risks_pid` | project_risks | project_id |
| `idx_project_assumptions_pid` | project_assumptions | project_id |
| `idx_ai_plan_runs_pid` | ai_plan_runs | project_id |
