// ── Enums ─────────────────────────────────────────────────────────────────────

export type Status = 'active' | 'blocked' | 'paused' | 'done';
export type Phase =
  | 'idea'
  | 'planning'
  | 'scaffolding'
  | 'core_build'
  | 'debugging'
  | 'testing'
  | 'polishing'
  | 'shipped';
export type Priority = 'low' | 'medium' | 'high';
export type AiTool = 'claude' | 'chatgpt' | 'both' | 'other';

// ── Domain types ──────────────────────────────────────────────────────────────

export interface Project {
  id: number;
  name: string;
  description: string;
  local_repo_path: string;
  status: Status;
  phase: Phase;
  priority: Priority;
  ai_tool: AiTool;
  current_task: string;
  next_task: string;
  blocker: string;
  notes: string;
  created_at: string;
  updated_at: string;
  last_scanned_at: string | null;
  claude_startup_prompt: string;
  claude_prompt_mode: 'append' | 'replace';
  claude_priority_files: string;
  session_handoff_notes: string;
  startup_command: string;
  preferred_terminal: string;
}

export interface ProjectScan {
  id: number;
  project_id: number;
  scanned_at: string;
  current_branch: string | null;
  is_dirty: boolean;
  changed_files_count: number;
  untracked_files_count: number;
  staged_files_count: number;
  last_commit_hash: string | null;
  last_commit_date: string | null;
  last_commit_message: string | null;
  ahead_count: number | null;
  behind_count: number | null;
  is_valid_repo: boolean;
  error_message: string | null;
}

export interface DashboardStats {
  total: number;
  active: number;
  blocked: number;
  paused: number;
  done: number;
  stale: number;
  dirty_repos: number;
}

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

export interface ProjectFormData {
  name: string;
  description: string;
  local_repo_path: string;
  status: Status;
  phase: Phase;
  priority: Priority;
  ai_tool: AiTool;
  current_task: string;
  next_task: string;
  blocker: string;
  notes: string;
  claude_startup_prompt: string;
  claude_prompt_mode: 'append' | 'replace';
  claude_priority_files: string;
  session_handoff_notes: string;
  startup_command: string;
  preferred_terminal: string;
}

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
}

export interface ProjectInitResult {
  project_id: number;
  project_path: string;
  files_created: string[];
}

// ── Display helpers ───────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<Status, string> = {
  active: 'Active',
  blocked: 'Blocked',
  paused: 'Paused',
  done: 'Done',
};

export const PHASE_LABELS: Record<Phase, string> = {
  idea: 'Idea',
  planning: 'Planning',
  scaffolding: 'Scaffolding',
  core_build: 'Core Build',
  debugging: 'Debugging',
  testing: 'Testing',
  polishing: 'Polishing',
  shipped: 'Shipped',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const AI_TOOL_LABELS: Record<AiTool, string> = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  both: 'Both',
  other: 'Other',
};

export const ALL_STATUSES: Status[] = ['active', 'blocked', 'paused', 'done'];
export const ALL_PHASES: Phase[] = [
  'idea', 'planning', 'scaffolding', 'core_build',
  'debugging', 'testing', 'polishing', 'shipped',
];
export const ALL_PRIORITIES: Priority[] = ['low', 'medium', 'high'];
export const ALL_AI_TOOLS: AiTool[] = ['claude', 'chatgpt', 'both', 'other'];

// ── Planning types ─────────────────────────────────────────────────────────────

export type DocStatus = 'draft' | 'reviewed' | 'final';
export type TaskStatus = 'pending' | 'in_progress' | 'paused' | 'blocked' | 'done' | 'skipped';
export type PhaseStatus = 'pending' | 'in_progress' | 'done' | 'skipped';
export type RiskLevel = 'low' | 'medium' | 'high';
export type TaskCategory =
  | 'build' | 'design' | 'test' | 'infra' | 'docs' | 'review' | 'deploy' | 'other';

export interface MethodologyBlock {
  id: number;
  slug: string;
  title: string;
  category: string;
  content: string;
  is_active: boolean;
  sort_order: number;
}

export interface ProjectDocument {
  id: number;
  project_id: number;
  doc_type: string;
  title: string;
  content: string;
  status: DocStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectPhase {
  id: number;
  project_id: number;
  phase_number: number;
  name: string;
  description: string;
  goals: string; // JSON array string
  estimated_duration: string;
  depends_on_phase: number | null;
  status: PhaseStatus;
  ai_generated: boolean;
  user_modified: boolean;
  created_at: string;
}

export interface ProjectTask {
  id: number;
  project_id: number;
  phase_id: number | null;
  title: string;
  description: string;
  category: TaskCategory;
  effort_estimate: string;
  status: TaskStatus;
  sort_order: number;
  ai_generated: boolean;
  user_modified: boolean;
  created_at: string;
  progress_note: string;
  started_at: string | null;
  completed_at: string | null;
  last_worked_at: string | null;
}

export interface ProjectRisk {
  id: number;
  project_id: number;
  title: string;
  description: string;
  likelihood: RiskLevel;
  impact: RiskLevel;
  mitigation: string;
  status: string;
  ai_generated: boolean;
  created_at: string;
}

export interface ProjectAssumption {
  id: number;
  project_id: number;
  title: string;
  description: string;
  category: string;
  status: string;
  ai_generated: boolean;
  created_at: string;
}

export interface AiPlanRun {
  id: number;
  project_id: number;
  template_slug: string;
  parsed_ok: boolean;
  error_message: string | null;
  phases_count: number;
  tasks_count: number;
  risks_count: number;
  created_at: string;
}

/** A planning task currently marked in_progress, with project context. */
export interface InProgressTask {
  id: number;
  project_id: number;
  project_name: string;
  title: string;
  category: string;
  status: TaskStatus;
}

export interface ImportPlanResult {
  phases_imported: number;
  tasks_imported: number;
  risks_imported: number;
  assumptions_imported: number;
  preserved_task_count: number;
  warnings: string[];
}

export interface AssembledPrompt {
  prompt: string;
  warnings: string[];
}

export interface ProjectPlan {
  phases: ProjectPhase[];
  tasks: ProjectTask[];
  risks: ProjectRisk[];
  assumptions: ProjectAssumption[];
}

// ── Claude session types ───────────────────────────────────────────────────────

export interface OpenerPrompt {
  prompt: string;
  session_id: string;
}

export interface SessionTurn {
  response: string;
  session_id: string;
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

export interface AppSettings {
  projects_dir?: string;
  vercel_token?: string;
  supabase_access_token?: string;
  supabase_org_id?: string;
}

// ── Planning display helpers ───────────────────────────────────────────────────

export const DOC_TYPE_LABELS: Record<string, string> = {
  brief:            'Project Brief',
  prd:              'Product Requirements',
  tech_spec:        'Technical Specification',
  ai_instructions:  'AI Instructions',
  risks:            'Risks / Assumptions / Dependencies',
  decisions:        'Decision Log',
  handoff:          'Session Handoff',
  scratchpad:       'Scratchpad',
  operating_standard: 'Operating Standard',
};

export const TASK_CATEGORY_COLORS: Record<TaskCategory, string> = {
  build:  'bg-blue-500/20 text-blue-300',
  design: 'bg-purple-500/20 text-purple-300',
  test:   'bg-green-500/20 text-green-300',
  infra:  'bg-orange-500/20 text-orange-300',
  docs:   'bg-yellow-500/20 text-yellow-300',
  review: 'bg-cyan-500/20 text-cyan-300',
  deploy: 'bg-rose-500/20 text-rose-300',
  other:  'bg-gray-500/20 text-gray-300',
};

export const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  low:    'bg-green-500/20 text-green-300',
  medium: 'bg-yellow-500/20 text-yellow-300',
  high:   'bg-red-500/20 text-red-300',
};

// ── Audits ────────────────────────────────────────────────────────────────────

export type AuditKind = 'full_codebase' | 'security' | 'performance' | 'reliability';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';
export type FindingClassification = 'confirmed' | 'likely' | 'needs_verification';
export type FindingStatus = 'open' | 'resolved' | 'wont_fix' | 'task_created';
export type FixSize = 'small' | 'medium' | 'large';

export interface AuditRecord {
  id: number;
  project_id: number;
  audit_kind: AuditKind;
  score: number | null;
  score_label: string;
  summary: string;
  /** JSON-encoded string array */
  strengths: string;
  /** JSON-encoded string array */
  recommendations: string;
  /** JSON-encoded string array */
  files_reviewed: string;
  raw_output: string;
  raw_json: string | null;
  created_at: string;
}

export interface AuditFinding {
  id: number;
  audit_id: number;
  project_id: number;
  severity: FindingSeverity;
  category: string;
  title: string;
  description: string;
  file_ref: string;
  impact: string;
  fix_size: FixSize | null;
  classification: FindingClassification;
  status: FindingStatus;
  task_id: number | null;
  created_at: string;
}

export interface AuditWithFindings {
  audit: AuditRecord;
  findings: AuditFinding[];
}

export interface AuditStoredResult {
  audit_id: number;
  findings_count: number;
}
