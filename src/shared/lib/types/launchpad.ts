// ── Project init ──────────────────────────────────────────────────────────────

/** Matches ProjectInitRequest in project_init.rs — fields are snake_case */
export interface ProjectInitRequest {
  name: string;
  description: string;
  project_type: string;
  main_goal: string;
  starter_template: string;
  add_ons: string[];
  constraints: string;
  coding_style: string;
  ui_style: string;
  create_git_repo: boolean;
  create_claude_skills: boolean;
  /** "bare_bones" | "standard" | "fuller" — defaults to "standard" if omitted */
  template_mode?: 'bare_bones' | 'standard' | 'fuller';
}

export interface ProjectInitResult {
  project_id: number;
  project_path: string;
  files_created: string[];
}

// ── Scaffold types ─────────────────────────────────────────────────────────────

export interface ScaffoldStep {
  label: string;
  /** "ok" | "error" | "skipped" */
  status: string;
  detail: string | null;
}

export interface ScaffoldResult {
  project_path: string;
  slug: string;
  github_url: string | null;
  vercel_project_url: string | null;
  supabase_project_id: string | null;
  supabase_db_password: string | null;
  steps: ScaffoldStep[];
}

/** Returned by scaffold_full_project — combines scaffold + docs/skills + DB record */
export interface FullScaffoldResult {
  project_id: number;
  project_path: string;
  files_created: string[];
  github_url: string | null;
  vercel_project_url: string | null;
  supabase_project_id: string | null;
  supabase_db_password: string | null;
  scaffold_steps: ScaffoldStep[];
}

// ── Discovery ─────────────────────────────────────────────────────────────────

export interface DiscoveredRepo {
  name: string;
  path: string;
  is_valid_git: boolean;
  current_branch: string | null;
  is_dirty: boolean;
  last_commit_date: string | null;
  last_commit_message: string | null;
  already_tracked: boolean;
}
